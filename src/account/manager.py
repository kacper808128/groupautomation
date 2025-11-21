"""
Account Manager - handles account storage, sessions, and activity tracking.
Implements cookie-based login, session refresh, and activity limits.
"""
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any
from dataclasses import dataclass, field, asdict
from enum import Enum
import aiosqlite
from loguru import logger

from src.config import settings
from src.fingerprint.manager import BrowserFingerprint, fingerprint_manager


class AccountStatus(str, Enum):
    """Account status enum."""
    ACTIVE = "active"
    WARMING = "warming"
    PAUSED = "paused"
    BANNED = "banned"
    CHECKPOINT = "checkpoint"
    DEAD = "dead"


@dataclass
class AccountActivity:
    """Daily activity tracking."""
    date: str  # YYYY-MM-DD
    posts: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0

    @property
    def total_actions(self) -> int:
        return self.posts + self.likes + self.comments + self.shares


@dataclass
class Account:
    """Facebook account data."""
    id: str
    email: str
    name: str | None = None
    proxy: str | None = None
    status: AccountStatus = AccountStatus.ACTIVE

    # Session data
    storage_state_path: str | None = None
    fingerprint_seed: int | None = None

    # Activity tracking
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_active: str | None = None
    warming_started: str | None = None
    total_posts: int = 0
    ban_count: int = 0

    # Today's activity
    today_activity: AccountActivity | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        data = asdict(self)
        data["status"] = self.status.value
        if self.today_activity:
            data["today_activity"] = asdict(self.today_activity)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Account":
        """Create from dictionary."""
        data["status"] = AccountStatus(data.get("status", "active"))
        if data.get("today_activity"):
            data["today_activity"] = AccountActivity(**data["today_activity"])
        return cls(**data)

    def is_warming(self) -> bool:
        """Check if account is in warming period."""
        if not self.warming_started:
            return False

        warming_start = datetime.fromisoformat(self.warming_started)
        warming_days = settings.activity_limits.warming.duration_days
        warming_end = warming_start + timedelta(days=warming_days)

        return datetime.now() < warming_end

    def get_daily_limits(self) -> tuple[int, int]:
        """Get daily limits (posts, total_actions) based on warming status."""
        if self.is_warming() or self.status == AccountStatus.WARMING:
            return (
                0 if not settings.activity_limits.warming.posts_allowed else 2,
                settings.activity_limits.warming.max_actions_per_day
            )
        return (
            settings.activity_limits.max_posts_per_day,
            settings.activity_limits.max_actions_per_day
        )

    def can_post(self) -> bool:
        """Check if account can post today."""
        if self.status not in [AccountStatus.ACTIVE, AccountStatus.WARMING]:
            return False

        max_posts, max_actions = self.get_daily_limits()

        if self.today_activity:
            if self.today_activity.posts >= max_posts:
                return False
            if self.today_activity.total_actions >= max_actions:
                return False

        return True

    def can_engage(self) -> bool:
        """Check if account can do engagement actions (like, comment)."""
        if self.status not in [AccountStatus.ACTIVE, AccountStatus.WARMING]:
            return False

        _, max_actions = self.get_daily_limits()

        if self.today_activity:
            if self.today_activity.total_actions >= max_actions:
                return False

        return True


class AccountManager:
    """
    Manages accounts, sessions, and activity tracking.

    Usage:
        async with AccountManager() as manager:
            account = await manager.get_account("account1")
            if account.can_post():
                # ... do post ...
                await manager.record_activity(account.id, "post")
    """

    def __init__(self, db_path: str | Path = "data/accounts.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db: aiosqlite.Connection | None = None
        self._accounts_cache: dict[str, Account] = {}

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def connect(self):
        """Connect to database and create tables."""
        self.db = await aiosqlite.connect(str(self.db_path))
        await self._create_tables()
        logger.info(f"Account database connected: {self.db_path}")

    async def close(self):
        """Close database connection."""
        if self.db:
            await self.db.close()
            self.db = None

    async def _create_tables(self):
        """Create database tables."""
        await self.db.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                name TEXT,
                proxy TEXT,
                status TEXT DEFAULT 'active',
                storage_state_path TEXT,
                fingerprint_seed INTEGER,
                created_at TEXT,
                last_active TEXT,
                warming_started TEXT,
                total_posts INTEGER DEFAULT 0,
                ban_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                group_url TEXT,
                timestamp TEXT NOT NULL,
                success INTEGER DEFAULT 1,
                error_message TEXT,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE TABLE IF NOT EXISTS daily_activity (
                account_id TEXT NOT NULL,
                date TEXT NOT NULL,
                posts INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                PRIMARY KEY (account_id, date),
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE TABLE IF NOT EXISTS ban_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                ban_type TEXT,
                details TEXT,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_activity_log_account ON activity_log(account_id);
            CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(date);
        """)
        await self.db.commit()

    async def add_account(
        self,
        account_id: str,
        email: str,
        name: str | None = None,
        proxy: str | None = None,
        storage_state_path: str | None = None,
        start_warming: bool = True
    ) -> Account:
        """
        Add a new account.

        Args:
            account_id: Unique account identifier
            email: Account email
            name: Account name
            proxy: Proxy to use (format: ip:port:user:pass)
            storage_state_path: Path to storage state JSON
            start_warming: Whether to start in warming mode
        """
        now = datetime.now().isoformat()

        # Generate unique fingerprint seed
        fingerprint_seed = hash(account_id + now) % (2**31)

        status = AccountStatus.WARMING if start_warming else AccountStatus.ACTIVE
        warming_started = now if start_warming else None

        account = Account(
            id=account_id,
            email=email,
            name=name,
            proxy=proxy,
            status=status,
            storage_state_path=storage_state_path,
            fingerprint_seed=fingerprint_seed,
            created_at=now,
            warming_started=warming_started
        )

        await self.db.execute("""
            INSERT OR REPLACE INTO accounts
            (id, email, name, proxy, status, storage_state_path, fingerprint_seed,
             created_at, warming_started, total_posts, ban_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        """, (
            account.id, account.email, account.name, account.proxy,
            account.status.value, account.storage_state_path,
            account.fingerprint_seed, account.created_at, account.warming_started
        ))
        await self.db.commit()

        self._accounts_cache[account_id] = account
        logger.info(f"Added account: {account_id} (status={status.value})")

        return account

    async def get_account(self, account_id: str) -> Account | None:
        """Get account by ID."""
        # Check cache
        if account_id in self._accounts_cache:
            account = self._accounts_cache[account_id]
            # Update today's activity
            account.today_activity = await self._get_today_activity(account_id)
            return account

        cursor = await self.db.execute(
            "SELECT * FROM accounts WHERE id = ?",
            (account_id,)
        )
        row = await cursor.fetchone()

        if not row:
            return None

        columns = [d[0] for d in cursor.description]
        data = dict(zip(columns, row))

        account = Account.from_dict(data)
        account.today_activity = await self._get_today_activity(account_id)

        self._accounts_cache[account_id] = account
        return account

    async def get_all_accounts(
        self,
        status: AccountStatus | None = None
    ) -> list[Account]:
        """Get all accounts, optionally filtered by status."""
        query = "SELECT * FROM accounts"
        params = ()

        if status:
            query += " WHERE status = ?"
            params = (status.value,)

        cursor = await self.db.execute(query, params)
        rows = await cursor.fetchall()

        accounts = []
        columns = [d[0] for d in cursor.description]

        for row in rows:
            data = dict(zip(columns, row))
            account = Account.from_dict(data)
            account.today_activity = await self._get_today_activity(account.id)
            accounts.append(account)
            self._accounts_cache[account.id] = account

        return accounts

    async def get_available_accounts(self) -> list[Account]:
        """Get accounts that can perform actions."""
        all_accounts = await self.get_all_accounts()
        return [
            a for a in all_accounts
            if a.status in [AccountStatus.ACTIVE, AccountStatus.WARMING]
            and a.can_engage()
        ]

    async def _get_today_activity(self, account_id: str) -> AccountActivity:
        """Get today's activity for an account."""
        today = datetime.now().strftime("%Y-%m-%d")

        cursor = await self.db.execute(
            "SELECT * FROM daily_activity WHERE account_id = ? AND date = ?",
            (account_id, today)
        )
        row = await cursor.fetchone()

        if row:
            return AccountActivity(
                date=today,
                posts=row[2],
                likes=row[3],
                comments=row[4],
                shares=row[5]
            )

        return AccountActivity(date=today)

    async def record_activity(
        self,
        account_id: str,
        action_type: str,
        group_url: str | None = None,
        success: bool = True,
        error_message: str | None = None
    ):
        """
        Record an activity for an account.

        Args:
            account_id: Account identifier
            action_type: Type of action (post, like, comment, share)
            group_url: URL of the group (if applicable)
            success: Whether the action succeeded
            error_message: Error message if failed
        """
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")

        # Log the activity
        await self.db.execute("""
            INSERT INTO activity_log
            (account_id, action_type, group_url, timestamp, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (account_id, action_type, group_url, now.isoformat(), int(success), error_message))

        if success:
            # Update daily activity
            await self.db.execute(f"""
                INSERT INTO daily_activity (account_id, date, {action_type}s)
                VALUES (?, ?, 1)
                ON CONFLICT(account_id, date)
                DO UPDATE SET {action_type}s = {action_type}s + 1
            """, (account_id, today))

            # Update total posts if applicable
            if action_type == "post":
                await self.db.execute(
                    "UPDATE accounts SET total_posts = total_posts + 1, last_active = ? WHERE id = ?",
                    (now.isoformat(), account_id)
                )
            else:
                await self.db.execute(
                    "UPDATE accounts SET last_active = ? WHERE id = ?",
                    (now.isoformat(), account_id)
                )

            # Update cache
            if account_id in self._accounts_cache:
                self._accounts_cache[account_id].today_activity = await self._get_today_activity(account_id)
                self._accounts_cache[account_id].last_active = now.isoformat()

        await self.db.commit()
        logger.debug(f"Recorded activity: {account_id} - {action_type} (success={success})")

    async def mark_account_banned(
        self,
        account_id: str,
        ban_type: str = "unknown",
        details: str | None = None
    ):
        """Mark an account as banned."""
        now = datetime.now().isoformat()

        await self.db.execute(
            "UPDATE accounts SET status = ?, ban_count = ban_count + 1 WHERE id = ?",
            (AccountStatus.BANNED.value, account_id)
        )

        await self.db.execute("""
            INSERT INTO ban_events (account_id, timestamp, ban_type, details)
            VALUES (?, ?, ?, ?)
        """, (account_id, now, ban_type, details))

        await self.db.commit()

        if account_id in self._accounts_cache:
            self._accounts_cache[account_id].status = AccountStatus.BANNED
            self._accounts_cache[account_id].ban_count += 1

        logger.warning(f"Account marked as banned: {account_id} (type={ban_type})")

    async def get_recent_bans(self, hours: int = 1) -> list[dict]:
        """Get ban events in the last N hours."""
        since = (datetime.now() - timedelta(hours=hours)).isoformat()

        cursor = await self.db.execute(
            "SELECT * FROM ban_events WHERE timestamp > ?",
            (since,)
        )
        rows = await cursor.fetchall()
        columns = [d[0] for d in cursor.description]

        return [dict(zip(columns, row)) for row in rows]

    async def should_pause_automation(self) -> bool:
        """Check if automation should be paused due to too many bans."""
        recent_bans = await self.get_recent_bans(hours=1)
        threshold = settings.error_handling.auto_pause_on_bans

        if len(recent_bans) >= threshold:
            logger.warning(
                f"Too many bans in last hour ({len(recent_bans)} >= {threshold}). "
                "Automation should be paused!"
            )
            return True

        return False

    async def update_account_status(self, account_id: str, status: AccountStatus):
        """Update account status."""
        await self.db.execute(
            "UPDATE accounts SET status = ? WHERE id = ?",
            (status.value, account_id)
        )
        await self.db.commit()

        if account_id in self._accounts_cache:
            self._accounts_cache[account_id].status = status

        logger.info(f"Account {account_id} status updated to: {status.value}")

    def get_fingerprint(self, account: Account) -> BrowserFingerprint:
        """Get consistent fingerprint for an account."""
        return fingerprint_manager.generate_fingerprint(seed=account.fingerprint_seed)


class SessionManager:
    """Manages browser sessions and storage states."""

    def __init__(self, sessions_dir: str | Path = "data/sessions"):
        self.sessions_dir = Path(sessions_dir)
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    def get_storage_state_path(self, account_id: str) -> Path:
        """Get storage state file path for an account."""
        return self.sessions_dir / f"{account_id}.json"

    def has_session(self, account_id: str) -> bool:
        """Check if account has a saved session."""
        return self.get_storage_state_path(account_id).exists()

    async def save_session(self, account_id: str, storage_state: dict):
        """Save session storage state."""
        path = self.get_storage_state_path(account_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(storage_state, f, indent=2)
        logger.info(f"Session saved: {account_id}")

    async def load_session(self, account_id: str) -> dict | None:
        """Load session storage state."""
        path = self.get_storage_state_path(account_id)
        if not path.exists():
            return None

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def session_needs_refresh(self, account_id: str) -> bool:
        """Check if session needs refresh (based on file age)."""
        path = self.get_storage_state_path(account_id)
        if not path.exists():
            return True

        # Get file modification time
        import os
        mtime = datetime.fromtimestamp(os.path.getmtime(path))
        age_days = (datetime.now() - mtime).days

        min_days, max_days = settings.multi_account.session_refresh_days
        threshold = (min_days + max_days) / 2

        return age_days >= threshold


# Singleton instances
account_manager = AccountManager()
session_manager = SessionManager()
