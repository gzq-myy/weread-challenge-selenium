#!/usr/bin/env node
/**
 * @license
 * Copyright (c) 2024 weread-challenge@techfetch.dev
 * All rights reserved.
 * Licensed under the MIT License.
 * For more information, contact: weread-challenge@techfetch.dev
 */

require("dotenv").config({ quiet: true });

const { By, Builder, Browser, until, Key } = require("selenium-webdriver");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync, spawnSync } = require("child_process");
const os = require("os");

function getWereadVersion() {
  const packageJsonPaths = [
    path.resolve(__dirname, "../package.json"),
    path.resolve(__dirname, "./package.json"),
  ];

  for (const packageJsonPath of packageJsonPaths) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (pkg && typeof pkg.version === "string" && pkg.version.trim() !== "") {
        return pkg.version.trim();
      }
    } catch (_) {}
  }

  return process.env.WEREAD_VERSION || "0.0.0";
}

const WEREAD_VERSION = getWereadVersion();
const WEREAD_URL = "https://weread.qq.com/"; // Replace with the target URL
const WEREAD_SHELF_URL = new URL("/web/shelf", WEREAD_URL).toString();
const DEFAULT_WEREAD_DATA_DIR = ".weread";
const QR_EXPIRED_TEXTS = ["点击刷新二维码", "二维码已失效"]; // 登录二维码过期提示
const SHELF_MARKER_XPATH =
  "//*[contains(text(), '我的书架') or contains(@href, '/web/shelf') or contains(@class, 'wr_index_mini_shelf_card')]";
let lastPushedLoginLink = "";
let logStream = null;
let DEBUG = false; // Enable debug mode
let WEREAD_USER = "weread-default"; // User to use
let WEREAD_REMOTE_BROWSER = "";
let WEREAD_DURATION = 10; // Reading duration in minutes
let WEREAD_SPEED = "slow"; // Reading speed, slow | normal | fast
let WEREAD_BROWSER = Browser.CHROME; // Browser to use, chrome | MicrosoftEdge | firefox
let WEREAD_SCREENSHOT = true; // Reading期间是否每分钟截图
let BARK_KEY = ""; // Bark推送密钥
let BARK_SERVER = "https://api.day.app"; // Bark服务器地址
let WEBHOOK_URL = ""; // Webhook通知地址
let WEREAD_DATA_DIR = DEFAULT_WEREAD_DATA_DIR; // 默认数据目录
let WEREAD_KEYWORDS = ""; // 关键词选书，逗号分隔
let DEFAULT_BOOK_URL = ""; // 配置后直接阅读该链接
// env vars:
// WEREAD_REMOTE_BROWSER
// WEREAD_DURATION
// WEREAD_BROWSER
// WEREAD_SCREENSHOT
// BARK_KEY
// BARK_SERVER
// WEBHOOK_URL
// WEREAD_DATA_DIR
// WEREAD_KEYWORDS
// DEFAULT_BOOK_URL

const RUN_OPTION_SPECS = [
  { envKey: "DEBUG", flag: "debug", type: "boolean", description: "Enable debug logging." },
  { envKey: "WEREAD_USER", flag: "weread-user", type: "string", description: "Browser profile directory name." },
  { envKey: "WEREAD_REMOTE_BROWSER", flag: "weread-remote-browser", type: "string", description: "Remote Selenium URL." },
  { envKey: "WEREAD_DURATION", flag: "weread-duration", type: "integer", description: "Reading duration in minutes." },
  { envKey: "WEREAD_SPEED", flag: "weread-speed", type: "string", description: "Reading speed: slow | normal | fast." },
  { envKey: "WEREAD_BROWSER", flag: "weread-browser", type: "string", description: "Browser name: chrome | MicrosoftEdge | firefox | safari." },
  { envKey: "WEREAD_SCREENSHOT", flag: "weread-screenshot", type: "boolean", description: "Capture screenshots while reading." },
  { envKey: "BARK_KEY", flag: "bark-key", type: "string", description: "Bark notification key." },
  { envKey: "BARK_SERVER", flag: "bark-server", type: "string", description: "Bark server base URL." },
  { envKey: "WEBHOOK_URL", flag: "webhook-url", type: "string", description: "Webhook notification URL." },
  { envKey: "WEREAD_DATA_DIR", flag: "weread-data-dir", type: "string", description: "Data directory for cookies, logs and screenshots." },
  { envKey: "WEREAD_KEYWORDS", flag: "weread-keywords", type: "string", description: "Comma-separated shelf book title keywords." },
  { envKey: "DEFAULT_BOOK_URL", flag: "default-book-url", type: "string", description: "Reading URL. When set, the run opens it directly." },
];

function parseBooleanValue(value, defaultValue = false, strict = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  if (!strict) {
    return defaultValue;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseIntegerValue(value, flagName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${flagName} must be an integer`);
  }
  return parsed;
}

function parseDurationValue(value, defaultValue = 10, options = {}) {
  const quiet = options.quiet === true;
  const rawValue = String(value ?? defaultValue).trim();

  if (rawValue.includes("-")) {
    const [minText, maxText] = rawValue.split("-").map((item) => item.trim());
    const min = Number.parseInt(minText, 10);
    const max = Number.parseInt(maxText, 10);
    const isValidRange =
      Number.isInteger(min) &&
      Number.isInteger(max) &&
      min > 0 &&
      max > 0 &&
      min <= max;

    if (!isValidRange) {
      if (!quiet) {
        console.warn(
          `Invalid reading duration range: "${rawValue}". Defaulting to ${defaultValue} minutes.`
        );
      }
      return defaultValue;
    }

    const duration = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!quiet) {
      console.info(
        `Reading duration range: ${min}-${max} minutes. This run will be ${duration} minutes.`
      );
    }
    return duration;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    if (!quiet) {
      console.warn(
        `Invalid reading duration: "${rawValue}". Defaulting to ${defaultValue} minutes.`
      );
    }
    return defaultValue;
  }

  return parsed;
}

function parseKeywordList(rawKeywords) {
  return String(rawKeywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function resolveBookCardTitle(driver, book) {
  const candidateSelectors = [
    "div.title",
    "[class*='title']",
    "a[title]",
    "img[alt]",
  ];
  const candidateAttributes = ["title", "aria-label", "alt"];

  for (const selector of candidateSelectors) {
    const elements = await book.findElements(By.css(selector));
    for (const element of elements) {
      const values = [];

      try {
        values.push(await element.getText());
      } catch (_) {}

      for (const attribute of candidateAttributes) {
        try {
          values.push(await element.getAttribute(attribute));
        } catch (_) {}
      }

      const title = values.map((value) => String(value || "").trim()).find(Boolean);
      if (title) {
        return title;
      }
    }
  }

  try {
    const rawText = await driver.executeScript(
      "return arguments[0]?.innerText || arguments[0]?.textContent || '';",
      book
    );
    const lines = String(rawText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      return lines[0];
    }
  } catch (_) {}

  return "";
}

async function detectShelfLoginState(driver) {
  try {
    const currentUrl = await driver.getCurrentUrl();
    if (String(currentUrl || "").includes("/web/shelf")) {
      return { loggedIn: true, reason: `url=${currentUrl}` };
    }
  } catch (_) {}

  try {
    const markers = await driver.findElements(By.xpath(SHELF_MARKER_XPATH));
    if (markers.length > 0) {
      return { loggedIn: true, reason: "shelf marker found" };
    }
  } catch (_) {}

  return { loggedIn: false, reason: "" };
}

async function openShelfForKeywordSelection(driver) {
  console.info("WEREAD_KEYWORDS 已配置，打开我的书架:", WEREAD_SHELF_URL);
  await driver.get(WEREAD_SHELF_URL);
  await driver.wait(until.elementLocated(By.xpath(SHELF_MARKER_XPATH)), 10000);
  console.info("已打开我的书架。");
}

function resolveDefaultDataDir() {
  return DEFAULT_WEREAD_DATA_DIR;
}

function setRuntimeConfigFromEnv(env = process.env, options = {}) {
  DEBUG = parseBooleanValue(env.DEBUG, false, false);
  WEREAD_USER = env.WEREAD_USER || "weread-default";
  WEREAD_REMOTE_BROWSER = env.WEREAD_REMOTE_BROWSER || "";
  WEREAD_DURATION = env.WEREAD_DURATION === undefined
    ? 10
    : parseDurationValue(env.WEREAD_DURATION, 10, options);
  WEREAD_SPEED = env.WEREAD_SPEED || "slow";
  WEREAD_BROWSER = env.WEREAD_BROWSER || Browser.CHROME;
  WEREAD_SCREENSHOT = env.WEREAD_SCREENSHOT === undefined
    ? true
    : parseBooleanValue(env.WEREAD_SCREENSHOT, true, false);
  BARK_KEY = env.BARK_KEY || "";
  BARK_SERVER = env.BARK_SERVER || "https://api.day.app";
  WEBHOOK_URL = env.WEBHOOK_URL || "";
  WEREAD_DATA_DIR = String(env.WEREAD_DATA_DIR || "").trim() || resolveDefaultDataDir();
  WEREAD_KEYWORDS = env.WEREAD_KEYWORDS || "";
  DEFAULT_BOOK_URL = String(env.DEFAULT_BOOK_URL || "").trim();
}

function getRunFlagValue(flags, spec) {
  if (Object.prototype.hasOwnProperty.call(flags, spec.flag)) {
    return flags[spec.flag];
  }
  if (Object.prototype.hasOwnProperty.call(flags, spec.envKey)) {
    return flags[spec.envKey];
  }
  return undefined;
}

function applyRunCliOverrides(flags = {}) {
  for (const spec of RUN_OPTION_SPECS) {
    const rawValue = getRunFlagValue(flags, spec);
    if (rawValue === undefined) {
      continue;
    }

    if (spec.type === "boolean") {
      process.env[spec.envKey] = parseBooleanValue(rawValue, true, true) ? "true" : "false";
      continue;
    }

    if (spec.type === "integer") {
      process.env[spec.envKey] = String(parseIntegerValue(rawValue, spec.flag));
      continue;
    }

    process.env[spec.envKey] = String(rawValue);
  }

  setRuntimeConfigFromEnv(process.env);
}

function getRunOptionsHelpLines() {
  return RUN_OPTION_SPECS.map(
    (spec) =>
      `  --${spec.flag}    ${spec.description} Env: ${spec.envKey}`
  ).join("\n");
}

setRuntimeConfigFromEnv(process.env, { quiet: true });

function getDataDirPath() {
  return path.resolve(WEREAD_DATA_DIR);
}

function getCookieFilePath() {
  return path.join(getDataDirPath(), "cookies.json");
}

function getLoginQrCodePath() {
  return path.join(getDataDirPath(), "login.png");
}

function getOutputLogPath() {
  return path.join(getDataDirPath(), "output.log");
}

function getScreenshotPath(fileName = "screenshot.png") {
  return path.join(getDataDirPath(), fileName);
}

function ensureDataDir() {
  const dataDir = getDataDirPath();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function initializeRuntime() {
  if (logStream) {
    return;
  }

  ensureDataDir();
  logStream = fs.createWriteStream(getOutputLogPath(), { flags: "w" });

  if (!DEBUG) {
    ["info", "warn", "error"].forEach(redirectConsole);
  }
}

function formatLocalTimestamp(d = new Date()) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}.${pad3(d.getMilliseconds())}`;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Utility function to redirect logging
function redirectConsole(method) {
  const originalMethod = console[method];
  console[method] = function (...args) {
    let logstr = `[${method.toUpperCase()}][${formatLocalTimestamp()}]: ` + args.join(" ");

    // Write to the log file
    if (logStream) {
      logStream.write(logstr + "\r\n");
    }

    // Also log to the console
    console.log(logstr);
  };
}

// --- 诊断与健康检查工具函数 ---
function isHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function fetchJson(url, timeoutMs = 3000) {
  return await new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data || "{}") });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
  });
}

async function checkSeleniumHealth(remoteUrl) {
  try {
    if (!remoteUrl || !isHttpUrl(remoteUrl)) {
      console.warn("跳过健康检查：WEREAD_REMOTE_BROWSER 未设置或非法。");
      return null;
    }
    // 优先 /status，兼容 /wd/hub/status
    const base = remoteUrl.endsWith("/") ? remoteUrl.slice(0, -1) : remoteUrl;
    const endpoints = ["/status", "/wd/hub/status"];
    for (const ep of endpoints) {
      try {
        const { statusCode, body } = await fetchJson(`${base}${ep}`, 3000);
        if (statusCode >= 200 && statusCode < 300) {
          const ready = body?.ready ?? body?.value?.ready;
          console.info(`Selenium 健康检查 ${ep} 响应: ready=${ready}`);
          return { endpoint: ep, ready, raw: body };
        }
      } catch (_) {
        // 继续尝试下一个端点
      }
    }
    console.warn("Selenium 健康检查失败：所有端点无有效响应。");
    return null;
  } catch (e) {
    console.warn("Selenium 健康检查异常：", e.message || e);
    return null;
  }
}

function dockerAvailable() {
  try {
    const out = spawnSync("docker", ["version"], { encoding: "utf8" });
    return out.status === 0;
  } catch (_) {
    return false;
  }
}

function findSeleniumContainers() {
  try {
    const out = execSync(
      'docker ps --format "{{.ID}}\t{{.Image}}\t{{.Names}}"',
      { encoding: "utf8" }
    );
    const lines = out.split(/\r?\n/).filter(Boolean);
    const hits = lines
      .map((l) => {
        const [id, image, name] = l.split(/\t/);
        return { id, image, name };
      })
      .filter((x) =>
        /selenium\/(standalone-|node-).*chrome/i.test(x.image || "") ||
        /selenium/i.test(x.name || "")
      );
    return hits;
  } catch (e) {
    console.warn("查找 Selenium 容器失败：", e.message || e);
    return [];
  }
}

function collectSeleniumLogs(tail = 300) {
  try {
    if (!dockerAvailable()) {
      console.warn("Docker 不可用，跳过 selenium 日志抓取。");
      return null;
    }
    const containers = findSeleniumContainers();
    if (!containers.length) {
      console.warn("未发现运行中的 selenium 容器，跳过日志抓取。");
      return null;
    }
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    const outFile = path.join(getDataDirPath(), `selenium-logs-${ts}.log`);
    let combined = "";
    for (const c of containers) {
      try {
        const logs = execSync(`docker logs --tail=${tail} ${c.id} 2>&1`, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        combined += `\n===== CONTAINER ${c.name} (${c.image}) =====\n` + logs;
      } catch (e) {
        combined += `\n===== CONTAINER ${c.name} (${c.image}) 日志获取失败: ${e.message} =====\n`;
      }
    }
    fs.writeFileSync(outFile, combined, "utf8");
    console.info("已抓取 selenium 容器日志:", outFile);
    return outFile;
  } catch (e) {
    console.warn("保存 selenium 日志失败：", e.message || e);
    return null;
  }
}

async function collectDiagnostics(reason) {
  try {
    console.warn("开始收集诊断信息，原因：", reason?.toString()?.slice(0, 180) || "未知");
    await checkSeleniumHealth(WEREAD_REMOTE_BROWSER);
    collectSeleniumLogs(400);
  } catch (_) {
    // 忽略诊断过程错误
  }
}

async function saveCookies(driver, filePath) {
  let cookies = await driver.manage().getCookies();
  // If using Safari, set secure to true for all cookies
  if (WEREAD_BROWSER === Browser.SAFARI) {
    cookies = cookies.map(cookie => ({ ...cookie, secure: true }));
  }
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  console.info("Cookies saved successfully.");
}

async function loadCookies(driver, filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("No cookies file found.");
    return;
  }

  const cookies = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const cookie of cookies) {
    await driver.manage().addCookie(cookie);
  }
  console.info("Cookies loaded successfully.");
}

async function pressDownArrow(driver) {
  await driver.actions().sendKeys(Key.ARROW_DOWN).perform();
  // keep the key pressed for random time between 50ms to 500ms
  let randomTime = Math.floor(Math.random() * 450) + 50;
  await new Promise((resolve) => setTimeout(resolve, randomTime));
  // release the down arrow key
  await driver.actions().sendKeys(Key.NULL).perform();
}

// Function to check if element is in viewport
async function isElementInViewport(driver, element) {
  // Get viewport dimensions using JavaScript
  const viewport = await driver.executeScript(`
    return {
      height: window.innerHeight,
      width: window.innerWidth
    };
  `);

  // Get element position and size
  const rect = await driver.executeScript(
    `
    const rect = arguments[0].getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right
    };
  `,
    element
  );

  // Check if element is within viewport
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewport.height &&
    rect.right <= viewport.width &&
    (await element.isDisplayed())
  );
}

// 简化的二维码定位函数
async function findQRCodeElement(driver) {
  try {
    console.info("正在查找二维码登录元素...");
    // 使用更精确的定位策略，优先查找二维码图片
    const qrCodeImg = await driver.wait(
      until.elementLocated(
        By.xpath("//img[contains(@class, 'qr') or contains(@src, 'qr') or contains(@alt, '二维码')]")
      ),
      3000
    );
    console.info("找到二维码图片元素");
    return true;
  } catch (e) {
    try {
      // 备选方案：查找包含"扫码"或"二维码"文本的元素
      await driver.wait(
        until.elementLocated(
          By.xpath("//*[contains(text(), '扫码') or contains(text(), '二维码')]")
        ),
        3000
      );
      console.info("找到包含'扫码'或'二维码'文本的元素");
      return true;
    } catch (e) {
      console.info("未找到二维码相关元素，可能已经登录");
      return false;
    }
  }
}

// 从页面二维码图片中解码登录链接并在终端显示为二维码
async function extractAndDisplayQRCode(driver) {
  try {
    const qrImg = await driver.findElement(
      By.xpath("//img[contains(@class, 'qr') or contains(@src, 'qr') or contains(@alt, '二维码')]")
    );

    const base64Png = await qrImg.takeScreenshot();

    const { PNG } = require('pngjs');
    const png = PNG.sync.read(Buffer.from(base64Png, 'base64'));

    const jsQR = require('jsqr');
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

    if (code && code.data) {
      console.info("登录链接:", code.data);
      const qrcode = require('qrcode-terminal');
      qrcode.generate(code.data, { small: true });
      await notifyLoginLink(code.data);
      return code.data;
    }
    console.warn("无法从二维码图片中解析登录链接");
    return null;
  } catch (e) {
    console.warn("提取二维码登录链接失败:", e.message);
    return null;
  }
}

async function notifyLoginLink(loginUrl) {
  if (!loginUrl) {
    return;
  }

  if (loginUrl === lastPushedLoginLink) {
    console.info("登录链接未变化，跳过重复推送");
    return;
  }

  lastPushedLoginLink = loginUrl;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(loginUrl)}`;

  await sendNotification("微信读书挑战", "请扫码登录微信读书", {
    event: "login_link",
    subtitle: "扫码登录",
    url: loginUrl,
    image: qrImageUrl,
    level: "active",
    sound: "birdsong",
    data: {
      loginUrl,
      qrImageUrl,
      imageSource: "qrserver",
    },
  });
}

// 安全点击元素函数，处理元素被拦截的情况
async function safeClickElement(driver, element, description = "元素") {
  try {
    // 首先检查元素是否可见和可点击
    const isDisplayed = await element.isDisplayed();
    if (!isDisplayed) {
      console.warn(`${description}不可见，尝试滚动到元素位置`);
      await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", element);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 尝试直接点击
    await element.click();
    console.info(`成功点击${description}`);
    return true;
  } catch (error) {
    console.warn(`直接点击${description}失败: ${error.message}`);

    try {
      // 尝试使用JavaScript点击
      console.info(`尝试使用JavaScript点击${description}`);
      await driver.executeScript("arguments[0].click();", element);
      console.info(`使用JavaScript成功点击${description}`);
      return true;
    } catch (jsError) {
      console.warn(`使用JavaScript点击${description}失败: ${jsError.message}`);

      try {
        // 尝试使用Actions类模拟点击
        console.info(`尝试使用Actions类点击${description}`);
        const actions = driver.actions({ bridge: true });
        await actions.move({ origin: element }).click().perform();
        console.info(`使用Actions类成功点击${description}`);
        return true;
      } catch (actionError) {
        console.error(`所有点击方法都失败: ${actionError.message}`);
        return false;
      }
    }
  }
}

// 刷新二维码的函数
async function refreshQRCode(driver) {
  try {
    console.info("开始刷新二维码...");

    // 尝试多种方式找到刷新按钮
    const refreshLocators = [
      By.css(".login_dialog_retry_delegate"),
      By.xpath("//div[contains(@class, 'login_dialog_retry_delegate')]"),
      By.xpath("//div[contains(text(), '点击刷新二维码') and @class='wr_login_modal_qr_overlay_text']"),
      By.xpath("//div[contains(text(), '点击刷新二维码')]"),
      By.xpath("//div[@class='login_dialog_retry_delegate']"),
      By.xpath("//div[contains(@class, 'refresh') or contains(@class, 'retry')]"),
      By.xpath("//button[contains(text(), '刷新')]"),
      By.xpath("//span[contains(text(), '刷新')]")
    ];

    let refreshClicked = false;
    let refreshElement = null;

    // 尝试每个定位器
    for (const locator of refreshLocators) {
      try {
        refreshElement = await driver.wait(until.elementLocated(locator), 2000);
        if (refreshElement) {
          console.info(`找到刷新元素，尝试点击: ${locator.toString()}`);
          refreshClicked = await safeClickElement(driver, refreshElement, "刷新按钮");
          if (refreshClicked) {
            try {
              await driver.wait(until.stalenessOf(refreshElement), 3000);
            } catch (waitError) {
              console.debug(`刷新元素可能未及时从DOM移除: ${waitError.message}`);
            }
            break;
          }
        }
      } catch (e) {
        console.debug(`未找到元素: ${locator.toString()}`);
      }
    }

    if (!refreshClicked) {
      console.warn("常规定位失败，尝试执行脚本触发刷新");
      try {
        const jsClicked = await driver.executeScript(
          "const delegate = document.querySelector('.login_dialog_retry_delegate'); if (delegate) { delegate.click(); return true; } return false;"
        );
        if (!jsClicked) {
          console.error("无法找到或点击任何刷新按钮");
          return false;
        }
        refreshClicked = true;
      } catch (scriptError) {
        console.error(`执行脚本触发刷新失败: ${scriptError.message}`);
        return false;
      }
    }

    // 等待页面加载
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 检查二维码是否已刷新
    let qrElementFound = await findQRCodeElement(driver);

    if (qrElementFound) {
      // 避免截图时二维码还未弹出
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // 保存截图
      await driver.takeScreenshot().then((image, err) => {
        fs.writeFileSync(getLoginQrCodePath(), image, "base64");
      });
      console.info("QR code refreshed, datetime: ", new Date());
      await extractAndDisplayQRCode(driver);
      return true;
    } else {
      console.error("刷新后未能找到任何二维码相关元素");
      return false;
    }
  } catch (error) {
    console.error("刷新二维码过程中发生错误:", error.message);
    return false;
  }
}

async function sendBark(title, body, options = {}) {
  if (!BARK_KEY) {
    console.info("Bark推送密钥未配置");
    return false;
  }

  const {
    subtitle = "",
    sound = "alarm",
    group = "WeRead-Challenge",
    icon = "",
    url = "",
    image = "",
    level = "active"
  } = options;

  const barkUrl = `${BARK_SERVER}/${BARK_KEY}`;
  const payload = { title, body, sound, group, level };
  if (subtitle) payload.subtitle = subtitle;
  if (icon) payload.icon = icon;
  if (url) payload.url = url;
  if (image) payload.image = image;

  const jsonData = JSON.stringify(payload);
  console.info("发送Bark推送:", maskUrlForLog(barkUrl));

  try {
    const httpModule = barkUrl.startsWith("https://") ? https : http;
    const urlObj = new URL(barkUrl);

    return new Promise((resolve) => {
      const req = httpModule.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(jsonData),
          "User-Agent": `weread-selenium-cli/${WEREAD_VERSION}`,
        },
      }, (res) => {
        let responseData = "";
        res.on("data", (chunk) => { responseData += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.info("Bark推送发送成功");
            resolve(true);
          } else {
            console.error(`Bark推送失败: ${res.statusCode} - ${responseData}`);
            resolve(false);
          }
        });
      });

      req.on("error", (error) => {
        console.error("Bark推送请求错误:", error.message);
        resolve(false);
      });

      req.write(jsonData);
      req.end();
    });
  } catch (error) {
    console.error("Bark推送异常:", error);
    return false;
  }
}

async function sendWebhook(title, body, options = {}) {
  if (!WEBHOOK_URL) {
    console.info("Webhook URL未配置");
    return false;
  }

  const payload = {
    event: options.event || "notification",
    title,
    body,
    subtitle: options.subtitle || "",
    level: options.level || "active",
    sound: options.sound || "",
    url: options.url || "",
    image: options.image || "",
    version: WEREAD_VERSION,
    timestamp: new Date().toISOString(),
    runtime: {
      user: WEREAD_USER,
      browser: WEREAD_BROWSER,
      durationMinutes: WEREAD_DURATION,
      speed: WEREAD_SPEED,
    },
    data: options.data || {},
  };
  const jsonData = JSON.stringify(payload);

  try {
    const urlObj = new URL(WEBHOOK_URL);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      console.error("Webhook URL协议仅支持 http 或 https");
      return false;
    }

    const httpModule = urlObj.protocol === "https:" ? https : http;
    const pathWithQuery = `${urlObj.pathname || "/"}${urlObj.search || ""}`;
    console.info("发送Webhook通知:", maskUrlForLog(WEBHOOK_URL));

    return new Promise((resolve) => {
      const req = httpModule.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: pathWithQuery,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(jsonData),
          "User-Agent": `weread-selenium-cli/${WEREAD_VERSION}`,
        },
      }, (res) => {
        let responseData = "";
        res.on("data", (chunk) => { responseData += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.info("Webhook通知发送成功");
            resolve(true);
          } else {
            console.error(`Webhook通知失败: ${res.statusCode} - ${responseData}`);
            resolve(false);
          }
        });
      });

      req.on("error", (error) => {
        console.error("Webhook通知请求错误:", error.message);
        resolve(false);
      });

      req.write(jsonData);
      req.end();
    });
  } catch (error) {
    console.error("Webhook通知异常:", error.message || error);
    return false;
  }
}

function maskUrlForLog(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const pathParts = urlObj.pathname.split("/");
    const maskedPath = pathParts
      .map((part, index) => {
        if (!part || index < pathParts.length - 1) {
          return part;
        }
        return "***";
      })
      .join("/");
    return `${urlObj.protocol}//${urlObj.host}${maskedPath}${urlObj.search ? "?***" : ""}`;
  } catch (_) {
    return "(invalid url)";
  }
}

async function sendNotification(title, body, options = {}) {
  const tasks = [];

  if (BARK_KEY) {
    tasks.push(sendBark(title, body, options));
  }
  if (WEBHOOK_URL) {
    tasks.push(sendWebhook(title, body, options));
  }

  if (!tasks.length) {
    console.info("未启用通知推送（需要 BARK_KEY 或 WEBHOOK_URL）");
    return [];
  }

  return Promise.allSettled(tasks);
}

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quotePlistString(value) {
  return escapeHtml(String(value));
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function encodePowerShellCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function parseCliArgs(argv) {
  const args = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("-")) {
      args.push(token);
      continue;
    }

    if (token === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }

    const equalIndex = token.indexOf("=");
    if (equalIndex > 0) {
      const normalizedKey = token.slice(0, equalIndex).replace(/^-+/, "");
      flags[normalizedKey] = token.slice(equalIndex + 1);
      continue;
    }

    const normalizedKey = token.replace(/^-+/, "");
    const nextToken = argv[i + 1];
    if (nextToken && !nextToken.startsWith("-")) {
      flags[normalizedKey] = nextToken;
      i += 1;
    } else {
      flags[normalizedKey] = true;
    }
  }

  return { args, flags };
}

function showHelp(command = "root") {
  const sections = {
    root: `
Usage:
  weread-selenium-cli run [run-options]
  weread-selenium-cli schedule --name <task-name> --every <minutes> [--workdir <absolute-path>] [--platform <windows|macos|linux>] [--weread-duration <minutes>] [--dry-run]
  weread-selenium-cli help [command]
  weread-selenium-cli -h

Commands:
  run       Run the WeRead challenge flow.
  schedule  Generate recurring scheduled-task commands for this CLI.
  help      Show help for the CLI or a specific command.

Notes:
  - Legacy alias 'weread-challenge' remains supported and maps to the same CLI entrypoint.
  - No arguments still run the existing reading flow for compatibility, and print a migration hint for run.
  - schedule accepts an optional working directory and defaults to the current user's home directory.
  - schedule only appends --weread-duration when generating task commands.
  - schedule only prints create/verify/rollback commands and never registers tasks directly.
  - run options override environment variables with the same meaning.
`.trim(),
    schedule: `
Usage:
  weread-selenium-cli schedule --name <task-name> --every <minutes> [--workdir <absolute-path>] [--platform <windows|macos|linux>] [--weread-duration <minutes>] [--dry-run]

Required:
  --name       Task name.
  --every      Repeat interval in minutes. Must be a positive integer.

Optional:
  --workdir    Absolute working directory used by the task. Defaults to the current user's home directory.
  --platform   windows | macos | linux. Defaults to current OS.
  --weread-duration
               Optional reading duration in minutes. This is the only run argument supported by schedule.
  --dry-run    Deprecated. schedule now only prints commands and never applies them.
  -h, --help   Show this help text.

Examples:
  weread-selenium-cli schedule --name weread-hourly --every 60 --platform windows
  weread-selenium-cli schedule --name weread-hourly --every 60 --workdir /Users/me/weread-challenge-selenium --platform macos --dry-run
  weread-selenium-cli schedule --name weread-hourly --every 60 --weread-duration 10

Notes:
  - schedule only prints create/verify/rollback commands and never registers tasks directly.
  - On Windows, if the generated create command returns 'Access is denied', rerun it in an Administrator terminal.
  - If --workdir is omitted, schedule uses the current user's home directory.
  - schedule only supports appending --weread-duration to the generated run command.
  - Local CLI runs use ./.weread when WEREAD_DATA_DIR is not set.
`.trim(),
    run: `
Usage:
  weread-selenium-cli run [run-options]

Options:
  -h, --help   Show this help text.
  Values below also accept their original env key form, for example --WEREAD_BROWSER.
${getRunOptionsHelpLines()}

Notes:
  - Existing environment variables remain the configuration source.
  - CLI run options override environment variables.
  - Legacy alias 'weread-challenge' remains supported.
  - Local CLI runs use ./.weread when WEREAD_DATA_DIR is not set.
  - Invoking the CLI with no arguments still behaves like run and prints a migration hint.
`.trim(),
  };

  const output = sections[command] || sections.root;
  console.log(output);
}

function getDefaultPlatform() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    default:
      return "linux";
  }
}

function requireFlag(flags, name) {
  if (!flags[name]) {
    throw new Error(`Missing required flag --${name}`);
  }
  return String(flags[name]);
}

function requireAbsolutePath(targetPath, flagName) {
  if (!path.isAbsolute(targetPath)) {
    throw new Error(`--${flagName} must be an absolute path`);
  }
}

function parseOptionalScheduleDuration(flags) {
  if (!Object.prototype.hasOwnProperty.call(flags, "weread-duration")) {
    return null;
  }
  return parseIntegerValue(flags["weread-duration"], "weread-duration");
}

function buildScheduledRunCommand(duration) {
  if (duration === null) {
    return "weread-selenium-cli run";
  }
  return `weread-selenium-cli run --weread-duration ${duration}`;
}

function resolveScheduleConfig(flags) {
  const platform = String(flags.platform || getDefaultPlatform()).toLowerCase();
  if (!["windows", "macos", "linux"].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const name = requireFlag(flags, "name");
  const every = Number.parseInt(requireFlag(flags, "every"), 10);
  if (!Number.isInteger(every) || every <= 0) {
    throw new Error("--every must be a positive integer");
  }

  const rawWorkdir = flags.workdir ? String(flags.workdir) : os.homedir();
  requireAbsolutePath(rawWorkdir, "workdir");
  const workdir = path.resolve(rawWorkdir);
  const dryRun = Boolean(flags["dry-run"]);
  const wereadDuration = parseOptionalScheduleDuration(flags);

  return {
    platform,
    name,
    every,
    workdir,
    command: buildScheduledRunCommand(wereadDuration),
    dryRun,
    wereadDuration,
  };
}

function getWindowsTaskRunCommand(workdir, command) {
  const homeDir = path.resolve(os.homedir());
  const workdirLiteral =
    path.resolve(workdir).toLowerCase() === homeDir.toLowerCase()
      ? "%USERPROFILE%"
      : workdir;
  return `cmd /d /s /c "cd /d ${workdirLiteral}&&${command}"`;
}

function formatWindowsScheduleStartTime(date = new Date()) {
  const scheduleStart = new Date(date.getTime() + 5 * 60 * 1000);
  const hours = String(scheduleStart.getHours()).padStart(2, "0");
  const minutes = String(scheduleStart.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getWindowsSchedulePlan(config) {
  const taskName = config.name;
  const taskRun = getWindowsTaskRunCommand(config.workdir, config.command);
  const startTime = formatWindowsScheduleStartTime();
  const repetitionDuration = "8760:00";

  return {
    platform: "windows",
    applyCommands: [
      `schtasks /Create /F /TN "${taskName}" /SC DAILY /MO 1 /ST ${startTime} /RI ${config.every} /DU ${repetitionDuration} /TR '${taskRun}'`,
    ],
    verifyCommands: [
      `schtasks /Query /TN "${taskName}" /V /FO LIST`,
    ],
    rollbackCommands: [
      `schtasks /Delete /F /TN "${taskName}"`,
    ],
    summaryLines: [
      `Platform: windows`,
      `Task Name: ${config.name}`,
      `Interval: every ${config.every} minute(s)`,
      `Start Time: ${startTime}`,
      `Working Directory: ${config.workdir}`,
      `Command: ${config.command}`,
      `Data Directory: ${path.join(config.workdir, DEFAULT_WEREAD_DATA_DIR)}`,
      `Trigger: daily at ${startTime}, then every ${config.every} minute(s) for ${repetitionDuration}`,
    ],
  };
}

function getMacosSchedulePlan(config) {
  const sanitizedName = config.name.replace(/[^A-Za-z0-9_.-]/g, "-");
  const plistPath = path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `dev.techfetch.weread.${sanitizedName}.plist`
  );
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.techfetch.weread.${quotePlistString(sanitizedName)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-lc</string>
    <string>${quotePlistString(config.command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${quotePlistString(config.workdir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${config.every * 60}</integer>
</dict>
</plist>
`;

  return {
    platform: "macos",
    plistPath,
    plistContent,
    applyCommands: [
      `mkdir -p ${quoteShellArg(path.dirname(plistPath))}`,
      `cat <<'EOF' > ${quoteShellArg(plistPath)}\n${plistContent}\nEOF`,
      `launchctl unload ${quoteShellArg(plistPath)} 2>/dev/null || true`,
      `launchctl load -w ${quoteShellArg(plistPath)}`,
    ],
    verifyCommands: [
      `launchctl list | grep ${quoteShellArg(`dev.techfetch.weread.${sanitizedName}`)}`,
      `plutil -lint ${quoteShellArg(plistPath)}`,
    ],
    rollbackCommands: [
      `launchctl unload -w ${quoteShellArg(plistPath)} 2>/dev/null || true`,
      `rm -f ${quoteShellArg(plistPath)}`,
    ],
    summaryLines: [
      `Platform: macos`,
      `Task Name: ${config.name}`,
      `Interval: every ${config.every} minute(s)`,
      `Working Directory: ${config.workdir}`,
      `Command: ${config.command}`,
      `LaunchAgent: ${plistPath}`,
    ],
  };
}

function getLinuxSchedulePlan(config) {
  const sanitizedName = config.name.replace(/[^A-Za-z0-9_.-]/g, "-");
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  const servicePath = path.join(unitDir, `${sanitizedName}.service`);
  const timerPath = path.join(unitDir, `${sanitizedName}.timer`);
  const serviceContent = `[Unit]
Description=WeRead Challenge ${sanitizedName}

[Service]
Type=simple
WorkingDirectory=${config.workdir}
ExecStart=/bin/sh -lc ${quoteShellArg(config.command)}
`;
  const timerContent = `[Unit]
Description=Run ${sanitizedName} every ${config.every} minute(s)

[Timer]
OnBootSec=1min
OnUnitActiveSec=${config.every}min
Unit=${sanitizedName}.service

[Install]
WantedBy=timers.target
`;

  return {
    platform: "linux",
    servicePath,
    timerPath,
    serviceContent,
    timerContent,
    applyCommands: [
      `mkdir -p ${quoteShellArg(unitDir)}`,
      `cat <<'EOF' > ${quoteShellArg(servicePath)}\n${serviceContent}\nEOF`,
      `cat <<'EOF' > ${quoteShellArg(timerPath)}\n${timerContent}\nEOF`,
      `systemctl --user daemon-reload`,
      `systemctl --user enable --now ${quoteShellArg(`${sanitizedName}.timer`)}`,
    ],
    verifyCommands: [
      `systemctl --user status ${quoteShellArg(`${sanitizedName}.timer`)}`,
      `systemctl --user list-timers ${quoteShellArg(`${sanitizedName}.timer`)}`,
    ],
    rollbackCommands: [
      `systemctl --user disable --now ${quoteShellArg(`${sanitizedName}.timer`)} || true`,
      `rm -f ${quoteShellArg(servicePath)} ${quoteShellArg(timerPath)}`,
      `systemctl --user daemon-reload`,
    ],
    summaryLines: [
      `Platform: linux`,
      `Task Name: ${config.name}`,
      `Interval: every ${config.every} minute(s)`,
      `Working Directory: ${config.workdir}`,
      `Command: ${config.command}`,
      `Service: ${servicePath}`,
      `Timer: ${timerPath}`,
    ],
  };
}

function buildSchedulePlan(config) {
  switch (config.platform) {
    case "windows":
      return getWindowsSchedulePlan(config);
    case "macos":
      return getMacosSchedulePlan(config);
    case "linux":
      return getLinuxSchedulePlan(config);
    default:
      throw new Error(`Unsupported platform: ${config.platform}`);
  }
}

function getScheduleNotes(plan) {
  const notes = [
    "schedule only prints commands. It does not create the scheduled task for you.",
    "Generated commands use weread-selenium-cli run. Existing weread-challenge tasks remain valid through the legacy bin alias.",
    "If WEREAD_DATA_DIR is not set, runtime uses ./.weread under the working directory.",
  ];

  if (plan.platform === "windows") {
    notes.push(
      "Windows task creation may require an elevated terminal. If the create command returns 'Access is denied', rerun it in an Administrator PowerShell or Command Prompt."
    );
  }

  return notes;
}

function printSchedulePlan(plan, config) {
  console.log(plan.summaryLines.join("\n"));
  console.log("");
  console.log("Create:");
  console.log(plan.applyCommands.join("\n"));
  console.log("");
  console.log("Verify:");
  console.log(plan.verifyCommands.join("\n"));
  console.log("");
  console.log("Rollback:");
  console.log(plan.rollbackCommands.join("\n"));
  console.log("");
  console.log("Notes:");
  console.log(getScheduleNotes(plan).join("\n"));
  if (config.dryRun) {
    console.log("Deprecated flag: --dry-run has no additional effect because schedule is already output-only.");
  }
}

async function handleScheduleCommand(rawArgs) {
  const parsed = parseCliArgs(rawArgs);
  if (parsed.flags.h || parsed.flags.help || parsed.args[0] === "help") {
    showHelp("schedule");
    return;
  }

  const allowedFlags = new Set([
    "name",
    "every",
    "workdir",
    "platform",
    "weread-duration",
    "dry-run",
    "h",
    "help",
  ]);
  const unsupportedFlags = Object.keys(parsed.flags).filter((key) => !allowedFlags.has(key));
  if (unsupportedFlags.length > 0) {
    throw new Error(
      `Unsupported schedule flag(s): ${unsupportedFlags.map((key) => `--${key}`).join(", ")}. schedule only supports --weread-duration in addition to its own task flags.`
    );
  }

  const config = resolveScheduleConfig(parsed.flags);
  if (config.platform !== getDefaultPlatform()) {
    throw new Error(
      `Cannot manage ${config.platform} schedule on ${getDefaultPlatform()}. Run this command on the target OS.`
    );
  }

  const plan = buildSchedulePlan(config);
  printSchedulePlan(plan, config);
}

async function dispatchCli(argv) {
  const [command, ...restArgs] = argv;
  const looksLikeCompatRun = !command || (command.startsWith("-") && command !== "-h" && command !== "--help");

  if (looksLikeCompatRun) {
    const compatArgs = command ? argv : [];
    const parsed = parseCliArgs(compatArgs);
    if (parsed.flags.h || parsed.flags.help) {
      showHelp("run");
      return;
    }
    if (parsed.args.length > 0) {
      throw new Error(`Unexpected positional arguments for run: ${parsed.args.join(" ")}`);
    }
    applyRunCliOverrides(parsed.flags);
    initializeRuntime();
    console.warn(
      "No subcommand provided. Running in compatibility mode as 'run'. Please switch to 'weread-selenium-cli run'."
    );
    await runMain();
    return;
  }

  if (command === "-h" || command === "--help" || command === "help") {
    showHelp(restArgs[0] || "root");
    return;
  }

  if (command === "run") {
    const parsed = parseCliArgs(restArgs);
    if (parsed.flags.h || parsed.flags.help) {
      showHelp("run");
      return;
    }
    if (parsed.args.length > 0) {
      throw new Error(`Unexpected positional arguments for run: ${parsed.args.join(" ")}`);
    }
    applyRunCliOverrides(parsed.flags);
    initializeRuntime();
    await runMain();
    return;
  }

  if (command === "schedule") {
    await handleScheduleCommand(restArgs);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function runMain() {
  console.info("Starting the script, datetime: ", new Date());
  let driver;

  // 发送脚本启动通知
  await sendNotification("微信读书挑战", "自动阅读脚本开始运行", {
    event: "script_started",
    subtitle: "脚本启动",
    level: "active",
    sound: "beginning"
  });
  try {
    const capabilities = {
      browserName: WEREAD_BROWSER,
      pageLoadStrategy: 'eager',
    };

    var browser;
    switch (WEREAD_BROWSER) {
      case Browser.CHROME:
        browser = require("selenium-webdriver/chrome");
        break;
      case Browser.EDGE:
        browser = require("selenium-webdriver/edge");
        break;
      case Browser.FIREFOX:
        browser = require("selenium-webdriver/firefox");
        break;
      case Browser.SAFARI:
        browser = require("selenium-webdriver/safari");
        break;
      default:
        browser = require("selenium-webdriver/chrome");
        break;
    }

    let options = new browser.Options();
    switch (WEREAD_BROWSER) {
      case Browser.CHROME:
      case Browser.EDGE:
        options.addArguments("--no-sandbox");
        options.addArguments("--disable-gpu");
        options.addArguments("--disable-dev-shm-usage");
        options.addArguments("--profile-directory=" + WEREAD_USER);
        options.addArguments("--disable-infobars");
        options.addArguments("--disable-extensions");
        options.addArguments("--disable-notifications");
        options.addArguments("--disable-popup-blocking");
        // check if WEREAD_REMOTE_BROWSER is empty
        if (WEREAD_REMOTE_BROWSER) {
          // 远端启动前做一次健康检查
          await checkSeleniumHealth(WEREAD_REMOTE_BROWSER);
          // Ensure the remote browser URL has a protocol
          let remoteBrowserUrl = WEREAD_REMOTE_BROWSER;
          if (!remoteBrowserUrl.startsWith("http://") && !remoteBrowserUrl.startsWith("https://")) {
            remoteBrowserUrl = "http://" + remoteBrowserUrl;
          }
          console.info("WEREAD_REMOTE_BROWSER: ", remoteBrowserUrl);
          driver = await new Builder()
            .usingServer(remoteBrowserUrl)
            .forBrowser(WEREAD_BROWSER)
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();
        } else {
          console.info("WEREAD_REMOTE_BROWSER not found. Running locally.");
          driver = await new Builder()
            .forBrowser(WEREAD_BROWSER)
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();
        }
        break;
      case Browser.FIREFOX:
        driver = await new Builder().forBrowser(Browser.FIREFOX).build();
        break;
      case Browser.SAFARI:
        driver = await new Builder()
          .forBrowser(Browser.SAFARI)
          .setSafariOptions(options)
          .build();
        break;
      default:
        break;
    }

    // 全局超时配置，避免单次命令长时间挂起
    await driver.manage().setTimeouts({
      implicit: 5000,
      pageLoad: 60000,
      script: 30000,
    });

    console.info("Browser launched successfully.");

    // set screen size
    randomWidth = Math.floor(Math.random() * 1000) + 800;
    randomHeight = Math.floor(Math.random() * 800) + 700;
    await driver
      .manage()
      .window()
      .setRect({ width: randomWidth, height: randomHeight });

    await driver.get(WEREAD_URL);

    if (fs.existsSync(getCookieFilePath())) {
      await loadCookies(driver, getCookieFilePath());
      await driver.navigate().refresh(); // Refresh to apply cookies
    }

    console.info("Going to the URL:", WEREAD_URL);

    let title = await driver.getTitle();
    assert.equal("微信读书", title);
    console.info("Successfully opened the url:", WEREAD_URL);

    // create dir data if not exists
    ensureDataDir();

    // Check if "Login" hyperlink exists
    console.info("Find login links...");
    let loginLinks = await driver.findElements(
      By.xpath("//a[contains(text(), '登录')]"),
      10000
    );
    if (loginLinks.length > 0) {
      console.info("Login link found. Clicking...");
      // 避免点击不成功
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await loginLinks[0].click();

      // 等待页面加载
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 使用简化的二维码定位函数
      let qrElementFound = await findQRCodeElement(driver);

      // 如果找到任何二维码相关元素，保存截图
      if (qrElementFound) {
        // 避免截图时二维码还未弹出
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // save screenshot of QR code
        await driver.takeScreenshot().then((image, err) => {
          fs.writeFileSync(getLoginQrCodePath(), image, "base64");
        });
        console.info("QR code saved, datetime: ", new Date());
        await extractAndDisplayQRCode(driver);

      } else {
        console.error("未能找到任何二维码相关元素");
      }
    }

    let locator1 = By.xpath(
      "//div[contains(text(), '点击刷新二维码') and @class='wr_login_modal_qr_overlay_text']"
    );
    let locator2 = By.xpath(SHELF_MARKER_XPATH);

    let maxRetries = 3;
    while (maxRetries-- > 0) {
      console.info("Waiting for login...");
      const shelfState = await detectShelfLoginState(driver);
      if (shelfState.loggedIn) {
        console.info("Login completed.", shelfState.reason);
        break;
      }
      const element = await driver.wait(
        new Promise((resolve, reject) => {
          driver
            .wait(until.elementLocated(locator1), 300000)
            .then(resolve)
            .catch(() => { });
          driver
            .wait(until.elementLocated(locator2), 300000)
            .then(resolve)
            .catch(() => { });
        }),
        300000 // 5 minutes
      );

      if (element === undefined) {
        console.info("no element found");
        continue;
      }

      let text = await element.getText();
      // if text contains "我的书架", then login is successful
      if (text.includes("我的书架")) {
        console.info("Login completed.");
        break;
      }

      const currentShelfState = await detectShelfLoginState(driver);
      if (currentShelfState.loggedIn) {
        console.info("Login completed.", currentShelfState.reason);
        break;
      }

      // 如果出现二维码过期提示，则自动刷新
      if (QR_EXPIRED_TEXTS.some((expiredText) => text.includes(expiredText))) {
        console.info("Refreshing QR code...");
        let refreshSuccess = await refreshQRCode(driver);

        if (!refreshSuccess) {
          console.error("二维码刷新失败，尝试其他方法...");
          // 如果刷新失败，尝试直接刷新页面
          await driver.navigate().refresh();
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // 再次检查二维码
          let qrElementFound = await findQRCodeElement(driver);
          if (qrElementFound) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await driver.takeScreenshot().then((image, err) => {
              fs.writeFileSync(getLoginQrCodePath(), image, "base64");
            });
            console.info("页面刷新后找到二维码, datetime: ", new Date());
            await extractAndDisplayQRCode(driver);
          }
        }
        continue;
      }
    }

    if (maxRetries <= 0) {
      console.error("Failed to login.");
      await sendNotification("微信读书挑战", "登录失败", {
        event: "login_failed",
        subtitle: "项目停滞",
        level: "critical",
        sound: "alarm"
      });
      return;
    }

    console.info("Successfully logged in.");

    // If cookies exist, save them
    await saveCookies(driver, getCookieFilePath());

    const keywords = parseKeywordList(WEREAD_KEYWORDS);

    if (DEFAULT_BOOK_URL) {
      console.info("DEFAULT_BOOK_URL 已配置，直接打开:", DEFAULT_BOOK_URL);
      await driver.get(DEFAULT_BOOK_URL);
    } else {
      if (keywords.length === 0) {
        const errorMessage = "DEFAULT_BOOK_URL 未配置，且 WEREAD_KEYWORDS 没有有效关键词，无法选书。";
        console.error(errorMessage);
        await sendNotification("微信读书挑战", errorMessage, {
          event: "book_not_found",
          subtitle: "项目停滞",
          level: "critical",
          sound: "alarm"
        });
        return;
      }

      await openShelfForKeywordSelection(driver);
      const books = await driver.findElements(
        By.xpath("//div[@class='wr_index_mini_shelf_card']"),
        10000
      );
      const matchedBooks = [];
      console.info(`Using keywords to find a book: [${keywords.join(", ")}]`);
      for (const book of books) {
        try {
          const title = await resolveBookCardTitle(driver, book);
          if (!title) {
            console.debug("Could not resolve book title for keyword matching: empty title");
            continue;
          }
          if (keywords.some((keyword) => title.includes(keyword))) {
            matchedBooks.push({ element: book, title });
          }
        } catch (error) {
          console.debug("Could not resolve book title for keyword matching:", error.message);
        }
      }

      if (matchedBooks.length === 0) {
        const errorMessage = `No books found on the shelf matching keywords: [${WEREAD_KEYWORDS}].`;
        console.error(errorMessage);
        await sendNotification("微信读书挑战", errorMessage, {
          event: "book_not_found",
          subtitle: "项目停滞",
          level: "critical",
          sound: "alarm"
        });
        return;
      }

      const matchedBook = matchedBooks[Math.floor(Math.random() * matchedBooks.length)];
      await matchedBook.element.click();
      console.info(`Randomly selected to read: "${matchedBook.title}"`);
    }

    // get button with title equal to "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );

    // 切换到"上下滚动阅读"模式
    // OLD: 通过 title="切换到上下滚动阅读" 定位
    // NEW: 通过 class "readerControls_item" + "isHorizontalReader" 定位
    let switchButton = await driver.findElements(
      By.xpath(
        "//button[@title='切换到上下滚动阅读'] | //button[contains(@class, 'readerControls_item') and contains(@class, 'isHorizontalReader')]"
      )
    );
    if (switchButton.length > 0) {
      await switchButton[0].click();
      console.info("Switched to vertical scroll mode.");
    } else {
      console.warn('未找到用于切换为上下滚动阅读的按钮（兼容新老版本定位）');
    }

    // Wait for button with title "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );
    console.info("Successfully switched to vertical scroll mode.");

    await sendNotification("微信读书挑战", "登录成功", {
      event: "login_success",
      subtitle: "项目启动",
      level: "active",
      sound: "birdsong"
    });

    // run script to keep reading
    // let script = fs.readFileSync("./src/keep_reading.js", "utf8");
    // await driver.executeScript(script);
    console.info("Reading started...");

    // duration from environment variable, WEREAD_DURATION in minutes
    console.info("Reading duration: ", WEREAD_DURATION, " minutes");
    console.info(
      "阅读期间截图: ",
      WEREAD_SCREENSHOT ? "开启" : "关闭"
    );
    let startTime = new Date();
    console.info("Start time: ", startTime);
    let endTime = new Date(startTime.getTime() + WEREAD_DURATION * 60000);
    console.info("End time: ", endTime);
    let screenshotTime = startTime;
    // log last read time per minute
    while (new Date() < endTime) {
      let currentTime = new Date();
      // wait for random time between 300ms to 1s
      let randomTime = Math.floor(Math.random() * 700) + 300;
      if (WEREAD_SPEED === "fast") {
        randomTime = Math.floor(Math.random() * 100) + 100;
      } else if (WEREAD_SPEED === "normal") {
        randomTime = Math.floor(Math.random() * 400) + 200;
      }
      await new Promise((resolve) => setTimeout(resolve, randomTime));
      if (currentTime.getMinutes() !== screenshotTime.getMinutes()) {
        // take screenshot every minute, and get round index
        let screenshotIndex = Math.round((currentTime - startTime) / 60000);
        const screenshotPath = getScreenshotPath(`screenshot-${screenshotIndex}.png`);
        if (WEREAD_SCREENSHOT) {
          await driver.takeScreenshot().then((image, err) => {
            fs.writeFileSync(screenshotPath, image, "base64");
          });
        }
        screenshotTime = currentTime;
        console.info("Reading minute: ", screenshotIndex);

        // if the screenshot png size is less than 100 KB, then refresh the page
        // continue if file not found
        if (!WEREAD_SCREENSHOT) {
          continue;
        }
        if (!fs.existsSync(screenshotPath)) {
          continue;
        }
        let stats = fs.statSync(screenshotPath);
        let fileSizeInBytes = stats.size;
        let fileSizeInKB = fileSizeInBytes / 1024;
        console.debug("Screenshot size: ", fileSizeInKB, " KB");
        if (fileSizeInKB < 100) {
          await driver.navigate().refresh();
          console.info("Page refreshed.");
        }
      }

      // check if need to jump to the top
      // check if the doc title contains "已读完"
      let title = await driver.getTitle();
      let needToJump = title.includes("已读完");
      const needToJumpReasons = [];
      if (needToJump) {
        needToJumpReasons.push('标题包含 "已读完"');
      }
      // check if got a "span" contains text "开通后即可阅读"
      let openBook = await driver.findElements(
        By.xpath("//span[contains(text(), '开通后即可阅读')]")
      );
      if (openBook.length > 0) {
        console.warn("需要打开书籍");
        needToJump = true;
        needToJumpReasons.push("需要打开书籍");
      }

      // find element div with class "readerFooter_ending_title" and content contains "全 书 完"
      let readComplete = await driver.findElements(
        By.xpath("//div[contains(text(), '全 书 完')]")
      );
      if (readComplete.length > 0) {
        console.warn("书籍已读完");
        needToJump = true;
        needToJumpReasons.push("书籍已读完");
      }

      if (needToJump) {
        console.warn(
          "needToJump = true, reasons: " +
            (needToJumpReasons.length
              ? needToJumpReasons.join(" | ")
              : "unknown")
        );
        // jump to the top
        // click the buttion "目录"
        let catalogs = await driver.findElements(
          By.xpath('//button[@title="目录"]')
        );
        if (catalogs.length > 0) {
          await catalogs[0].click();
          console.info("Clicked on catalog button.");
        } else {
          console.error("Catalog button not found.");
        }

        // click the first "li" with class "readerCatalog_list_item"
        let chapters = await driver.findElements(
          By.xpath("//li[@class='readerCatalog_list_item']")
        );
        if (chapters.length > 0) {
          // scroll to the top
          await driver.executeScript(
            "arguments[0].scrollIntoView();",
            chapters[0]
          );
          await chapters[1].click();
          console.info("Clicked on first chapter.");
        } else {
          console.error("Chapters not found.");
        }
      }

      // find button with title "下一章" or "下一页"
      let nextChapter = await driver.findElements(
        By.xpath("//button[@title='下一章'] | //button[@title='下一页']")
      );
      if (nextChapter.length !== 0) {
        // check if the button is shown on the screen
        let isVisible = await isElementInViewport(driver, nextChapter[0]);
        if (isVisible) {
          await nextChapter[0].click();
          console.info("Clicked on next chapter button.");
          continue;
        }
      }

      // find div with content contains "点击重试", 未确认
      let retry = await driver.findElements(
        By.xpath("//div[contains(text(), '点击重试')]")
      );
      if (retry.length > 0) {
        console.warn("Retry button found.");
        await retry[0].click();
        console.info("Clicked on retry button.");
        continue;
      }

      // press down arrow key if position is greater than 99
      await pressDownArrow(driver);
      console.debug("Pressed down arrow key.");
    }
    console.info("Reading completed.");

    // save cookies after reading
    await saveCookies(driver, getCookieFilePath());
    await sendNotification("微信读书挑战", `阅读完成，持续时间：${WEREAD_DURATION}分钟`, {
      event: "reading_completed",
      subtitle: "项目完成",
      level: "active",
      sound: "success",
      data: { durationMinutes: WEREAD_DURATION },
    });
  } catch (e) {
    // Add line number to error message if possible
    let errorMessage = String(e?.message || e || "Unknown error");
    if (e && e.stack) {
      const match = e.stack.match(/(src[\\/]weread-challenge\.js):(\d+):(\d+)/);
      if (match) {
        errorMessage += ` (at ${match[1]}:${match[2]})`;
      }
    }
    console.info(errorMessage);
    // 出错时抓取 selenium 健康状态与容器日志
    await collectDiagnostics(errorMessage);
    await sendNotification("微信读书挑战", `发生错误：${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`, {
      event: "error",
      subtitle: "项目停滞",
      level: "critical",
      sound: "alarm",
      data: { error: errorMessage },
    });

    // wait for 3 seconds before closing the browser
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    // cleanup
    console.info("Quitting the browser...");
    if (driver != undefined && driver != null) {
      await driver.quit();
      console.info("Browser closed.");
    }
    process.exit(0);
  }
}

function getRuntimeConfigSnapshot() {
  return {
    DEBUG,
    WEREAD_USER,
    WEREAD_REMOTE_BROWSER,
    WEREAD_DURATION,
    WEREAD_SPEED,
    WEREAD_BROWSER,
    WEREAD_SCREENSHOT,
    BARK_KEY,
    BARK_SERVER,
    WEBHOOK_URL,
    WEREAD_DATA_DIR,
    WEREAD_KEYWORDS,
    DEFAULT_BOOK_URL,
  };
}

module.exports = {
  RUN_OPTION_SPECS,
  applyRunCliOverrides,
  getRuntimeConfigSnapshot,
  parseCliArgs,
  setRuntimeConfigFromEnv,
};

if (require.main === module) {
  dispatchCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
