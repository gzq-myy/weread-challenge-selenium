const path = require('path');
const { chromium } = require('patchright');

const Browser = {
  CHROME: 'chrome',
  EDGE: 'edge',
};

const Key = {
  ARROW_DOWN: 'ArrowDown',
  PAGE_DOWN: 'PageDown',
  NULL: 'NULL',
};

class LocatorSpec {
  constructor(using, value) {
    this.using = using;
    this.value = value;
  }

  toString() {
    return `${this.using}: ${this.value}`;
  }
}

const By = {
  css(value) {
    return new LocatorSpec('css', value);
  },
  xpath(value) {
    return new LocatorSpec('xpath', value);
  },
};

const until = {
  elementLocated(locator) {
    return async (driver) => driver.findElement(locator);
  },
  stalenessOf(element) {
    return async () => !(await element.exists());
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function selectorFor(locator) {
  if (!(locator instanceof LocatorSpec)) {
    throw new Error(`Unsupported locator: ${locator}`);
  }

  if (locator.using === 'xpath') {
    return `xpath=${locator.value}`;
  }
  return locator.value;
}

function sanitizeCookie(cookie, currentUrl) {
  const normalized = {
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
  };

  if (cookie.domain) {
    normalized.domain = cookie.domain;
  } else {
    normalized.url = currentUrl;
  }

  if (cookie.expiry !== undefined) {
    normalized.expires = cookie.expiry;
  } else if (cookie.expires !== undefined) {
    normalized.expires = cookie.expires;
  }

  if (cookie.httpOnly !== undefined) {
    normalized.httpOnly = Boolean(cookie.httpOnly);
  }
  if (cookie.secure !== undefined) {
    normalized.secure = Boolean(cookie.secure);
  }

  const sameSite = String(cookie.sameSite || '').toLowerCase();
  if (sameSite === 'strict') {
    normalized.sameSite = 'Strict';
  } else if (sameSite === 'lax') {
    normalized.sameSite = 'Lax';
  } else if (sameSite === 'none') {
    normalized.sameSite = 'None';
  }

  return normalized;
}

class PatchrightElement {
  constructor(driver, locator) {
    this.driver = driver;
    this.locator = locator;
  }

  async exists() {
    return (await this.locator.count()) > 0;
  }

  async click() {
    await this.locator.first().click({ timeout: 5000 });
  }

  async getText() {
    const element = this.locator.first();
    try {
      return await element.innerText({ timeout: 3000 });
    } catch (_) {
      return await element.textContent({ timeout: 3000 }) || '';
    }
  }

  async getAttribute(attribute) {
    return await this.locator.first().getAttribute(attribute, { timeout: 3000 });
  }

  async isDisplayed() {
    try {
      return await this.locator.first().isVisible({ timeout: 1000 });
    } catch (_) {
      return false;
    }
  }

  async takeScreenshot() {
    const image = await this.locator.first().screenshot({ timeout: 5000 });
    return image.toString('base64');
  }

  async findElements(locator) {
    const childLocator = this.locator.first().locator(selectorFor(locator));
    const count = await childLocator.count();
    return Array.from({ length: count }, (_, index) => (
      new PatchrightElement(this.driver, childLocator.nth(index))
    ));
  }

  async elementHandle() {
    return await this.locator.first().elementHandle({ timeout: 5000 });
  }
}

class PatchrightActions {
  constructor(driver) {
    this.driver = driver;
    this.steps = [];
  }

  sendKeys(key) {
    this.steps.push({ type: 'key', key });
    return this;
  }

  move({ origin }) {
    this.steps.push({ type: 'move', origin });
    return this;
  }

  click() {
    this.steps.push({ type: 'click' });
    return this;
  }

  async perform() {
    let activeElement = null;
    for (const step of this.steps) {
      if (step.type === 'key') {
        if (step.key !== Key.NULL) {
          await this.driver.page.keyboard.press(step.key);
        }
        continue;
      }

      if (step.type === 'move') {
        activeElement = step.origin;
        continue;
      }

      if (step.type === 'click') {
        if (activeElement) {
          await activeElement.click();
        } else {
          await this.driver.page.mouse.click(0, 0);
        }
      }
    }
  }
}

class PatchrightDriver {
  constructor(context, page) {
    this.context = context;
    this.page = page;
    this.timeouts = {
      implicit: 5000,
      pageLoad: 60000,
      script: 30000,
    };
  }

  async get(url) {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeouts.pageLoad,
    });
  }

  navigate() {
    return {
      refresh: async () => {
        await this.page.reload({
          waitUntil: 'domcontentloaded',
          timeout: this.timeouts.pageLoad,
        });
      },
    };
  }

  manage() {
    return {
      setTimeouts: async (timeouts = {}) => {
        this.timeouts = { ...this.timeouts, ...timeouts };
      },
      getCookies: async () => this.context.cookies(),
      addCookie: async (cookie) => {
        await this.context.addCookies([sanitizeCookie(cookie, this.page.url())]);
      },
      window: () => ({
        setRect: async ({ width, height }) => {
          await this.page.setViewportSize({ width, height });
        },
      }),
    };
  }

  async getTitle() {
    return await this.page.title();
  }

  async getCurrentUrl() {
    return this.page.url();
  }

  async findElements(locator) {
    const pageLocator = this.page.locator(selectorFor(locator));
    const count = await pageLocator.count();
    return Array.from({ length: count }, (_, index) => (
      new PatchrightElement(this, pageLocator.nth(index))
    ));
  }

  async findElement(locator) {
    const pageLocator = this.page.locator(selectorFor(locator)).first();
    await pageLocator.waitFor({
      state: 'attached',
      timeout: this.timeouts.implicit,
    });
    return new PatchrightElement(this, pageLocator);
  }

  async wait(condition, timeoutMs = 5000) {
    if (condition && typeof condition.then === 'function') {
      return await withTimeout(
        condition,
        timeoutMs,
        `Timed out after ${timeoutMs}ms waiting for promise`
      );
    }

    if (typeof condition !== 'function') {
      return condition;
    }

    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const result = await condition(this);
        if (result) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
      await sleep(200);
    }

    throw lastError || new Error(`Timed out after ${timeoutMs}ms`);
  }

  async executeScript(script, ...args) {
    const convertedArgs = [];
    for (const arg of args) {
      if (arg instanceof PatchrightElement) {
        convertedArgs.push(await arg.elementHandle());
      } else {
        convertedArgs.push(arg);
      }
    }

    return await this.page.evaluate(
      ({ source, values }) => {
        const scriptFunction = new Function(source);
        return scriptFunction(...values);
      },
      { source: script, values: convertedArgs }
    );
  }

  async takeScreenshot() {
    const image = await this.page.screenshot({ timeout: 30000 });
    return image.toString('base64');
  }

  actions() {
    return new PatchrightActions(this);
  }

  async scrollWheel(deltaY, deltaX = 0) {
    await this.page.mouse.wheel(deltaX, deltaY);
  }

  async keyDown(key) {
    await this.page.keyboard.down(key);
  }

  async keyUp(key) {
    await this.page.keyboard.up(key);
  }

  async moveMouse(x, y, steps = 8) {
    await this.page.mouse.move(x, y, { steps });
  }

  async quit() {
    await this.context.close();
  }
}

function parseHeadlessValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return true;
  }
  return !['false', '0', 'no', 'off'].includes(String(rawValue).trim().toLowerCase());
}

async function createPatchrightDriver(options = {}) {
  const browserName = options.browserName || Browser.CHROME;
  if (![Browser.CHROME, Browser.EDGE].includes(browserName)) {
    throw new Error('Patchright 仅支持 Chromium 内核浏览器，请将 WEREAD_BROWSER 设置为 chrome 或 edge。');
  }

  const userDataDir = path.resolve(
    options.dataDir || '.weread',
    'browser-profiles',
    options.user || 'weread-default'
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserName === Browser.EDGE ? 'msedge' : undefined,
    headless: parseHeadlessValue(options.headless),
    viewport: null,
    locale: 'zh-CN',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-popup-blocking',
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  return new PatchrightDriver(context, page);
}

module.exports = {
  By,
  Browser,
  Key,
  until,
  createPatchrightDriver,
};
