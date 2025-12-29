const { By, Browser, until, Key } = require("selenium-webdriver");
const fs = require("fs");
const https = require("https");
const http = require("http");
const {
  COOKIE_FILE,
  DEBUG,
  WEREAD_BROWSER,
  WEREAD_VERSION,
  WEREAD_DURATION,
  ENABLE_EMAIL,
  LOGIN_QR_CODE,
} = require("./config");
const { getOSInfo } = require("./utils");

// --- Cookie & User Info ---
function getUserInfo() {
  if (!fs.existsSync(COOKIE_FILE)) {
    return {};
  }
  let cookiesFile = fs.readFileSync(COOKIE_FILE, "utf8");
  let cookies = JSON.parse(cookiesFile);
  let userInfo = {};
  for (const cookie of cookies) {
    if (cookie.secure == undefined) {
      continue;
    }
    switch (cookie.name) {
      case "wr_gid":
        if (cookie.secure == true) {
          userInfo.wr_gid_s = parseInt(cookie.value) || 0;
        } else {
          userInfo.wr_gid = parseInt(cookie.value) || 0;
        }
        break;
      case "wr_name":
        userInfo.wr_name = decodeURIComponent(cookie.value);
        break;
      case "wr_localvid":
        userInfo.wr_localvid = cookie.value;
        break;
      case "wr_gender":
        userInfo.wr_gender = parseInt(cookie.value) || 0;
        break;
      case "wr_avatar":
        userInfo.wr_avatar = decodeURIComponent(cookie.value);
        break;
      case "wr_rt":
        userInfo.wr_rt = cookie.value;
        break;
      case "wr_vid":
        userInfo.wr_vid = parseInt(cookie.value) || 0;
        break;
    }
  }
  return userInfo;
}

function logEventToWereadLog(err) {
  const url = DEBUG
    ? "http://127.0.0.1:8787/logs"
    : "https://weread-challenge.techfetch.dev/logs";
  const httpModule = DEBUG ? http : https;

  let userInfo = getUserInfo();
  let params = {
    os: getOSInfo(),
    browser: WEREAD_BROWSER,
    duration: parseInt(WEREAD_DURATION) || 0,
    enable_email: ENABLE_EMAIL,
    error: err,
    version: WEREAD_VERSION,
  };

  let data = { ...params, ...userInfo };

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "WeRead-Tracker/1.0",
    },
  };

  console.info("Logging to WeRead server:", JSON.stringify(data));

  const req = httpModule.request(url, options, (res) => {
    let responseData = "";
    res.on("data", (chunk) => {
      responseData += chunk;
    });
    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.info("Successfully logged to WeRead server");
      } else {
        console.error(
          `Failed to log to WeRead server: ${res.statusCode} - ${responseData}`
        );
      }
    });
  });

  req.on("error", (error) => {
    console.error("Error logging to WeRead server:", error.message);
  });

  req.write(JSON.stringify(data));
  req.end();
}

async function saveCookies(driver, filePath) {
  let cookies = await driver.manage().getCookies();
  if (WEREAD_BROWSER === Browser.SAFARI) {
    cookies = cookies.map((cookie) => ({ ...cookie, secure: true }));
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

// --- Browser Interactions ---

async function pressDownArrow(driver) {
  await driver.actions().sendKeys(Key.ARROW_DOWN).perform();
  let randomTime = Math.floor(Math.random() * 450) + 50;
  await new Promise((resolve) => setTimeout(resolve, randomTime));
  await driver.actions().sendKeys(Key.NULL).perform();
}

async function isElementInViewport(driver, element) {
  const viewport = await driver.executeScript(`
    return {
      height: window.innerHeight,
      width: window.innerWidth
    };
  `);

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

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewport.height &&
    rect.right <= viewport.width &&
    (await element.isDisplayed())
  );
}

async function findQRCodeElement(driver) {
  try {
    console.info("正在查找二维码登录元素...");
    await driver.wait(
      until.elementLocated(
        By.xpath("//img[contains(@class, 'qr') or contains(@src, 'qr') or contains(@alt, '二维码')]")
      ),
      3000
    );
    console.info("找到二维码图片元素");
    return true;
  } catch (e) {
    try {
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

async function safeClickElement(driver, element, description = "元素") {
  try {
    const isDisplayed = await element.isDisplayed();
    if (!isDisplayed) {
      console.warn(`${description}不可见，尝试滚动到元素位置`);
      await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", element);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    await element.click();
    console.info(`成功点击${description}`);
    return true;
  } catch (error) {
    console.warn(`直接点击${description}失败: ${error.message}`);
    
    try {
      console.info(`尝试使用JavaScript点击${description}`);
      await driver.executeScript("arguments[0].click();", element);
      console.info(`使用JavaScript成功点击${description}`);
      return true;
    } catch (jsError) {
      console.warn(`使用JavaScript点击${description}失败: ${jsError.message}`);
      
      try {
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

async function refreshQRCode(driver) {
  try {
    console.info("开始刷新二维码...");
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
        // ignore
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
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    let qrElementFound = await findQRCodeElement(driver);
    
    if (qrElementFound) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await driver.takeScreenshot().then((image, err) => {
        fs.writeFileSync(LOGIN_QR_CODE, image, "base64");
      });
      console.info("QR code refreshed, datetime: ", new Date());
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

module.exports = {
  getUserInfo,
  logEventToWereadLog,
  saveCookies,
  loadCookies,
  pressDownArrow,
  isElementInViewport,
  findQRCodeElement,
  safeClickElement,
  refreshQRCode,
};
