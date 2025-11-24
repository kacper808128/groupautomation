/**
 * Human Behavior Simulation - Anti-Ban Stack 2025
 *
 * Implementuje:
 * - Bezier curves dla ruchu myszki (nie liniowe!)
 * - Realistyczne pisanie z opóźnieniami 120-380ms i literówkami
 * - Scrollowanie z losowymi pauzami
 * - Gaussian random zamiast uniform
 */

const { USER_AGENTS } = require('./fingerprint-manager');

// === GAUSSIAN RANDOM ===
function gaussianRandom(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

function boundedGaussian(min, max) {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6;
  let value = gaussianRandom(mean, stdDev);
  return Math.max(min, Math.min(max, value));
}

// === RANDOM DELAY ===
function randomDelay(min, max) {
  // Użyj gaussian dla bardziej naturalnej dystrybucji
  const delay = boundedGaussian(min, max);
  return new Promise(resolve => setTimeout(resolve, Math.floor(delay)));
}

// === BEZIER CURVES DLA MYSZKI ===

class BezierCurve {
  static getPoint(t, points) {
    const n = points.length - 1;
    let x = 0, y = 0;

    for (let i = 0; i <= n; i++) {
      const coeff = this.binomial(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
      x += coeff * points[i].x;
      y += coeff * points[i].y;
    }

    return { x, y };
  }

  static binomial(n, k) {
    let result = 1;
    for (let i = 1; i <= k; i++) {
      result = result * (n - i + 1) / i;
    }
    return result;
  }

  static generateCurve(start, end, numControlPoints = 3, variance = 0.3) {
    const points = [start];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    for (let i = 1; i <= numControlPoints; i++) {
      const t = i / (numControlPoints + 1);

      // Punkt na prostej linii
      const baseX = start.x + dx * t;
      const baseY = start.y + dy * t;

      // Dodaj prostopadłe przesunięcie (szum)
      const offsetMagnitude = distance * variance * gaussianRandom(0, 0.5);
      const angle = Math.atan2(dy, dx) + Math.PI / 2;

      const controlX = baseX + offsetMagnitude * Math.cos(angle);
      const controlY = baseY + offsetMagnitude * Math.sin(angle);

      points.push({ x: controlX, y: controlY });
    }

    points.push(end);
    return points;
  }
}

// === HUMAN MOUSE MOVEMENT ===

class HumanMouse {
  constructor(page) {
    this.page = page;
    this.currentPos = { x: 0, y: 0 };

    // Konfiguracja z checklisty
    this.config = {
      speedRange: [400, 1200], // px/s
      overshootPercent: [5, 15],
      bezierPoints: [3, 7],
    };
  }

  async moveTo(target, options = {}) {
    const { steps = null, overshoot = true } = options;

    // Oblicz dystans
    const dx = target.x - this.currentPos.x;
    const dy = target.y - this.currentPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Auto-oblicz liczbę kroków na podstawie dystansu
    const numSteps = steps || Math.max(10, Math.floor(distance / 10));

    // Overshoot
    let overshootTarget = target;
    if (overshoot && Math.random() < 0.7) {
      const overshootPct = boundedGaussian(
        this.config.overshootPercent[0] / 100,
        this.config.overshootPercent[1] / 100
      );
      overshootTarget = {
        x: target.x + dx * overshootPct,
        y: target.y + dy * overshootPct,
      };
    }

    // Generuj krzywą Beziera
    const numControl = Math.floor(boundedGaussian(...this.config.bezierPoints));
    const controlPoints = BezierCurve.generateCurve(
      this.currentPos,
      overshoot ? overshootTarget : target,
      numControl
    );

    // Oblicz prędkość
    const speed = boundedGaussian(...this.config.speedRange);
    const baseDelay = (distance / speed) / numSteps * 1000;

    // Ruch wzdłuż krzywej
    for (let i = 1; i <= numSteps; i++) {
      const t = i / numSteps;

      // Ease in-out
      const tEased = t * t * (3.0 - 2.0 * t);
      const point = BezierCurve.getPoint(tEased, controlPoints);

      // Zmienny delay (wolniej na początku i końcu)
      const delayMultiplier = 1 + 0.5 * Math.sin(Math.PI * t);
      const delay = baseDelay * delayMultiplier * boundedGaussian(0.8, 1.2);

      await this.page.mouse.move(point.x, point.y);
      this.currentPos = point;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Korekta overshoot
    if (overshoot && overshootTarget !== target) {
      await randomDelay(50, 150);
      await this.smallCorrection(target);
    }

    return this.currentPos;
  }

  async smallCorrection(target) {
    const steps = Math.floor(boundedGaussian(3, 7));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = this.currentPos.x + (target.x - this.currentPos.x) * t;
      const y = this.currentPos.y + (target.y - this.currentPos.y) * t;

      await this.page.mouse.move(x, y);
      this.currentPos = { x, y };
      await randomDelay(10, 30);
    }
  }

  async click(target = null, button = 'left') {
    if (target) {
      await this.moveTo(target);
    }

    // Losowy delay między press i release
    const delay = boundedGaussian(50, 150);

    await this.page.mouse.down({ button });
    await new Promise(resolve => setTimeout(resolve, delay));
    await this.page.mouse.up({ button });
  }

  async clickElement(element) {
    const box = await element.boundingBox();
    if (!box) throw new Error('Element not visible');

    // Kliknij w środek z losowym przesunięciem
    const target = {
      x: box.x + box.width * boundedGaussian(0.3, 0.7),
      y: box.y + box.height * boundedGaussian(0.3, 0.7),
    };

    await this.click(target);
  }
}

// === HUMAN TYPING ===

class HumanTyping {
  constructor(page) {
    this.page = page;

    // Konfiguracja z checklisty: 120-380ms między znakami
    this.config = {
      delayRange: [120, 380],
      typoProbability: 0.03, // 3% szans na literówkę
      typoFixDelay: [200, 600],
    };
  }

  async typeText(text, element = null) {
    if (element) {
      await element.focus();
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Losowa literówka
      if (Math.random() < this.config.typoProbability) {
        await this.makeTypo(char);
      } else {
        await this.page.keyboard.type(char);
      }

      // Zmienny delay między znakami
      let delay = boundedGaussian(...this.config.delayRange);

      // Dłuższe pauzy po interpunkcji
      if ('.!?'.includes(char)) {
        delay *= boundedGaussian(1.5, 2.5);
      } else if (',;:'.includes(char)) {
        delay *= boundedGaussian(1.2, 1.5);
      } else if (char === ' ') {
        delay *= boundedGaussian(0.8, 1.3);
      }

      // Losowa dłuższa pauza (myślenie)
      if (Math.random() < 0.02) {
        delay += boundedGaussian(300, 800);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async makeTypo(intendedChar) {
    // Wpisz literówkę
    const typoChar = this.getNearbyKey(intendedChar);
    await this.page.keyboard.type(typoChar);

    // Czekaj (zauważenie błędu)
    await randomDelay(...this.config.typoFixDelay);

    // Skasuj
    await this.page.keyboard.press('Backspace');
    await randomDelay(50, 150);

    // Wpisz poprawny znak
    await this.page.keyboard.type(intendedChar);
  }

  getNearbyKey(char) {
    const keyboard = {
      'q': ['w', 'a', 's'], 'w': ['q', 'e', 's', 'a'], 'e': ['w', 'r', 'd', 's'],
      'r': ['e', 't', 'f', 'd'], 't': ['r', 'y', 'g', 'f'], 'y': ['t', 'u', 'h', 'g'],
      'u': ['y', 'i', 'j', 'h'], 'i': ['u', 'o', 'k', 'j'], 'o': ['i', 'p', 'l', 'k'],
      'p': ['o', 'l'], 'a': ['q', 'w', 's', 'z'], 's': ['a', 'w', 'e', 'd', 'z', 'x'],
      'd': ['s', 'e', 'r', 'f', 'x', 'c'], 'f': ['d', 'r', 't', 'g', 'c', 'v'],
      'g': ['f', 't', 'y', 'h', 'v', 'b'], 'h': ['g', 'y', 'u', 'j', 'b', 'n'],
      'j': ['h', 'u', 'i', 'k', 'n', 'm'], 'k': ['j', 'i', 'o', 'l', 'm'],
      'l': ['k', 'o', 'p'], 'z': ['a', 's', 'x'], 'x': ['z', 's', 'd', 'c'],
      'c': ['x', 'd', 'f', 'v'], 'v': ['c', 'f', 'g', 'b'], 'b': ['v', 'g', 'h', 'n'],
      'n': ['b', 'h', 'j', 'm'], 'm': ['n', 'j', 'k'],
    };

    const lower = char.toLowerCase();
    if (keyboard[lower]) {
      const typo = keyboard[lower][Math.floor(Math.random() * keyboard[lower].length)];
      return char === char.toUpperCase() ? typo.toUpperCase() : typo;
    }
    return char;
  }
}

// === HUMAN SCROLLING ===

class HumanScroll {
  constructor(page) {
    this.page = page;

    // Konfiguracja z checklisty
    this.config = {
      prePostDuration: [15, 60], // sekundy przed napisaniem posta
      postPublishDuration: [45, 240], // sekundy po opublikowaniu
      speedVariation: 0.3,
    };
  }

  async scrollRandomly(duration = null, directionBias = 0.6) {
    if (duration === null) {
      duration = boundedGaussian(...this.config.prePostDuration);
    }

    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    while (Date.now() < endTime) {
      // Kierunek
      const scrollDown = Math.random() < directionBias;

      // Ilość
      const baseAmount = Math.floor(boundedGaussian(100, 500));
      const amount = scrollDown ? baseAmount : -baseAmount;

      // Płynny scroll
      await this.smoothScroll(amount);

      // Pauza (czytanie)
      await randomDelay(500, 3000);
    }
  }

  async smoothScroll(totalAmount, steps = 5) {
    const stepAmount = totalAmount / steps;

    for (let i = 0; i < steps; i++) {
      const variance = stepAmount * this.config.speedVariation;
      const actualStep = stepAmount + boundedGaussian(-variance, variance);

      await this.page.mouse.wheel({ deltaY: actualStep });
      await randomDelay(30, 80);
    }
  }

  async scrollToElement(element) {
    const box = await element.boundingBox();
    if (!box) return;

    const viewportSize = await this.page.viewportSize();
    const elementCenter = box.y + box.height / 2;
    const viewportCenter = viewportSize.height / 2;
    const scrollNeeded = elementCenter - viewportCenter;

    if (Math.abs(scrollNeeded) > 50) {
      await this.smoothScroll(scrollNeeded, 8);
      await randomDelay(200, 500);
    }
  }
}

// === LEGACY FUNCTIONS (dla kompatybilności) ===

async function randomTyping(page, selector, text, isContentEditable = false) {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
  } catch (e) {
    // Kontynuuj mimo braku selektora
  }
  await page.click(selector);
  await randomDelay(300, 600);

  const typing = new HumanTyping(page);

  // Dla kompatybilności - używamy prostszego pisania
  for (let char of text) {
    await page.keyboard.type(char);
    const charDelay = boundedGaussian(80, 200);
    await randomDelay(charDelay, charDelay + 20);

    if (Math.random() < 0.05) {
      await randomDelay(500, 1500);
    }
  }
}

async function naturalMouseMovement(page, x, y) {
  const mouse = new HumanMouse(page);
  await mouse.moveTo({ x, y });
}

async function naturalScroll(page, distance = 300) {
  const scroll = new HumanScroll(page);
  await scroll.smoothScroll(distance);
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function calculateReadingTime(text) {
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 200 + Math.random() * 50;
  const minutes = words / wordsPerMinute;
  const milliseconds = minutes * 60 * 1000;
  const variance = milliseconds * 0.3;
  return milliseconds + (Math.random() * variance * 2 - variance);
}

async function detectCaptcha(page) {
  const captchaSelectors = [
    'iframe[src*="captcha"]',
    'div[id*="captcha"]',
    '.g-recaptcha',
    'iframe[src*="recaptcha"]'
  ];

  for (const selector of captchaSelectors) {
    try {
      const element = await page.$(selector);
      if (element) return true;
    } catch (e) {
      continue;
    }
  }
  return false;
}

async function randomBreak() {
  if (Math.random() < 0.05) {
    const breakTime = boundedGaussian(10000, 40000);
    await randomDelay(breakTime, breakTime + 5000);
  }
}

async function simulateActivity(page) {
  const scroll = new HumanScroll(page);
  const mouse = new HumanMouse(page);

  const actions = Math.floor(boundedGaussian(1, 4));

  for (let i = 0; i < actions; i++) {
    if (Math.random() < 0.6) {
      await scroll.smoothScroll(boundedGaussian(100, 400));
    } else {
      const x = Math.floor(boundedGaussian(100, 900));
      const y = Math.floor(boundedGaussian(100, 700));
      await mouse.moveTo({ x, y });
    }
    await randomDelay(300, 1000);
  }
}

// === NOWE FUNKCJE DLA CHECKLISTY ===

// Engagement na grupie (20-90 sekund, 2-5 kliknięć, 0-2 lajki)
async function engageWithGroup(page, duration = null) {
  const scroll = new HumanScroll(page);
  const mouse = new HumanMouse(page);

  if (duration === null) {
    duration = boundedGaussian(20, 90);
  }

  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  let clicks = 0;
  let likes = 0;
  const targetClicks = Math.floor(boundedGaussian(2, 5));
  const targetLikes = Math.floor(boundedGaussian(0, 2));

  while (Date.now() < endTime) {
    const action = Math.random();

    if (action < 0.6) {
      // Scroll
      await scroll.scrollRandomly(boundedGaussian(2, 8));
    } else if (clicks < targetClicks) {
      // Kliknij post (bez nawigacji)
      clicks++;
      await randomDelay(1000, 3000);
    }

    await randomDelay(1000, 3000);
  }

  return { clicks, likes };
}

// Post-publish engagement (45-240 sekund)
async function postPublishEngagement(page) {
  const duration = boundedGaussian(45, 240);
  await engageWithGroup(page, duration);
}

// "Ludzki błąd" - raz na 10-15 postów
async function performHumanError(page) {
  const errorType = ['wrong_click', 'scroll_away', 'back_navigation'][Math.floor(Math.random() * 3)];

  const scroll = new HumanScroll(page);

  if (errorType === 'wrong_click') {
    await scroll.scrollRandomly(boundedGaussian(2, 5));
    await randomDelay(1000, 3000);
  } else if (errorType === 'scroll_away') {
    await scroll.smoothScroll(boundedGaussian(500, 1000));
    await randomDelay(2000, 4000);
    await scroll.smoothScroll(-boundedGaussian(500, 1000));
  } else if (errorType === 'back_navigation') {
    await page.goBack();
    await randomDelay(1000, 3000);
    await page.goForward();
    await randomDelay(1000, 2000);
  }

  return errorType;
}

module.exports = {
  // Nowe klasy
  HumanMouse,
  HumanTyping,
  HumanScroll,
  BezierCurve,

  // Funkcje pomocnicze
  gaussianRandom,
  boundedGaussian,
  randomDelay,

  // Legacy (dla kompatybilności)
  randomTyping,
  naturalMouseMovement,
  naturalScroll,
  getRandomUserAgent,
  calculateReadingTime,
  detectCaptcha,
  randomBreak,
  simulateActivity,

  // Nowe funkcje
  engageWithGroup,
  postPublishEngagement,
  performHumanError,
};
