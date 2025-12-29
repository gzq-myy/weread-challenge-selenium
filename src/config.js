require('dotenv').config();
const { Browser } = require("selenium-webdriver");
const path = require("path");

const WEREAD_VERSION = "0.13.0";
const COOKIE_FILE = "./data/cookies.json";
const LOGIN_QR_CODE = "./data/login.png";
const URL_WEREAD = "https://weread.qq.com/";
const DEBUG = process.env.DEBUG === "true" || false;
const WEREAD_USER = process.env.WEREAD_USER || "weread-default";
const WEREAD_REMOTE_BROWSER = process.env.WEREAD_REMOTE_BROWSER;

// Parse Duration
const WEREAD_DURATION_CONFIG = process.env.WEREAD_DURATION || "10";
let WEREAD_DURATION;
if (String(WEREAD_DURATION_CONFIG).includes("-")) {
  const [min, max] = String(WEREAD_DURATION_CONFIG)
    .split("-")
    .map((s) => parseInt(s.trim()));
  if (!isNaN(min) && !isNaN(max) && min <= max) {
    WEREAD_DURATION = Math.floor(Math.random() * (max - min + 1)) + min;
    console.info(
      `Reading duration range: ${min}-${max} minutes. This run will be ${WEREAD_DURATION} minutes.`
    );
  } else {
    WEREAD_DURATION = 10;
    console.warn(
      `Invalid reading duration range: "${WEREAD_DURATION_CONFIG}". Defaulting to 10 minutes.`
    );
  }
} else {
  WEREAD_DURATION = parseInt(WEREAD_DURATION_CONFIG, 10);
  if (isNaN(WEREAD_DURATION) || WEREAD_DURATION <= 0) {
    WEREAD_DURATION = 10;
    console.warn(
      `Invalid reading duration: "${WEREAD_DURATION_CONFIG}". Defaulting to 10 minutes.`
    );
  }
}

const WEREAD_SPEED = process.env.WEREAD_SPEED || "slow";
const WEREAD_BROWSER = process.env.WEREAD_BROWSER || Browser.CHROME;
const ENABLE_EMAIL = process.env.ENABLE_EMAIL === "true" || false;
const WEREAD_AGREE_TERMS = process.env.WEREAD_AGREE_TERMS !== "false";
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT) || 465;
const BARK_KEY = process.env.BARK_KEY || "";
const BARK_SERVER = process.env.BARK_SERVER || "https://api.day.app";
const WEREAD_KEYWORDS = process.env.WEREAD_KEYWORDS || "";
const QR_EXPIRED_TEXTS = ["点击刷新二维码", "二维码已失效"];

module.exports = {
  WEREAD_VERSION,
  COOKIE_FILE,
  LOGIN_QR_CODE,
  URL_WEREAD,
  DEBUG,
  WEREAD_USER,
  WEREAD_REMOTE_BROWSER,
  WEREAD_DURATION,
  WEREAD_SPEED,
  WEREAD_BROWSER,
  ENABLE_EMAIL,
  WEREAD_AGREE_TERMS,
  EMAIL_PORT,
  BARK_KEY,
  BARK_SERVER,
  WEREAD_KEYWORDS,
  QR_EXPIRED_TEXTS,
};
