/**
 * @license
 * Copyright (c) 2024 weread-challenge@techfetch.dev
 * All rights reserved.
 * Licensed under the MIT License.
 * For more information, contact: weread-challenge@techfetch.dev
 * 修改请保留统计代码
 */

const { By, Builder, Browser, until } = require("selenium-webdriver");
const assert = require("assert");
const fs = require("fs");

const {
  COOKIE_FILE,
  LOGIN_QR_CODE,
  URL_WEREAD,
  WEREAD_USER,
  WEREAD_REMOTE_BROWSER,
  WEREAD_DURATION,
  WEREAD_SPEED,
  WEREAD_BROWSER,
  ENABLE_EMAIL,
  WEREAD_AGREE_TERMS,
  WEREAD_KEYWORDS,
  QR_EXPIRED_TEXTS,
} = require("./config");

const {
  setupLogger,
  checkSeleniumHealth,
  collectDiagnostics,
  sendMail,
  sendBark,
} = require("./utils");

const {
  logEventToWereadLog,
  saveCookies,
  loadCookies,
  pressDownArrow,
  isElementInViewport,
  findQRCodeElement,
  safeClickElement,
  refreshQRCode,
} = require("./weread-service");

// Initialize logger
setupLogger();

async function main() {
  console.info("Starting the script, datetime: ", new Date());
  let driver;

  // 发送脚本启动通知
  await sendBark("微信读书挑战", "自动阅读脚本开始运行", {
    subtitle: "脚本启动",
    level: "active",
    sound: "beginning",
  });

  // 随机休眠0～1800秒 (0～30分钟)
  const randomSeconds = Math.random() * 1800;
  const sleepTime = Math.floor(randomSeconds * 1000);
  const sleepMinutes = Math.floor(randomSeconds / 60);
  const remainingSeconds = Math.floor(randomSeconds % 60);
  console.info(`Will sleep for ${sleepMinutes}分${remainingSeconds}秒.`);
  await sendBark("微信读书挑战", `脚本将休眠 ${sleepMinutes}分${remainingSeconds}秒`, {
    subtitle: "开始休眠",
    level: "active",
    sound: "minuet",
  });
  await new Promise((resolve) => setTimeout(resolve, sleepTime));
  console.info("Waking up from sleep.");
  await sendBark("微信读书挑战", "脚本已从休眠中唤醒", {
    subtitle: "休眠结束",
    level: "active",
    sound: "glass",
  });

  try {
    const capabilities = {
      browserName: WEREAD_BROWSER,
      pageLoadStrategy: "eager",
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
        // check if WEREAD_REMOTE_BROWSER is set
        if (WEREAD_REMOTE_BROWSER) {
          // 远端启动前做一次健康检查
          await checkSeleniumHealth(WEREAD_REMOTE_BROWSER);
          // Ensure the remote browser URL has a protocol
          let remoteBrowserUrl = WEREAD_REMOTE_BROWSER;
          if (
            !remoteBrowserUrl.startsWith("http://") &&
            !remoteBrowserUrl.startsWith("https://")
          ) {
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

    // 全局超时配置
    await driver.manage().setTimeouts({
      implicit: 5000,
      pageLoad: 60000,
      script: 30000,
    });

    console.info("Browser launched successfully.");

    // set screen size
    let randomWidth = Math.floor(Math.random() * 1000) + 800;
    let randomHeight = Math.floor(Math.random() * 800) + 700;
    await driver
      .manage()
      .window()
      .setRect({ width: randomWidth, height: randomHeight });

    await driver.get(URL_WEREAD);

    if (fs.existsSync(COOKIE_FILE)) {
      await loadCookies(driver, COOKIE_FILE);
      await driver.navigate().refresh();
    }

    console.info("Going to the URL:", URL_WEREAD);

    let title = await driver.getTitle();
    assert.equal("微信读书", title);
    console.info("Successfully opened the url:", URL_WEREAD);

    // create dir data if not exists (already done in setupLogger but good to ensure)
    if (!fs.existsSync("./data")) {
      fs.mkdirSync("./data");
    }

    // Check if "Login" hyperlink exists
    console.info("Find login links...");
    let loginLinks = await driver.findElements(
      By.xpath("//a[contains(text(), '登录')]"),
      10000
    );
    if (loginLinks.length > 0) {
      console.info("Login link found. Clicking...");
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
          fs.writeFileSync(LOGIN_QR_CODE, image, "base64");
        });
        console.info("QR code saved, datetime: ", new Date());
      } else {
        console.error("未能找到任何二维码相关元素");
      }
    }

    let locator1 = By.xpath(
      "//div[contains(text(), '点击刷新二维码') and @class='wr_login_modal_qr_overlay_text']"
    );
    let locator2 = By.xpath(
      "//div[contains(text(), '我的书架') and @class='wr_index_page_top_section_header_action_link']"
    );

    let maxRetries = 3;
    while (maxRetries-- > 0) {
      console.info("Waiting for login...");
      const element = await driver.wait(
        new Promise((resolve, reject) => {
          driver
            .wait(until.elementLocated(locator1), 300000)
            .then(resolve)
            .catch(() => {});
          driver
            .wait(until.elementLocated(locator2), 300000)
            .then(resolve)
            .catch(() => {});
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
              fs.writeFileSync(LOGIN_QR_CODE, image, "base64");
            });
            console.info("页面刷新后找到二维码, datetime: ", new Date());
          }
        }
        continue;
      }
    }

    if (maxRetries <= 0) {
      console.error("Failed to login.");
      if (ENABLE_EMAIL) {
        await sendMail("[项目进展--项目停滞]", "Failed to login.");
      }
      await sendBark("微信读书挑战", "登录失败", {
        subtitle: "项目停滞",
        level: "critical",
        sound: "alarm",
      });
      return;
    }

    console.info("Successfully logged in.");

    try {
      const shelfUrl = "https://weread.qq.com/web/shelf";
      console.info(`Navigating directly to bookshelf URL: ${shelfUrl}`);
      await driver.get(shelfUrl);
      await driver.wait(until.urlContains("/web/shelf"), 5000);
      console.info("Successfully navigated to bookshelf.");
    } catch (e) {
      console.warn(
        "Failed to navigate to bookshelf URL directly. Assuming current page is correct.",
        e.message
      );
    }

    // If cookies exist, save them
    await saveCookies(driver, COOKIE_FILE);

    if (WEREAD_AGREE_TERMS) {
      logEventToWereadLog("");
    }

    // Book selection logic
    let isBookReady = false;
    let selectedBookTitle = "Unknown Book";
    const DEFAULT_MOUSE_BOOK_URL =
      "https://weread.qq.com/web/reader/c2f320f071935f63c2f1313";
    const allBooks = await driver.findElements(By.css("a.shelfBook"));

    if (allBooks.length === 0) {
      console.warn("No books found on the shelf. Using the default book link.");
      await driver.get(DEFAULT_MOUSE_BOOK_URL);
      await driver.wait(until.titleContains("胆小如鼠"), 10000);
      selectedBookTitle = "胆小如鼠";
      isBookReady = true;
    } else {
      const keywords = WEREAD_KEYWORDS
        ? WEREAD_KEYWORDS.split(",")
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
        : [];

      if (keywords.length === 0) {
        if (WEREAD_KEYWORDS) {
          console.warn(
            "WEREAD_KEYWORDS is set but contains no valid keywords. Defaulting to reading the first book on the shelf."
          );
        } else {
          console.info(
            "WEREAD_KEYWORDS is not set. Defaulting to reading the first book on the shelf."
          );
        }
        try {
          const titleElement = await allBooks[0].findElement(By.css("div.title"));
          selectedBookTitle = await titleElement.getText();
        } catch (e) {
          console.warn("Could not get book title for notification.");
        }
        await safeClickElement(driver, allBooks[0], "first book on shelf");
        isBookReady = true;
      } else {
        console.info(`Using keywords to find a book: [${keywords.join(", ")}]`);
        const matchedBooks = [];
        for (const book of allBooks) {
          try {
            const titleElement = await book.findElement(By.css("div.title"));
            const title = await titleElement.getText();
            if (keywords.some((keyword) => title.includes(keyword))) {
              matchedBooks.push({ element: book, title: title });
            }
          } catch (e) {
            console.debug(
              "Could not find title for a book card. Error: " + e.message
            );
          }
        }

        if (matchedBooks.length > 0) {
          console.info(
            `Found ${matchedBooks.length} books matching keywords: [${keywords.join(
              ", "
            )}].`
          );
          const randomIndex = Math.floor(Math.random() * matchedBooks.length);
          const selectedBook = matchedBooks[randomIndex];
          selectedBookTitle = selectedBook.title;
          console.info(`Randomly selected to read: "${selectedBook.title}"`);
          await safeClickElement(
            driver,
            selectedBook.element,
            `book "${selectedBook.title}"`
          );
          isBookReady = true;
        } else {
          console.warn(
            `No books found on the shelf matching keywords: [${WEREAD_KEYWORDS}].`
          );
          isBookReady = false;
        }
      }
    }

    if (!isBookReady) {
      const errorMessage = `Failed to select a book. Please check your WEREAD_KEYWORDS or add books to your shelf.`;
      console.error(errorMessage);
      await sendBark("微信读书挑战", "选书失败", {
        subtitle: "项目停滞",
        level: "critical",
        sound: "alarm",
      });
      return;
    }

    // get button with title equal to "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );

    // 切换到"上下滚动阅读"模式
    let switchButton = await driver.findElements(
      By.xpath(
        "//button[@title='切换到上下滚动阅读'] | //button[contains(@class, 'readerControls_item') and contains(@class, 'isHorizontalReader')]"
      )
    );
    if (switchButton.length > 0) {
      await switchButton[0].click();
      console.info("Switched to vertical scroll mode.");
    } else {
      console.warn("未找到用于切换为上下滚动阅读的按钮（兼容新老版本定位）");
    }

    // Wait for button with title "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );
    console.info("Successfully switched to vertical scroll mode.");

    if (ENABLE_EMAIL) {
      await driver
        .takeScreenshot()
        .then((image, err) =>
          fs.writeFileSync("./data/screenshot.png", image, "base64")
        );
      await sendMail(
        `[项目进展--开始阅读]`,
        `Started reading: ${selectedBookTitle}`,
        ["./data/screenshot.png"]
      );
    }
    await sendBark("微信读书挑战", `开始阅读:《${selectedBookTitle}》`, {
      subtitle: "选书成功",
      level: "active",
      sound: "birdsong",
    });

    console.info("Reading started...");

    console.info("Reading duration: ", WEREAD_DURATION, " minutes");
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
        let screenshotIndex = Math.round((currentTime - startTime) / 60000);
        await driver.takeScreenshot().then((image, err) => {
          fs.writeFileSync(
            `./data/screenshot-${screenshotIndex}.png`,
            image,
            "base64"
          );
        });
        screenshotTime = currentTime;
        console.info("Reading minute: ", screenshotIndex);

        if (!fs.existsSync(`./data/screenshot-${screenshotIndex}.png`)) {
          continue;
        }
        let stats = fs.statSync(`./data/screenshot-${screenshotIndex}.png`);
        let fileSizeInBytes = stats.size;
        let fileSizeInKB = fileSizeInBytes / 1024;
        console.debug("Screenshot size: ", fileSizeInKB, " KB");
        if (fileSizeInKB < 100) {
          await driver.navigate().refresh();
          console.info("Page refreshed.");
        }
      }

      // check if need to jump to the top
      let title = await driver.getTitle();
      let needToJump = title.includes("已读完");
      const needToJumpReasons = [];
      if (needToJump) {
        needToJumpReasons.push('标题包含 "已读完"');
      }
      let openBook = await driver.findElements(
        By.xpath("//span[contains(text(), '开通后即可阅读')]")
      );
      if (openBook.length > 0) {
        console.warn("需要打开书籍");
        needToJump = true;
        needToJumpReasons.push("需要打开书籍");
      }

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
        let catalogs = await driver.findElements(
          By.xpath('//button[@title="目录"]')
        );
        if (catalogs.length > 0) {
          await catalogs[0].click();
          console.info("Clicked on catalog button.");
        } else {
          console.error("Catalog button not found.");
        }

        let chapters = await driver.findElements(
          By.xpath("//li[@class='readerCatalog_list_item']")
        );
        if (chapters.length > 0) {
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
        let isVisible = await isElementInViewport(driver, nextChapter[0]);
        if (isVisible) {
          await nextChapter[0].click();
          console.info("Clicked on next chapter button.");
          continue;
        }
      }

      // find div with content contains "点击重试"
      let retry = await driver.findElements(
        By.xpath("//div[contains(text(), '点击重试')]")
      );
      if (retry.length > 0) {
        console.warn("Retry button found.");
        await retry[0].click();
        console.info("Clicked on retry button.");
        continue;
      }

      await pressDownArrow(driver);
      console.debug("Pressed down arrow key.");
    }
    console.info("Reading completed.");

    // save cookies after reading
    await saveCookies(driver, COOKIE_FILE);
    if (ENABLE_EMAIL) {
      await driver
        .takeScreenshot()
        .then((image, err) =>
          fs.writeFileSync("./data/screenshot.png", image, "base64")
        );
      await sendMail("[项目进展--项目完成]", "Reading completed.", [
        "./data/screenshot.png",
      ]);
    }
    await sendBark("微信读书挑战", `阅读完成，持续时间：${WEREAD_DURATION}分钟`, {
      subtitle: "项目完成",
      level: "active",
      sound: "success",
    });
  } catch (e) {
    let errorMessage = String(e?.message || e || "Unknown error");
    if (e && e.stack) {
      const match = e.stack.match(/(src\/main.js):(\d+):(\d+)/); // stack trace might be different now
      if (match) {
        errorMessage += ` (at ${match[1]}:${match[2]})`;
      }
    }
    console.info(errorMessage);
    await collectDiagnostics(errorMessage);
    if (ENABLE_EMAIL) {
      await sendMail("[项目进展--项目停滞]", "Error occurred: " + errorMessage);
    }
    await sendBark(
      "微信读书挑战",
      `发生错误：${errorMessage.substring(0, 100)}${
        errorMessage.length > 100 ? "..." : ""
      }`,
      {
        subtitle: "项目停滞",
        level: "critical",
        sound: "alarm",
      }
    );

    if (WEREAD_AGREE_TERMS) {
      logEventToWereadLog(errorMessage);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    console.info("Quitting the browser...");
    if (driver != undefined && driver != null) {
      await driver.quit();
      console.info("Browser closed.");
    }
    process.exit(0);
  }
}

main();