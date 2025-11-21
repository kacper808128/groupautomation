"""
Human Behavior Simulation - makes automation look like real user actions.
Implements Bezier curve mouse movements, realistic typing, scrolling patterns.
"""
import asyncio
import random
import math
from typing import Any
from dataclasses import dataclass

import numpy as np
from playwright.async_api import Page, Locator
from loguru import logger

from src.config import settings


@dataclass
class Point:
    """2D point."""
    x: float
    y: float


def gaussian_random(mean: float, std_dev: float) -> float:
    """Generate gaussian distributed random number."""
    return np.random.normal(mean, std_dev)


def bounded_gaussian(min_val: float, max_val: float) -> float:
    """Generate gaussian random within bounds."""
    mean = (min_val + max_val) / 2
    std_dev = (max_val - min_val) / 6  # 99.7% within bounds
    value = gaussian_random(mean, std_dev)
    return max(min_val, min(max_val, value))


class BezierCurve:
    """Bezier curve for smooth mouse movements."""

    @staticmethod
    def get_point(t: float, points: list[Point]) -> Point:
        """Get point on Bezier curve at parameter t (0-1)."""
        n = len(points) - 1
        x = 0.0
        y = 0.0

        for i, point in enumerate(points):
            # Bernstein polynomial
            coeff = math.comb(n, i) * (t ** i) * ((1 - t) ** (n - i))
            x += coeff * point.x
            y += coeff * point.y

        return Point(x, y)

    @staticmethod
    def generate_curve(
        start: Point,
        end: Point,
        num_control_points: int = 3,
        variance: float = 0.3
    ) -> list[Point]:
        """
        Generate Bezier curve control points between start and end.

        Args:
            start: Starting point
            end: Ending point
            num_control_points: Number of intermediate control points
            variance: How much control points can deviate from straight line

        Returns:
            List of control points including start and end
        """
        points = [start]

        dx = end.x - start.x
        dy = end.y - start.y
        distance = math.sqrt(dx * dx + dy * dy)

        for i in range(1, num_control_points + 1):
            t = i / (num_control_points + 1)

            # Point on straight line
            base_x = start.x + dx * t
            base_y = start.y + dy * t

            # Add perpendicular offset
            offset_magnitude = distance * variance * gaussian_random(0, 0.5)
            angle = math.atan2(dy, dx) + math.pi / 2

            control_x = base_x + offset_magnitude * math.cos(angle)
            control_y = base_y + offset_magnitude * math.sin(angle)

            points.append(Point(control_x, control_y))

        points.append(end)
        return points


class HumanMouse:
    """Human-like mouse movement simulation."""

    def __init__(self, page: Page):
        self.page = page
        self.config = settings.human_behavior.mouse
        self.current_pos = Point(0, 0)

    async def move_to(
        self,
        target: Point | Locator,
        steps: int | None = None,
        overshoot: bool = True
    ) -> Point:
        """
        Move mouse to target using Bezier curve.

        Args:
            target: Target point or Locator to move to
            steps: Number of intermediate points (auto-calculated if None)
            overshoot: Whether to overshoot and correct

        Returns:
            Final position
        """
        # Get target coordinates
        if isinstance(target, Locator):
            box = await target.bounding_box()
            if not box:
                raise ValueError("Target element not visible")

            # Click in center with some randomness
            target_x = box["x"] + box["width"] * random.uniform(0.3, 0.7)
            target_y = box["y"] + box["height"] * random.uniform(0.3, 0.7)
            target = Point(target_x, target_y)

        # Calculate distance
        dx = target.x - self.current_pos.x
        dy = target.y - self.current_pos.y
        distance = math.sqrt(dx * dx + dy * dy)

        # Auto-calculate steps based on distance
        if steps is None:
            steps = max(10, int(distance / 10))

        # Overshoot calculation
        overshoot_target = target
        if overshoot and random.random() < 0.7:  # 70% chance of overshoot
            overshoot_percent = random.uniform(
                self.config.overshoot_percent[0] / 100,
                self.config.overshoot_percent[1] / 100
            )
            overshoot_target = Point(
                target.x + dx * overshoot_percent,
                target.y + dy * overshoot_percent
            )

        # Generate Bezier curve
        num_control = random.randint(*self.config.bezier_points)
        control_points = BezierCurve.generate_curve(
            self.current_pos,
            overshoot_target if overshoot else target,
            num_control_points=num_control
        )

        # Calculate speed (variable throughout movement)
        speed = random.uniform(*self.config.speed_range)  # px/s
        base_delay = (distance / speed) / steps * 1000  # ms per step

        # Move along curve
        for i in range(1, steps + 1):
            t = i / steps

            # Ease in-out timing
            t_eased = self._ease_in_out(t)
            point = BezierCurve.get_point(t_eased, control_points)

            # Variable delay (slower at start and end)
            delay_multiplier = 1 + 0.5 * math.sin(math.pi * t)
            delay = base_delay * delay_multiplier * random.uniform(0.8, 1.2)

            await self.page.mouse.move(point.x, point.y)
            self.current_pos = point
            await asyncio.sleep(delay / 1000)

        # Correct overshoot if needed
        if overshoot and overshoot_target != target:
            await asyncio.sleep(random.uniform(50, 150) / 1000)
            await self._small_correction(target)

        return self.current_pos

    def _ease_in_out(self, t: float) -> float:
        """Ease in-out function for smooth acceleration/deceleration."""
        return t * t * (3.0 - 2.0 * t)

    async def _small_correction(self, target: Point):
        """Make small correction movement after overshoot."""
        steps = random.randint(3, 7)
        for i in range(1, steps + 1):
            t = i / steps
            x = self.current_pos.x + (target.x - self.current_pos.x) * t
            y = self.current_pos.y + (target.y - self.current_pos.y) * t

            await self.page.mouse.move(x, y)
            self.current_pos = Point(x, y)
            await asyncio.sleep(random.uniform(10, 30) / 1000)

    async def click(
        self,
        target: Point | Locator | None = None,
        button: str = "left",
        delay: float | None = None
    ):
        """
        Click with human-like behavior.

        Args:
            target: Target to click (moves there first if provided)
            button: Mouse button ('left', 'right', 'middle')
            delay: Delay between press and release (randomized if None)
        """
        if target:
            await self.move_to(target)

        # Random delay between press and release
        if delay is None:
            delay = random.uniform(50, 150)

        await self.page.mouse.down(button=button)
        await asyncio.sleep(delay / 1000)
        await self.page.mouse.up(button=button)

        logger.debug(f"Clicked at ({self.current_pos.x:.0f}, {self.current_pos.y:.0f})")

    async def double_click(self, target: Point | Locator | None = None):
        """Double click with human timing."""
        if target:
            await self.move_to(target)

        await self.click()
        await asyncio.sleep(random.uniform(80, 150) / 1000)
        await self.click()


class HumanTyping:
    """Human-like typing simulation."""

    def __init__(self, page: Page):
        self.page = page
        self.config = settings.human_behavior.typing

    async def type_text(
        self,
        text: str,
        element: Locator | None = None,
        clear_first: bool = False
    ):
        """
        Type text with human-like delays and occasional typos.

        Args:
            text: Text to type
            element: Element to type into (focuses if provided)
            clear_first: Whether to clear element first
        """
        if element:
            await element.focus()
            if clear_first:
                await self.page.keyboard.press("Control+A")
                await asyncio.sleep(random.uniform(100, 200) / 1000)
                await self.page.keyboard.press("Backspace")
                await asyncio.sleep(random.uniform(200, 400) / 1000)

        for i, char in enumerate(text):
            # Occasional typo
            if random.random() < self.config.typo_probability:
                await self._make_typo(char)
            else:
                await self.page.keyboard.type(char)

            # Variable delay between characters
            delay = bounded_gaussian(*self.config.delay_range)

            # Longer pauses after punctuation
            if char in ".!?":
                delay *= random.uniform(1.5, 2.5)
            elif char in ",;:":
                delay *= random.uniform(1.2, 1.5)
            elif char == " ":
                delay *= random.uniform(0.8, 1.3)

            # Occasional longer pause (thinking)
            if random.random() < 0.02:  # 2% chance
                delay += random.uniform(300, 800)

            await asyncio.sleep(delay / 1000)

        logger.debug(f"Typed {len(text)} characters")

    async def _make_typo(self, intended_char: str):
        """Make a typo and correct it."""
        # Type a nearby key
        typo_char = self._get_nearby_key(intended_char)
        await self.page.keyboard.type(typo_char)

        # Wait a bit (noticing the mistake)
        await asyncio.sleep(random.uniform(*self.config.typo_fix_delay) / 1000)

        # Delete the typo
        await self.page.keyboard.press("Backspace")
        await asyncio.sleep(random.uniform(50, 150) / 1000)

        # Type the correct character
        await self.page.keyboard.type(intended_char)

        logger.debug(f"Made typo: {typo_char} -> {intended_char}")

    def _get_nearby_key(self, char: str) -> str:
        """Get a key that's nearby on the keyboard."""
        keyboard_layout = {
            'q': ['w', 'a', 's'],
            'w': ['q', 'e', 's', 'a'],
            'e': ['w', 'r', 'd', 's'],
            'r': ['e', 't', 'f', 'd'],
            't': ['r', 'y', 'g', 'f'],
            'y': ['t', 'u', 'h', 'g'],
            'u': ['y', 'i', 'j', 'h'],
            'i': ['u', 'o', 'k', 'j'],
            'o': ['i', 'p', 'l', 'k'],
            'p': ['o', 'l'],
            'a': ['q', 'w', 's', 'z'],
            's': ['a', 'w', 'e', 'd', 'z', 'x'],
            'd': ['s', 'e', 'r', 'f', 'x', 'c'],
            'f': ['d', 'r', 't', 'g', 'c', 'v'],
            'g': ['f', 't', 'y', 'h', 'v', 'b'],
            'h': ['g', 'y', 'u', 'j', 'b', 'n'],
            'j': ['h', 'u', 'i', 'k', 'n', 'm'],
            'k': ['j', 'i', 'o', 'l', 'm'],
            'l': ['k', 'o', 'p'],
            'z': ['a', 's', 'x'],
            'x': ['z', 's', 'd', 'c'],
            'c': ['x', 'd', 'f', 'v'],
            'v': ['c', 'f', 'g', 'b'],
            'b': ['v', 'g', 'h', 'n'],
            'n': ['b', 'h', 'j', 'm'],
            'm': ['n', 'j', 'k'],
        }

        char_lower = char.lower()
        if char_lower in keyboard_layout:
            typo = random.choice(keyboard_layout[char_lower])
            return typo.upper() if char.isupper() else typo

        # For other characters, return the same
        return char


class HumanScroll:
    """Human-like scrolling simulation."""

    def __init__(self, page: Page):
        self.page = page
        self.config = settings.human_behavior.scrolling

    async def scroll_randomly(
        self,
        duration: float | None = None,
        direction_bias: float = 0.6  # 60% down, 40% up
    ):
        """
        Scroll the page randomly for a duration.

        Args:
            duration: Duration in seconds (random from config if None)
            direction_bias: Probability of scrolling down vs up
        """
        if duration is None:
            duration = random.uniform(*self.config.pre_post_duration)

        logger.debug(f"Starting random scroll for {duration:.1f}s")

        start_time = asyncio.get_event_loop().time()
        end_time = start_time + duration

        while asyncio.get_event_loop().time() < end_time:
            # Decide direction
            scroll_down = random.random() < direction_bias

            # Scroll amount (pixels)
            base_amount = random.randint(100, 500)
            amount = base_amount if scroll_down else -base_amount

            # Scroll with variable speed
            await self._smooth_scroll(amount)

            # Pause between scrolls (reading content)
            pause = random.uniform(0.5, 3.0)
            await asyncio.sleep(pause)

        logger.debug("Random scroll completed")

    async def _smooth_scroll(self, total_amount: int, steps: int = 5):
        """Smooth scroll by amount in multiple steps."""
        step_amount = total_amount / steps

        for _ in range(steps):
            # Add some variance to each step
            variance = step_amount * self.config.speed_variation
            actual_step = step_amount + random.uniform(-variance, variance)

            await self.page.mouse.wheel(0, actual_step)
            await asyncio.sleep(random.uniform(30, 80) / 1000)

    async def scroll_to_element(self, element: Locator):
        """Scroll to make an element visible."""
        # Get element position
        box = await element.bounding_box()
        if not box:
            return

        # Get viewport height
        viewport = self.page.viewport_size
        if not viewport:
            viewport = {"height": 800}

        # Calculate scroll needed
        element_center = box["y"] + box["height"] / 2
        viewport_center = viewport["height"] / 2

        scroll_needed = element_center - viewport_center

        # Scroll smoothly
        if abs(scroll_needed) > 50:
            await self._smooth_scroll(int(scroll_needed), steps=8)
            await asyncio.sleep(random.uniform(200, 500) / 1000)


class HumanBehavior:
    """
    Combined human behavior simulation.

    Usage:
        human = HumanBehavior(page)
        await human.mouse.move_to(element)
        await human.mouse.click()
        await human.typing.type_text("Hello world")
        await human.scroll.scroll_randomly(duration=30)
    """

    def __init__(self, page: Page):
        self.page = page
        self.mouse = HumanMouse(page)
        self.typing = HumanTyping(page)
        self.scroll = HumanScroll(page)

    async def random_engagement(
        self,
        duration: float | None = None,
        click_probability: float = 0.3,
        scroll_probability: float = 0.7
    ):
        """
        Perform random human-like engagement actions.

        Args:
            duration: Duration in seconds
            click_probability: Probability of clicking something
            scroll_probability: Probability of scrolling
        """
        if duration is None:
            duration = random.uniform(
                *settings.human_behavior.group_engagement.time_on_group
            )

        logger.info(f"Random engagement for {duration:.1f}s")

        start_time = asyncio.get_event_loop().time()
        end_time = start_time + duration

        while asyncio.get_event_loop().time() < end_time:
            action = random.random()

            if action < scroll_probability:
                # Scroll a bit
                scroll_duration = random.uniform(2, 8)
                await self.scroll.scroll_randomly(duration=scroll_duration)

            elif action < scroll_probability + click_probability:
                # Try to click something random
                try:
                    # Find clickable elements
                    links = await self.page.query_selector_all("a[href]")
                    if links:
                        element = random.choice(links[:10])  # Limit to first 10
                        box = await element.bounding_box()
                        if box:
                            await self.mouse.move_to(Point(
                                box["x"] + box["width"] / 2,
                                box["y"] + box["height"] / 2
                            ))
                            # Don't always click after moving
                            if random.random() < 0.3:
                                await self.mouse.click()
                except Exception as e:
                    logger.debug(f"Click action failed: {e}")

            # Random pause
            await asyncio.sleep(random.uniform(1, 4))

        logger.info("Random engagement completed")

    async def wait_human(self, min_seconds: float, max_seconds: float):
        """Wait a random human-like duration."""
        duration = bounded_gaussian(min_seconds, max_seconds)
        logger.debug(f"Human wait: {duration:.1f}s")
        await asyncio.sleep(duration)
