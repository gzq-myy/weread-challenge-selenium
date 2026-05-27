const DEFAULT_READING_DURATION_MINUTES = 10;

function parseDurationConfig(rawValue, options = {}) {
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const logger = options.logger || console;
  const info = typeof logger.info === 'function' ? logger.info.bind(logger) : () => {};
  const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {};

  const value = String(rawValue ?? DEFAULT_READING_DURATION_MINUTES).trim();
  if (value.includes('-')) {
    const [minText, maxText] = value.split('-').map((item) => item.trim());
    const min = Number.parseInt(minText, 10);
    const max = Number.parseInt(maxText, 10);
    const isValidRange = Number.isInteger(min) && Number.isInteger(max) && min > 0 && max > 0 && min <= max;

    if (!isValidRange) {
      warn(`Invalid reading duration range: "${value}". Defaulting to ${DEFAULT_READING_DURATION_MINUTES} minutes.`);
      return DEFAULT_READING_DURATION_MINUTES;
    }

    const duration = Math.floor(random() * (max - min + 1)) + min;
    info(`Reading duration range: ${min}-${max} minutes. This run will be ${duration} minutes.`);
    return duration;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    warn(`Invalid reading duration: "${value}". Defaulting to ${DEFAULT_READING_DURATION_MINUTES} minutes.`);
    return DEFAULT_READING_DURATION_MINUTES;
  }

  return parsed;
}

function parseKeywords(rawKeywords) {
  return String(rawKeywords || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function createRuntimeConfig(env = process.env, options = {}) {
  const duration = parseDurationConfig(env.WEREAD_DURATION || String(DEFAULT_READING_DURATION_MINUTES), options);

  return {
    DATA_DIR: './.weread',
    WEREAD_VERSION: '0.13.0',
    COOKIE_FILE: './.weread/cookies.json',
    LOGIN_QR_CODE: './.weread/login.png',
    URL: 'https://weread.qq.com/',
    DEBUG: env.DEBUG === 'true',
    WEREAD_USER: env.WEREAD_USER || 'weread-default',
    WEREAD_REMOTE_BROWSER: env.WEREAD_REMOTE_BROWSER,
    WEREAD_DURATION: duration,
    WEREAD_SPEED: env.WEREAD_SPEED || 'slow',
    WEREAD_BROWSER: env.WEREAD_BROWSER || 'chrome',
    BARK_KEY: env.BARK_KEY || '',
    BARK_SERVER: env.BARK_SERVER || 'https://api.day.app',
    WEBHOOK_URL: env.WEBHOOK_URL || '',
    WEREAD_KEYWORDS: env.WEREAD_KEYWORDS || '',
    WEREAD_KEYWORDS_LIST: parseKeywords(env.WEREAD_KEYWORDS || ''),
    DEFAULT_BOOK_URL: String(env.DEFAULT_BOOK_URL || '').trim(),
    QR_EXPIRED_TEXTS: ['点击刷新二维码', '二维码已失效'],
  };
}

module.exports = {
  DEFAULT_READING_DURATION_MINUTES,
  parseDurationConfig,
  parseKeywords,
  createRuntimeConfig,
};
