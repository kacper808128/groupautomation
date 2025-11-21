"""
Browser Manager - handles Playwright browser creation with stealth and proxy support.
Uses playwright-stealth for base anti-detection + custom fingerprint spoofing.
"""
import asyncio
from pathlib import Path
from typing import Any
from dataclasses import dataclass
import aiohttp
from loguru import logger

from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    Playwright,
)

try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False
    logger.warning("playwright-stealth not installed. Using custom stealth only.")

from src.config import settings
from src.fingerprint.manager import FingerprintManager, BrowserFingerprint


@dataclass
class ProxyConfig:
    """Proxy configuration."""
    server: str
    username: str | None = None
    password: str | None = None

    @classmethod
    def from_string(cls, proxy_str: str) -> "ProxyConfig":
        """Parse proxy string: ip:port:user:pass or ip:port"""
        parts = proxy_str.split(":")
        if len(parts) == 4:
            return cls(
                server=f"http://{parts[0]}:{parts[1]}",
                username=parts[2],
                password=parts[3]
            )
        elif len(parts) == 2:
            return cls(server=f"http://{parts[0]}:{parts[1]}")
        else:
            raise ValueError(f"Invalid proxy format: {proxy_str}")

    def to_playwright_config(self) -> dict[str, Any]:
        """Convert to Playwright proxy config."""
        config = {"server": self.server}
        if self.username and self.password:
            config["username"] = self.username
            config["password"] = self.password
        return config


class BrowserManager:
    """
    Manages browser instances with stealth and anti-detection measures.

    Usage:
        async with BrowserManager() as manager:
            context = await manager.create_context(
                fingerprint=fingerprint,
                proxy="ip:port:user:pass",
                storage_state="account1.json"
            )
            page = await context.new_page()
            await page.goto("https://facebook.com")
    """

    def __init__(self):
        self.config = settings.browser
        self.playwright: Playwright | None = None
        self.browser: Browser | None = None
        self.fingerprint_manager = FingerprintManager()
        self._contexts: list[BrowserContext] = []

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def start(self):
        """Start the Playwright browser."""
        logger.info("Starting browser manager...")

        self.playwright = await async_playwright().start()

        # Launch arguments for maximum stealth
        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-dev-shm-usage",
            "--disable-browser-side-navigation",
            "--disable-gpu-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-pings",
            "--disable-hang-monitor",
            "--disable-prompt-on-repost",
            "--disable-client-side-phishing-detection",
            "--disable-popup-blocking",
            "--disable-component-update",
            "--disable-ipc-flooding-protection",
            "--enable-features=NetworkService,NetworkServiceInProcess",
        ]

        # CRITICAL: headless=False (headless=True = instant flag w 2025)
        self.browser = await self.playwright.chromium.launch(
            headless=self.config.headless,  # Should be False
            slow_mo=self.config.slow_mo,
            args=launch_args,
            ignore_default_args=["--enable-automation"],
        )

        logger.info(f"Browser started (headless={self.config.headless})")

    async def close(self):
        """Close all contexts and browser."""
        logger.info("Closing browser manager...")

        # Close all contexts
        for context in self._contexts:
            try:
                await context.close()
            except Exception as e:
                logger.warning(f"Error closing context: {e}")

        self._contexts.clear()

        # Close browser
        if self.browser:
            await self.browser.close()
            self.browser = None

        # Stop playwright
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

        logger.info("Browser manager closed")

    async def create_context(
        self,
        fingerprint: BrowserFingerprint | None = None,
        proxy: str | ProxyConfig | None = None,
        storage_state: str | Path | None = None,
        account_id: str | None = None,
    ) -> BrowserContext:
        """
        Create a new browser context with stealth measures.

        Args:
            fingerprint: Browser fingerprint to use (generated if None)
            proxy: Proxy configuration (string or ProxyConfig)
            storage_state: Path to storage state file (cookies + localStorage)
            account_id: Account identifier for logging

        Returns:
            BrowserContext with all stealth measures applied
        """
        if not self.browser:
            raise RuntimeError("Browser not started. Call start() first.")

        # Generate fingerprint if not provided
        if fingerprint is None:
            fingerprint = self.fingerprint_manager.generate_fingerprint()

        logger.info(
            f"Creating context for account={account_id or 'unknown'}, "
            f"fingerprint={fingerprint.get_fingerprint_hash()}"
        )

        # Build context options
        context_options: dict[str, Any] = {
            "viewport": {
                "width": fingerprint.screen_width,
                "height": fingerprint.screen_height - 140,  # Account for browser chrome
            },
            "screen": {
                "width": fingerprint.screen_width,
                "height": fingerprint.screen_height,
            },
            "user_agent": fingerprint.user_agent,
            "locale": fingerprint.locale,
            "timezone_id": fingerprint.timezone,
            "color_scheme": "light",
            "device_scale_factor": fingerprint.pixel_ratio,
            "is_mobile": False,
            "has_touch": False,
            "java_script_enabled": True,
            "bypass_csp": False,  # Don't bypass CSP - looks suspicious
            "ignore_https_errors": False,
        }

        # Add proxy if provided
        if proxy:
            if isinstance(proxy, str):
                proxy = ProxyConfig.from_string(proxy)
            context_options["proxy"] = proxy.to_playwright_config()
            logger.info(f"Using proxy: {proxy.server}")

        # Add storage state if provided (for cookie-based login)
        if storage_state:
            storage_path = Path(storage_state)
            if storage_path.exists():
                context_options["storage_state"] = str(storage_path)
                logger.info(f"Loading storage state from: {storage_path}")
            else:
                logger.warning(f"Storage state file not found: {storage_path}")

        # Create context
        context = await self.browser.new_context(**context_options)

        # Apply stealth scripts
        await self._apply_stealth(context, fingerprint)

        # Track context
        self._contexts.append(context)

        return context

    async def _apply_stealth(
        self,
        context: BrowserContext,
        fingerprint: BrowserFingerprint
    ):
        """Apply all stealth measures to a context."""

        # Get custom fingerprint spoofing scripts
        stealth_scripts = self.fingerprint_manager.get_stealth_scripts(fingerprint)

        # Add all scripts as init scripts (runs before page content)
        for script in stealth_scripts:
            await context.add_init_script(script)

        # Add additional stealth script to hide automation indicators
        await context.add_init_script("""
            // Hide webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // Hide automation-related properties
            delete navigator.__proto__.webdriver;

            // Override toString to hide native code modifications
            const originalFunction = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === navigator.permissions.query) {
                    return 'function query() { [native code] }';
                }
                return originalFunction.call(this);
            };

            // Console.debug trap (FB uses this for detection)
            const originalDebug = console.debug;
            console.debug = function(...args) {
                // Filter out automation detection attempts
                const str = args.join(' ');
                if (str.includes('automation') || str.includes('webdriver')) {
                    return;
                }
                return originalDebug.apply(console, args);
            };
        """)

        logger.debug("Stealth scripts applied to context")

    async def create_page(
        self,
        context: BrowserContext,
        apply_page_stealth: bool = True
    ) -> Page:
        """
        Create a new page in a context with additional stealth.

        Args:
            context: Browser context to create page in
            apply_page_stealth: Whether to apply playwright-stealth to page

        Returns:
            Page with stealth measures applied
        """
        page = await context.new_page()

        # Apply playwright-stealth if available
        if apply_page_stealth and STEALTH_AVAILABLE:
            await stealth_async(page)
            logger.debug("playwright-stealth applied to page")

        return page

    async def save_storage_state(
        self,
        context: BrowserContext,
        path: str | Path
    ):
        """
        Save context storage state (cookies + localStorage) to file.

        Args:
            context: Browser context to save state from
            path: Path to save state to
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        await context.storage_state(path=str(path))
        logger.info(f"Storage state saved to: {path}")


class ProxyManager:
    """Manages proxy validation and rotation."""

    def __init__(self):
        self.config = settings.proxy

    async def validate_proxy(self, proxy: str | ProxyConfig) -> tuple[bool, str | None]:
        """
        Validate a proxy by checking IP through ipify.

        Args:
            proxy: Proxy to validate

        Returns:
            Tuple of (is_valid, ip_address or error_message)
        """
        if isinstance(proxy, str):
            proxy = ProxyConfig.from_string(proxy)

        try:
            # Build proxy URL for aiohttp
            if proxy.username and proxy.password:
                proxy_url = f"http://{proxy.username}:{proxy.password}@{proxy.server.replace('http://', '')}"
            else:
                proxy_url = proxy.server

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.config.test_url,
                    proxy=proxy_url,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        ip = data.get("ip", "unknown")
                        logger.info(f"Proxy validated. IP: {ip}")
                        return True, ip
                    else:
                        return False, f"HTTP {response.status}"

        except asyncio.TimeoutError:
            return False, "Timeout"
        except aiohttp.ClientError as e:
            return False, str(e)
        except Exception as e:
            return False, str(e)

    async def test_proxy_with_retry(
        self,
        proxy: str | ProxyConfig,
        max_retries: int = 3
    ) -> tuple[bool, str | None]:
        """
        Test proxy with retries and exponential backoff.

        Args:
            proxy: Proxy to test
            max_retries: Maximum number of retries

        Returns:
            Tuple of (is_valid, ip_address or error_message)
        """
        for attempt in range(max_retries):
            is_valid, result = await self.validate_proxy(proxy)
            if is_valid:
                return True, result

            if attempt < max_retries - 1:
                delay = 2 ** attempt  # Exponential backoff: 1, 2, 4 seconds
                logger.warning(
                    f"Proxy validation failed (attempt {attempt + 1}/{max_retries}): {result}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)

        return False, result


# Singleton instances
browser_manager = BrowserManager()
proxy_manager = ProxyManager()
