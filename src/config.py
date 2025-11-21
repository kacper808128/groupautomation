"""
Configuration loader and settings management.
"""
import os
from pathlib import Path
from typing import Any
import yaml
from pydantic import BaseModel
from pydantic_settings import BaseSettings


class MouseConfig(BaseModel):
    speed_range: list[int] = [400, 1200]
    overshoot_percent: list[int] = [5, 15]
    bezier_points: list[int] = [3, 7]


class TypingConfig(BaseModel):
    delay_range: list[int] = [120, 380]
    typo_probability: float = 0.03
    typo_fix_delay: list[int] = [200, 600]


class ScrollingConfig(BaseModel):
    pre_post_duration: list[int] = [15, 60]
    post_publish_duration: list[int] = [45, 240]
    speed_variation: float = 0.3


class GroupEngagementConfig(BaseModel):
    click_posts_range: list[int] = [2, 5]
    like_posts_range: list[int] = [0, 2]
    comment_probability: float = 0.1
    time_on_group: list[int] = [20, 90]


class HumanBehaviorConfig(BaseModel):
    mouse: MouseConfig = MouseConfig()
    typing: TypingConfig = TypingConfig()
    scrolling: ScrollingConfig = ScrollingConfig()
    group_engagement: GroupEngagementConfig = GroupEngagementConfig()


class BrowserConfig(BaseModel):
    headless: bool = False
    browser_type: str = "chromium"
    slow_mo: int = 50


class ProxyConfig(BaseModel):
    enabled: bool = True
    test_on_start: bool = True
    test_url: str = "https://api.ipify.org?format=json"
    sticky_session_minutes: int = 60
    retry_on_failure: bool = True
    max_retries: int = 3


class FingerprintConfig(BaseModel):
    screen_resolutions: list[list[int]] = [
        [1920, 1080], [1366, 768], [1536, 864], [1440, 900]
    ]
    hardware_concurrency_range: list[int] = [4, 16]
    timezones: list[str] = ["Europe/Warsaw", "Europe/Berlin"]
    locales: list[str] = ["pl-PL", "en-US"]


class WarmingConfig(BaseModel):
    enabled: bool = True
    duration_days: int = 10
    max_actions_per_day: int = 20
    posts_allowed: bool = False


class DelaysConfig(BaseModel):
    between_groups_minutes: list[int] = [4, 18]
    between_accounts_seconds: list[int] = [30, 120]
    between_posts_minutes: list[int] = [15, 45]


class ActivityLimitsConfig(BaseModel):
    max_posts_per_day: int = 12
    max_actions_per_day: int = 40
    warming: WarmingConfig = WarmingConfig()
    delays: DelaysConfig = DelaysConfig()


class ErrorHandlingConfig(BaseModel):
    ban_keywords: list[str] = [
        "Twoje konto jest tymczasowo zablokowane",
        "Potwierdź tożsamość",
        "Account temporarily locked"
    ]
    max_retries_per_action: int = 3
    auto_pause_on_bans: int = 2
    human_error_frequency: int = 12


class MultiAccountConfig(BaseModel):
    max_concurrent_accounts: int = 5
    queue_strategy: str = "round_robin"
    session_refresh_days: list[int] = [3, 7]


class LoggingConfig(BaseModel):
    level: str = "INFO"
    screenshot_on_error: bool = True
    log_file: str = "logs/automation.log"


class Settings(BaseSettings):
    browser: BrowserConfig = BrowserConfig()
    proxy: ProxyConfig = ProxyConfig()
    fingerprint: FingerprintConfig = FingerprintConfig()
    human_behavior: HumanBehaviorConfig = HumanBehaviorConfig()
    activity_limits: ActivityLimitsConfig = ActivityLimitsConfig()
    error_handling: ErrorHandlingConfig = ErrorHandlingConfig()
    multi_account: MultiAccountConfig = MultiAccountConfig()
    logging: LoggingConfig = LoggingConfig()

    @classmethod
    def from_yaml(cls, path: str | Path) -> "Settings":
        """Load settings from YAML file."""
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls(**data)


def get_settings() -> Settings:
    """Get settings from config file or defaults."""
    config_path = Path(__file__).parent.parent / "config" / "settings.yaml"
    if config_path.exists():
        return Settings.from_yaml(config_path)
    return Settings()


# Global settings instance
settings = get_settings()
