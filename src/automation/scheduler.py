"""
Task Scheduler - manages posting queue with round-robin distribution.
Handles multi-account orchestration with proper delays and limits.
"""
import asyncio
import random
from datetime import datetime, timedelta
from typing import Any
from dataclasses import dataclass, field
from collections import deque
from enum import Enum

from loguru import logger

from src.config import settings
from src.account.manager import Account, AccountManager, AccountStatus
from src.automation.facebook import PostContent


class TaskStatus(str, Enum):
    """Task status enum."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class PostTask:
    """A single posting task."""
    id: str
    group_url: str
    content: PostContent
    account_id: str | None = None  # Assigned later
    status: TaskStatus = TaskStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str | None = None
    error: str | None = None
    retry_count: int = 0
    max_retries: int = 3

    def can_retry(self) -> bool:
        return self.retry_count < self.max_retries


@dataclass
class GroupQueue:
    """Queue of groups to post to."""
    groups: list[str]
    last_shuffle: datetime | None = None

    def __post_init__(self):
        self._shuffle()

    def _shuffle(self):
        """Shuffle groups (daily random sort)."""
        random.shuffle(self.groups)
        self.last_shuffle = datetime.now()
        logger.debug(f"Groups shuffled ({len(self.groups)} groups)")

    def get_next(self) -> str | None:
        """Get next group, reshuffling if needed."""
        if not self.groups:
            return None

        # Reshuffle daily
        if self.last_shuffle:
            if (datetime.now() - self.last_shuffle) > timedelta(days=1):
                self._shuffle()

        return self.groups.pop(0)

    def add_back(self, group_url: str):
        """Add group back to end of queue."""
        if group_url not in self.groups:
            self.groups.append(group_url)


class TaskScheduler:
    """
    Manages task scheduling with round-robin account distribution.

    Features:
    - Round-robin account assignment
    - Proper delays between posts/groups/accounts
    - Activity limit enforcement
    - Auto-pause on too many bans
    """

    def __init__(self, account_manager: AccountManager):
        self.account_manager = account_manager
        self.config = settings

        # Task queue
        self.pending_tasks: deque[PostTask] = deque()
        self.completed_tasks: list[PostTask] = []
        self.failed_tasks: list[PostTask] = []

        # Account tracking
        self._account_index = 0
        self._last_account_times: dict[str, datetime] = {}
        self._last_group_times: dict[str, datetime] = {}

        # Control
        self._running = False
        self._paused = False

    async def add_tasks(
        self,
        groups: list[str],
        content: PostContent,
        task_id_prefix: str = "task"
    ) -> list[PostTask]:
        """
        Add posting tasks for multiple groups.

        Args:
            groups: List of group URLs
            content: Post content
            task_id_prefix: Prefix for task IDs

        Returns:
            List of created tasks
        """
        tasks = []
        for i, group_url in enumerate(groups):
            task = PostTask(
                id=f"{task_id_prefix}_{i}_{datetime.now().strftime('%H%M%S')}",
                group_url=group_url,
                content=content
            )
            self.pending_tasks.append(task)
            tasks.append(task)

        logger.info(f"Added {len(tasks)} tasks to queue")
        return tasks

    async def get_next_task(self) -> PostTask | None:
        """Get the next task from queue."""
        if not self.pending_tasks:
            return None

        return self.pending_tasks.popleft()

    async def get_available_account(self) -> Account | None:
        """
        Get the next available account using round-robin.

        Returns:
            Account that can perform actions, or None if no accounts available
        """
        accounts = await self.account_manager.get_available_accounts()

        if not accounts:
            logger.warning("No available accounts")
            return None

        # Round-robin selection
        start_index = self._account_index
        attempts = 0

        while attempts < len(accounts):
            account = accounts[self._account_index % len(accounts)]
            self._account_index = (self._account_index + 1) % len(accounts)
            attempts += 1

            # Check if account has waited long enough since last action
            if await self._can_use_account(account):
                return account

        logger.debug("All accounts need to wait")
        return None

    async def _can_use_account(self, account: Account) -> bool:
        """Check if account can be used (respecting delays)."""
        if not account.can_post():
            return False

        last_time = self._last_account_times.get(account.id)
        if last_time:
            min_delay, max_delay = self.config.activity_limits.delays.between_accounts_seconds
            min_wait = timedelta(seconds=min_delay)

            if datetime.now() - last_time < min_wait:
                return False

        return True

    async def assign_account_to_task(self, task: PostTask) -> bool:
        """
        Assign an available account to a task.

        Returns:
            True if account was assigned, False otherwise
        """
        account = await self.get_available_account()

        if not account:
            return False

        task.account_id = account.id
        logger.debug(f"Assigned account {account.id} to task {task.id}")
        return True

    def record_task_completion(self, task: PostTask, success: bool, error: str | None = None):
        """Record task completion."""
        task.completed_at = datetime.now().isoformat()

        if success:
            task.status = TaskStatus.COMPLETED
            self.completed_tasks.append(task)

            # Update timing
            if task.account_id:
                self._last_account_times[task.account_id] = datetime.now()
            self._last_group_times[task.group_url] = datetime.now()

        else:
            task.status = TaskStatus.FAILED
            task.error = error
            task.retry_count += 1

            if task.can_retry():
                # Add back to queue for retry
                task.status = TaskStatus.PENDING
                self.pending_tasks.append(task)
                logger.info(f"Task {task.id} will be retried ({task.retry_count}/{task.max_retries})")
            else:
                self.failed_tasks.append(task)
                logger.warning(f"Task {task.id} failed permanently: {error}")

    async def get_delay_before_next(self) -> float:
        """Get the delay needed before next action."""
        min_delay, max_delay = self.config.activity_limits.delays.between_groups_minutes

        # Gaussian random for more natural distribution
        mean = (min_delay + max_delay) / 2
        std_dev = (max_delay - min_delay) / 4

        delay_minutes = random.gauss(mean, std_dev)
        delay_minutes = max(min_delay, min(max_delay, delay_minutes))

        return delay_minutes * 60  # Convert to seconds

    async def should_pause(self) -> bool:
        """Check if automation should be paused."""
        if self._paused:
            return True

        return await self.account_manager.should_pause_automation()

    def pause(self):
        """Pause the scheduler."""
        self._paused = True
        logger.info("Scheduler paused")

    def resume(self):
        """Resume the scheduler."""
        self._paused = False
        logger.info("Scheduler resumed")

    def get_stats(self) -> dict[str, Any]:
        """Get scheduler statistics."""
        return {
            "pending": len(self.pending_tasks),
            "completed": len(self.completed_tasks),
            "failed": len(self.failed_tasks),
            "paused": self._paused,
        }


class AccountPool:
    """
    Manages a pool of accounts with browser contexts.

    Limits concurrent accounts to prevent hardware bans.
    """

    def __init__(self, max_concurrent: int | None = None):
        self.max_concurrent = max_concurrent or settings.multi_account.max_concurrent_accounts
        self._active_contexts: dict[str, Any] = {}  # account_id -> BrowserContext
        self._semaphore = asyncio.Semaphore(self.max_concurrent)

    async def acquire(self, account_id: str) -> bool:
        """
        Acquire a slot for an account.

        Returns:
            True if slot acquired, False if pool is full
        """
        if len(self._active_contexts) >= self.max_concurrent:
            if account_id not in self._active_contexts:
                return False

        await self._semaphore.acquire()
        return True

    def release(self, account_id: str):
        """Release an account's slot."""
        if account_id in self._active_contexts:
            del self._active_contexts[account_id]
        self._semaphore.release()

    def register_context(self, account_id: str, context: Any):
        """Register a browser context for an account."""
        self._active_contexts[account_id] = context

    def get_context(self, account_id: str) -> Any | None:
        """Get browser context for an account."""
        return self._active_contexts.get(account_id)

    @property
    def active_count(self) -> int:
        return len(self._active_contexts)

    @property
    def available_slots(self) -> int:
        return self.max_concurrent - len(self._active_contexts)
