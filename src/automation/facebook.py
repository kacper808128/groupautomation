"""
Facebook Automation - implements the exact posting flow with anti-ban measures.
Follows the 10-step publication sequence for maximum safety.
"""
import asyncio
import random
from pathlib import Path
from typing import Any
from dataclasses import dataclass
from datetime import datetime

from playwright.async_api import Page, BrowserContext, TimeoutError as PlaywrightTimeout
from loguru import logger

from src.config import settings
from src.automation.human_behavior import HumanBehavior, bounded_gaussian, Point
from src.account.manager import Account, AccountStatus


@dataclass
class PostContent:
    """Content for a Facebook post."""
    text: str
    images: list[str] | None = None  # List of image paths
    link: str | None = None


@dataclass
class PostResult:
    """Result of a post attempt."""
    success: bool
    group_url: str
    account_id: str
    error: str | None = None
    screenshot_path: str | None = None
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()


class BanDetector:
    """Detects ban/checkpoint signals on Facebook pages."""

    def __init__(self):
        self.ban_keywords = settings.error_handling.ban_keywords

    async def check_for_ban(self, page: Page) -> tuple[bool, str | None]:
        """
        Check if page shows ban/checkpoint signals.

        Returns:
            Tuple of (is_banned, ban_type)
        """
        try:
            page_content = await page.content()
            page_text = page_content.lower()

            for keyword in self.ban_keywords:
                if keyword.lower() in page_text:
                    logger.warning(f"Ban detected: {keyword}")
                    return True, keyword

            # Check for specific selectors
            ban_selectors = [
                '[data-testid="checkpoint_container"]',
                '[aria-label="Your account has been locked"]',
                'form[action*="checkpoint"]',
                '[data-testid="security_check"]',
            ]

            for selector in ban_selectors:
                element = await page.query_selector(selector)
                if element:
                    logger.warning(f"Ban selector found: {selector}")
                    return True, "checkpoint_selector"

            return False, None

        except Exception as e:
            logger.error(f"Error checking for ban: {e}")
            return False, None


class FacebookAutomation:
    """
    Facebook automation with anti-ban measures.

    Implements the exact 10-step posting flow:
    1. Open facebook.com → wait full load + 10-30s scroll
    2. Type group URL in address bar
    3. Wait 15-90s + human scrolling + 2-5 post clicks
    4. Click "Create post" (fresh locator)
    5. Human mouse move to text field → click
    6. Type text with delays + random corrections
    7. Upload images with human mouse + delays
    8. Human mouse to "Post" button → click
    9. Stay 45-240s + additional actions
    10. Random sort next group
    """

    def __init__(self, page: Page, account: Account):
        self.page = page
        self.account = account
        self.human = HumanBehavior(page)
        self.ban_detector = BanDetector()
        self.config = settings.human_behavior

        # Track human errors
        self._posts_since_error = 0
        self._error_frequency = settings.error_handling.human_error_frequency

    async def warm_up_session(self):
        """
        Warm up the browser session by visiting Facebook homepage.
        Step 1 of the flow.
        """
        logger.info(f"Warming up session for account: {self.account.id}")

        # Go to Facebook
        await self.page.goto("https://www.facebook.com", wait_until="networkidle")

        # Check for ban immediately
        is_banned, ban_type = await self.ban_detector.check_for_ban(self.page)
        if is_banned:
            raise BanDetectedException(f"Ban detected during warmup: {ban_type}")

        # Wait for full load
        await asyncio.sleep(random.uniform(2, 5))

        # Human-like scrolling (10-30 seconds)
        scroll_duration = random.uniform(10, 30)
        logger.debug(f"Initial scroll for {scroll_duration:.1f}s")
        await self.human.scroll.scroll_randomly(duration=scroll_duration)

        logger.info("Session warmup complete")

    async def navigate_to_group(self, group_url: str):
        """
        Navigate to a Facebook group.
        Steps 2-3 of the flow.
        """
        logger.info(f"Navigating to group: {group_url}")

        # Step 2: Navigate via URL bar (not bookmarks/links)
        await self.page.goto(group_url, wait_until="networkidle")

        # Check for ban
        is_banned, ban_type = await self.ban_detector.check_for_ban(self.page)
        if is_banned:
            raise BanDetectedException(f"Ban detected on group page: {ban_type}")

        # Step 3: Wait and engage (15-90s)
        engagement_duration = random.uniform(
            *self.config.group_engagement.time_on_group
        )
        logger.debug(f"Group engagement for {engagement_duration:.1f}s")

        await self._engage_with_group(engagement_duration)

    async def _engage_with_group(self, duration: float):
        """Perform human-like engagement on group page."""
        start_time = asyncio.get_event_loop().time()
        end_time = start_time + duration

        clicks_done = 0
        likes_done = 0
        target_clicks = random.randint(*self.config.group_engagement.click_posts_range)
        target_likes = random.randint(*self.config.group_engagement.like_posts_range)

        while asyncio.get_event_loop().time() < end_time:
            action = random.random()

            if action < 0.6:
                # Scroll
                await self.human.scroll.scroll_randomly(
                    duration=random.uniform(2, 8)
                )

            elif action < 0.8 and clicks_done < target_clicks:
                # Click on a post
                try:
                    posts = await self.page.query_selector_all(
                        '[data-pagelet*="FeedUnit"], [role="article"]'
                    )
                    if posts:
                        post = random.choice(posts[:10])
                        box = await post.bounding_box()
                        if box:
                            await self.human.mouse.move_to(Point(
                                box["x"] + box["width"] / 2,
                                box["y"] + box["height"] / 2
                            ))
                            clicks_done += 1
                            await asyncio.sleep(random.uniform(1, 3))
                except Exception:
                    pass

            elif clicks_done >= 1 and likes_done < target_likes:
                # Try to like a post
                try:
                    like_buttons = await self.page.query_selector_all(
                        '[aria-label*="Lubię to"], [aria-label*="Like"]'
                    )
                    if like_buttons:
                        btn = random.choice(like_buttons[:5])
                        await self.human.mouse.click(btn)
                        likes_done += 1
                        await asyncio.sleep(random.uniform(2, 5))
                except Exception:
                    pass

            await asyncio.sleep(random.uniform(1, 3))

        logger.debug(f"Group engagement: {clicks_done} clicks, {likes_done} likes")

    async def create_post(self, content: PostContent) -> PostResult:
        """
        Create a post in the current group.
        Steps 4-9 of the flow.
        """
        group_url = self.page.url

        try:
            # Maybe make a human error
            if self._should_make_human_error():
                await self._perform_human_error()

            # Step 4: Click "Create post" button
            await self._click_create_post()

            # Step 5: Focus on text field
            await self._focus_text_field()

            # Step 6: Type the post content
            await self._type_post_content(content.text)

            # Step 7: Upload images if any
            if content.images:
                await self._upload_images(content.images)

            # Step 8: Click Post button
            await self._click_post_button()

            # Step 9: Stay and engage
            await self._post_publish_engagement()

            logger.info(f"Post created successfully in: {group_url}")

            return PostResult(
                success=True,
                group_url=group_url,
                account_id=self.account.id
            )

        except BanDetectedException as e:
            logger.error(f"Ban detected: {e}")
            screenshot_path = await self._take_error_screenshot("ban")
            return PostResult(
                success=False,
                group_url=group_url,
                account_id=self.account.id,
                error=str(e),
                screenshot_path=screenshot_path
            )

        except Exception as e:
            logger.error(f"Post failed: {e}")
            screenshot_path = await self._take_error_screenshot("error")
            return PostResult(
                success=False,
                group_url=group_url,
                account_id=self.account.id,
                error=str(e),
                screenshot_path=screenshot_path
            )

    async def _click_create_post(self):
        """Click the create post button/area."""
        logger.debug("Looking for create post button...")

        # Fresh locators - never hardcoded xpath
        create_post_selectors = [
            # Polish Facebook
            '[aria-label*="Utwórz post"]',
            '[aria-label*="Napisz coś"]',
            '[placeholder*="Napisz coś"]',
            '[data-pagelet="GroupInlineComposer"] [role="button"]',
            # English Facebook
            '[aria-label*="Create post"]',
            '[aria-label*="Write something"]',
            '[placeholder*="Write something"]',
            # Generic
            '[data-pagelet*="Composer"] [role="button"]',
            'div[role="button"]:has-text("Write something")',
            'div[role="button"]:has-text("Napisz coś")',
        ]

        for selector in create_post_selectors:
            try:
                element = await self.page.wait_for_selector(
                    selector,
                    timeout=3000,
                    state="visible"
                )
                if element:
                    await self.human.mouse.click(element)
                    await asyncio.sleep(random.uniform(1, 2))
                    logger.debug(f"Clicked create post with: {selector}")
                    return
            except PlaywrightTimeout:
                continue
            except Exception as e:
                logger.debug(f"Selector {selector} failed: {e}")
                continue

        raise Exception("Could not find create post button")

    async def _focus_text_field(self):
        """Focus on the post text field."""
        logger.debug("Focusing on text field...")

        text_field_selectors = [
            '[aria-label*="Utwórz publiczny post"]',
            '[aria-label*="Create a public post"]',
            '[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            'div[contenteditable="true"][spellcheck="true"]',
        ]

        for selector in text_field_selectors:
            try:
                element = await self.page.wait_for_selector(
                    selector,
                    timeout=3000,
                    state="visible"
                )
                if element:
                    await self.human.mouse.click(element)
                    await asyncio.sleep(random.uniform(0.5, 1))
                    logger.debug(f"Focused text field with: {selector}")
                    return
            except PlaywrightTimeout:
                continue

        raise Exception("Could not find text field")

    async def _type_post_content(self, text: str):
        """Type post content with human-like behavior."""
        logger.debug(f"Typing post content ({len(text)} chars)...")

        await self.human.typing.type_text(text)

        # Wait after typing
        await asyncio.sleep(random.uniform(1, 3))

    async def _upload_images(self, image_paths: list[str]):
        """Upload images with human-like delays."""
        logger.debug(f"Uploading {len(image_paths)} images...")

        # Find photo/video button
        photo_button_selectors = [
            '[aria-label*="Zdjęcie"]',
            '[aria-label*="Photo"]',
            '[aria-label*="Add photo"]',
            '[aria-label*="Dodaj zdjęcie"]',
        ]

        photo_button = None
        for selector in photo_button_selectors:
            try:
                photo_button = await self.page.wait_for_selector(
                    selector, timeout=3000
                )
                if photo_button:
                    break
            except PlaywrightTimeout:
                continue

        if not photo_button:
            logger.warning("Could not find photo upload button")
            return

        await self.human.mouse.click(photo_button)
        await asyncio.sleep(random.uniform(1, 2))

        # Upload files
        file_input = await self.page.query_selector('input[type="file"]')
        if file_input:
            for i, image_path in enumerate(image_paths):
                if Path(image_path).exists():
                    await file_input.set_input_files(image_path)
                    # Delay between images (3-8s)
                    if i < len(image_paths) - 1:
                        await asyncio.sleep(random.uniform(3, 8))

            # Wait for upload to complete
            await asyncio.sleep(random.uniform(2, 4))

    async def _click_post_button(self):
        """Click the Post/Opublikuj button."""
        logger.debug("Clicking post button...")

        post_button_selectors = [
            '[aria-label="Opublikuj"]',
            '[aria-label="Post"]',
            'div[role="button"]:has-text("Opublikuj")',
            'div[role="button"]:has-text("Post")',
            '[data-testid="post-button"]',
        ]

        for selector in post_button_selectors:
            try:
                element = await self.page.wait_for_selector(
                    selector,
                    timeout=3000,
                    state="visible"
                )
                if element:
                    await self.human.mouse.click(element)
                    logger.debug(f"Clicked post button with: {selector}")

                    # Wait for post to be submitted
                    await asyncio.sleep(random.uniform(2, 4))

                    # Check for ban after posting
                    is_banned, ban_type = await self.ban_detector.check_for_ban(self.page)
                    if is_banned:
                        raise BanDetectedException(f"Ban after posting: {ban_type}")

                    return
            except PlaywrightTimeout:
                continue

        raise Exception("Could not find post button")

    async def _post_publish_engagement(self):
        """
        Stay on page and engage after publishing.
        Step 9: Stay 45-240s + additional actions.
        """
        duration = random.uniform(
            *self.config.scrolling.post_publish_duration
        )
        logger.debug(f"Post-publish engagement for {duration:.1f}s")

        await self.human.random_engagement(
            duration=duration,
            click_probability=0.2,
            scroll_probability=0.6
        )

        self._posts_since_error += 1

    def _should_make_human_error(self) -> bool:
        """Check if we should make a random human error."""
        if self._posts_since_error >= self._error_frequency:
            if random.random() < 0.5:  # 50% chance when due
                return True
        return False

    async def _perform_human_error(self):
        """
        Perform a random "human error" - makes behavior more realistic.
        Examples: click wrong thing, scroll away, come back.
        """
        logger.debug("Performing random human error...")

        error_type = random.choice(["wrong_click", "scroll_away", "back_navigation"])

        if error_type == "wrong_click":
            # Click somewhere random and come back
            await self.human.scroll.scroll_randomly(duration=random.uniform(2, 5))
            await asyncio.sleep(random.uniform(1, 3))

        elif error_type == "scroll_away":
            # Scroll away then back
            await self.human.scroll._smooth_scroll(random.randint(500, 1000))
            await asyncio.sleep(random.uniform(2, 4))
            await self.human.scroll._smooth_scroll(random.randint(-1000, -500))

        elif error_type == "back_navigation":
            # Go back and forward
            await self.page.go_back()
            await asyncio.sleep(random.uniform(1, 3))
            await self.page.go_forward()
            await asyncio.sleep(random.uniform(1, 2))

        self._posts_since_error = 0
        logger.debug(f"Human error performed: {error_type}")

    async def _take_error_screenshot(self, prefix: str) -> str | None:
        """Take screenshot on error."""
        if not settings.logging.screenshot_on_error:
            return None

        try:
            screenshots_dir = Path("logs/screenshots")
            screenshots_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{prefix}_{self.account.id}_{timestamp}.png"
            path = screenshots_dir / filename

            await self.page.screenshot(path=str(path))
            logger.info(f"Screenshot saved: {path}")
            return str(path)

        except Exception as e:
            logger.error(f"Failed to take screenshot: {e}")
            return None

    async def refresh_session(self):
        """
        Refresh session by visiting Facebook and scrolling.
        Should be done every 3-7 days.
        """
        logger.info(f"Refreshing session for: {self.account.id}")

        await self.page.goto("https://www.facebook.com", wait_until="networkidle")

        # Check for ban
        is_banned, ban_type = await self.ban_detector.check_for_ban(self.page)
        if is_banned:
            raise BanDetectedException(f"Ban detected during refresh: {ban_type}")

        # Scroll around
        await self.human.scroll.scroll_randomly(duration=random.uniform(30, 60))

        # Maybe click on something
        if random.random() < 0.3:
            await self.human.random_engagement(duration=random.uniform(10, 30))

        logger.info("Session refresh complete")


class BanDetectedException(Exception):
    """Raised when a ban/checkpoint is detected."""
    pass
