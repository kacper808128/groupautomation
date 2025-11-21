"""
Facebook Group Automation - Main Application
Anti-Ban Stack 2025

This is the main entry point for the automation system.
Implements the full posting workflow with all anti-ban measures.
"""
import asyncio
import random
import sys
from pathlib import Path
from datetime import datetime

from loguru import logger

from src.config import settings
from src.browser.manager import BrowserManager, ProxyManager
from src.fingerprint.manager import fingerprint_manager
from src.account.manager import AccountManager, SessionManager, Account, AccountStatus
from src.automation.facebook import FacebookAutomation, PostContent, BanDetectedException
from src.automation.scheduler import TaskScheduler, AccountPool, PostTask
from src.automation.human_behavior import bounded_gaussian


# Configure logging
def setup_logging():
    """Configure logging with loguru."""
    log_path = Path(settings.logging.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # Remove default handler
    logger.remove()

    # Add console handler
    logger.add(
        sys.stderr,
        level=settings.logging.level,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>"
    )

    # Add file handler
    logger.add(
        str(log_path),
        level="DEBUG",
        rotation="10 MB",
        retention="7 days",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}"
    )


class FacebookGroupAutomation:
    """
    Main automation orchestrator.

    Coordinates browser management, account handling, and posting workflow
    with all anti-ban measures.

    Usage:
        async with FacebookGroupAutomation() as automation:
            # Add accounts
            await automation.add_account(
                "account1",
                "email@example.com",
                proxy="ip:port:user:pass",
                storage_state="sessions/account1.json"
            )

            # Create posts
            await automation.post_to_groups(
                groups=["https://facebook.com/groups/123", ...],
                content=PostContent(text="Hello world!")
            )
    """

    def __init__(self):
        self.browser_manager = BrowserManager()
        self.proxy_manager = ProxyManager()
        self.account_manager = AccountManager()
        self.session_manager = SessionManager()
        self.account_pool = AccountPool()
        self.scheduler: TaskScheduler | None = None

        self._running = False

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.stop()

    async def start(self):
        """Start the automation system."""
        logger.info("Starting Facebook Group Automation...")

        await self.account_manager.connect()
        await self.browser_manager.start()

        self.scheduler = TaskScheduler(self.account_manager)
        self._running = True

        logger.info("Automation system started")

    async def stop(self):
        """Stop the automation system."""
        logger.info("Stopping automation system...")

        self._running = False

        await self.browser_manager.close()
        await self.account_manager.close()

        logger.info("Automation system stopped")

    async def add_account(
        self,
        account_id: str,
        email: str,
        name: str | None = None,
        proxy: str | None = None,
        storage_state: str | None = None,
        start_warming: bool = True
    ) -> Account:
        """
        Add a new account to the system.

        Args:
            account_id: Unique account identifier
            email: Account email
            name: Display name
            proxy: Proxy string (ip:port:user:pass)
            storage_state: Path to cookies/storage JSON file
            start_warming: Start in warming mode (recommended)

        Returns:
            Created Account object
        """
        # Validate proxy if provided
        if proxy and settings.proxy.test_on_start:
            logger.info(f"Testing proxy for account {account_id}...")
            is_valid, result = await self.proxy_manager.test_proxy_with_retry(proxy)

            if not is_valid:
                logger.warning(f"Proxy validation failed: {result}")
                # Continue anyway, but log warning

        # Set storage state path
        if storage_state:
            storage_state_path = str(Path(storage_state).absolute())
        else:
            storage_state_path = str(self.session_manager.get_storage_state_path(account_id))

        account = await self.account_manager.add_account(
            account_id=account_id,
            email=email,
            name=name,
            proxy=proxy,
            storage_state_path=storage_state_path,
            start_warming=start_warming
        )

        logger.info(f"Account added: {account_id} (warming={start_warming})")
        return account

    async def post_to_groups(
        self,
        groups: list[str],
        content: PostContent,
        shuffle_groups: bool = True
    ) -> list[PostTask]:
        """
        Post content to multiple groups.

        Args:
            groups: List of group URLs
            content: Post content
            shuffle_groups: Whether to randomize group order

        Returns:
            List of completed tasks
        """
        if not self._running:
            raise RuntimeError("Automation not started. Call start() first.")

        if shuffle_groups:
            groups = groups.copy()
            random.shuffle(groups)

        # Add tasks to scheduler
        tasks = await self.scheduler.add_tasks(groups, content)

        logger.info(f"Starting to post to {len(groups)} groups...")

        # Process tasks
        completed_tasks = []

        while True:
            # Check if should pause
            if await self.scheduler.should_pause():
                logger.warning("Automation paused due to too many bans")
                await asyncio.sleep(60)  # Wait 1 minute before checking again
                continue

            # Get next task
            task = await self.scheduler.get_next_task()
            if not task:
                break  # No more tasks

            # Assign account
            if not await self.scheduler.assign_account_to_task(task):
                # No accounts available, wait and retry
                logger.debug("No accounts available, waiting...")
                self.scheduler.pending_tasks.appendleft(task)  # Put back
                await asyncio.sleep(30)
                continue

            # Execute task
            result = await self._execute_post_task(task)

            # Record completion
            self.scheduler.record_task_completion(
                task,
                success=result.success,
                error=result.error
            )

            # Record activity
            if result.success:
                await self.account_manager.record_activity(
                    task.account_id,
                    "post",
                    group_url=task.group_url,
                    success=True
                )

            completed_tasks.append(task)

            # Delay before next group
            if self.scheduler.pending_tasks:
                delay = await self.scheduler.get_delay_before_next()
                logger.info(f"Waiting {delay/60:.1f} minutes before next group...")
                await asyncio.sleep(delay)

        # Report results
        stats = self.scheduler.get_stats()
        logger.info(
            f"Posting complete. Completed: {stats['completed']}, "
            f"Failed: {stats['failed']}, Pending: {stats['pending']}"
        )

        return completed_tasks

    async def _execute_post_task(self, task: PostTask) -> any:
        """Execute a single posting task."""
        account = await self.account_manager.get_account(task.account_id)
        if not account:
            from src.automation.facebook import PostResult
            return PostResult(
                success=False,
                group_url=task.group_url,
                account_id=task.account_id,
                error="Account not found"
            )

        logger.info(f"Executing task {task.id} with account {account.id}")

        # Get or create browser context
        context = self.account_pool.get_context(account.id)

        if not context:
            # Create new context
            fingerprint = self.account_manager.get_fingerprint(account)

            context = await self.browser_manager.create_context(
                fingerprint=fingerprint,
                proxy=account.proxy,
                storage_state=account.storage_state_path,
                account_id=account.id
            )

            self.account_pool.register_context(account.id, context)

        # Create page
        page = await self.browser_manager.create_page(context)

        try:
            # Create Facebook automation instance
            fb = FacebookAutomation(page, account)

            # Warm up session
            await fb.warm_up_session()

            # Navigate to group
            await fb.navigate_to_group(task.group_url)

            # Create the post
            result = await fb.create_post(task.content)

            # Save session state
            await self.browser_manager.save_storage_state(
                context,
                account.storage_state_path
            )

            return result

        except BanDetectedException as e:
            # Mark account as banned
            await self.account_manager.mark_account_banned(
                account.id,
                ban_type="checkpoint",
                details=str(e)
            )

            from src.automation.facebook import PostResult
            return PostResult(
                success=False,
                group_url=task.group_url,
                account_id=account.id,
                error=str(e)
            )

        except Exception as e:
            logger.error(f"Task execution failed: {e}")

            from src.automation.facebook import PostResult
            return PostResult(
                success=False,
                group_url=task.group_url,
                account_id=account.id,
                error=str(e)
            )

        finally:
            # Close page but keep context for reuse
            await page.close()

    async def refresh_session(self, account_id: str):
        """
        Refresh an account's session.
        Should be done every 3-7 days.
        """
        account = await self.account_manager.get_account(account_id)
        if not account:
            raise ValueError(f"Account not found: {account_id}")

        fingerprint = self.account_manager.get_fingerprint(account)

        context = await self.browser_manager.create_context(
            fingerprint=fingerprint,
            proxy=account.proxy,
            storage_state=account.storage_state_path,
            account_id=account.id
        )

        page = await self.browser_manager.create_page(context)

        try:
            fb = FacebookAutomation(page, account)
            await fb.refresh_session()

            # Save updated session
            await self.browser_manager.save_storage_state(
                context,
                account.storage_state_path
            )

            logger.info(f"Session refreshed for account: {account_id}")

        finally:
            await page.close()
            await context.close()

    async def do_warming_actions(self, account_id: str):
        """
        Perform warming actions for an account (likes, comments, scrolling).
        For accounts in warming period.
        """
        account = await self.account_manager.get_account(account_id)
        if not account:
            raise ValueError(f"Account not found: {account_id}")

        if not account.can_engage():
            logger.warning(f"Account {account_id} cannot engage (limit reached)")
            return

        fingerprint = self.account_manager.get_fingerprint(account)

        context = await self.browser_manager.create_context(
            fingerprint=fingerprint,
            proxy=account.proxy,
            storage_state=account.storage_state_path,
            account_id=account.id
        )

        page = await self.browser_manager.create_page(context)

        try:
            fb = FacebookAutomation(page, account)

            # Warm up
            await fb.warm_up_session()

            # Random engagement on news feed
            from src.automation.human_behavior import HumanBehavior
            human = HumanBehavior(page)

            # Scroll and engage
            duration = random.uniform(120, 300)  # 2-5 minutes
            logger.info(f"Warming engagement for {duration/60:.1f} minutes")

            await human.random_engagement(
                duration=duration,
                click_probability=0.3,
                scroll_probability=0.6
            )

            # Record some actions
            actions_done = random.randint(3, 8)
            for _ in range(actions_done):
                await self.account_manager.record_activity(
                    account_id,
                    random.choice(["like", "comment"]),
                    success=True
                )

            # Save session
            await self.browser_manager.save_storage_state(
                context,
                account.storage_state_path
            )

            logger.info(f"Warming complete for account: {account_id}")

        except BanDetectedException as e:
            await self.account_manager.mark_account_banned(
                account_id,
                ban_type="checkpoint",
                details=str(e)
            )

        finally:
            await page.close()
            await context.close()


async def main():
    """Example usage."""
    setup_logging()

    async with FacebookGroupAutomation() as automation:
        # Example: Add accounts
        # await automation.add_account(
        #     "account1",
        #     "email@example.com",
        #     proxy="192.168.1.1:8080:user:pass",
        #     storage_state="data/sessions/account1.json"
        # )

        # Example: Post to groups
        # groups = [
        #     "https://www.facebook.com/groups/123456",
        #     "https://www.facebook.com/groups/789012",
        # ]
        # content = PostContent(text="Hello! This is a test post.")
        # await automation.post_to_groups(groups, content)

        logger.info("Automation ready. Configure accounts and groups to start.")


if __name__ == "__main__":
    asyncio.run(main())
