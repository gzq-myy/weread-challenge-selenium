const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDurationConfig, parseKeywords, parseStartupDelayConfig, createRuntimeConfig } = require('../src/config');
const {
  createReadingGesturePlan,
  getStartupDelayMs,
  getReadingStepDelayMs,
  getVisibleTextDelayMultiplier,
  RUN_OPTION_SPECS,
  getRuntimeConfigSnapshot,
  setRuntimeConfigFromEnv,
} = require('../src/weread-challenge');
const {
  getChapterJumpIndex,
  extractProjectLocation,
  formatErrorMessage,
} = require('../src/runtime-utils');
const { Browser } = require('../src/patchright-driver');

test('parseDurationConfig: 有效区间按随机值返回分钟数', () => {
  const duration = parseDurationConfig('10-20', {
    random: () => 0.5,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(duration, 15);
});

test('parseDurationConfig: 非法区间回退到默认值 10', () => {
  const duration = parseDurationConfig('20-10', {
    random: () => 0.3,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(duration, 10);
});

test('parseKeywords: 去除空白与空项', () => {
  const keywords = parseKeywords('  历史, 科幻 ,, 经济学  ');
  assert.deepEqual(keywords, ['历史', '科幻', '经济学']);
});

function hasLegacyMailConfig(value) {
  return Object.keys(value).some((key) => key.includes('MAIL'));
}

test('运行配置: 支持 Webhook 且不再暴露旧通知配置', () => {
  const config = createRuntimeConfig({ WEBHOOK_URL: 'https://example.com/hook' }, {
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(config.DATA_DIR, './.weread');
  assert.equal(config.COOKIE_FILE, './.weread/cookies.json');
  assert.equal(config.LOGIN_QR_CODE, './.weread/login.png');
  assert.equal(config.WEBHOOK_URL, 'https://example.com/hook');
  assert.equal(hasLegacyMailConfig(config), false);

  setRuntimeConfigFromEnv({
    WEBHOOK_URL: 'https://example.com/hook',
    WEREAD_DURATION: '10',
  }, { quiet: true });

  const snapshot = getRuntimeConfigSnapshot();
  assert.equal(snapshot.WEBHOOK_URL, 'https://example.com/hook');
  assert.equal(hasLegacyMailConfig(snapshot), false);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEBHOOK_URL'), true);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey.includes('MAIL')), false);
});

test('浏览器运行配置: 使用 Patchright headless 配置，不再暴露远程 Selenium 地址', () => {
  const config = createRuntimeConfig({
    WEREAD_HEADLESS: 'false',
    WEREAD_REMOTE_BROWSER: 'http://selenium:4444',
  }, {
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(config.WEREAD_HEADLESS, false);
  assert.equal(Object.hasOwn(config, 'WEREAD_REMOTE_BROWSER'), false);

  setRuntimeConfigFromEnv({
    WEREAD_HEADLESS: 'false',
    WEREAD_REMOTE_BROWSER: 'http://selenium:4444',
    WEREAD_DURATION: '10',
  }, { quiet: true });

  const snapshot = getRuntimeConfigSnapshot();
  assert.equal(snapshot.WEREAD_HEADLESS, false);
  assert.equal(Object.hasOwn(snapshot, 'WEREAD_REMOTE_BROWSER'), false);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_HEADLESS'), true);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_REMOTE_BROWSER'), false);
});

test('浏览器运行配置: Edge 枚举值使用 edge', () => {
  assert.equal(Browser.EDGE, 'edge');
  assert.equal(
    RUN_OPTION_SPECS.find((spec) => spec.envKey === 'WEREAD_BROWSER').description,
    'Browser name: chrome | edge.'
  );
});

test('阅读滚动节奏: slow 默认明显慢于 normal 和 fast', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(getReadingStepDelayMs('fast'), 1500);
    assert.equal(getReadingStepDelayMs('normal'), 3000);
    assert.equal(getReadingStepDelayMs('slow'), 6000);

    Math.random = () => 1;
    assert.equal(getReadingStepDelayMs('fast'), 3000);
    assert.equal(getReadingStepDelayMs('normal'), 6000);
    assert.equal(getReadingStepDelayMs('slow'), 12000);
  } finally {
    Math.random = originalRandom;
  }
});

test('阅读滚动节奏: 可见文本越多停顿越久', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(getVisibleTextDelayMultiplier(80), 0.8);
    assert.equal(getVisibleTextDelayMultiplier(400), 1);
    assert.equal(getVisibleTextDelayMultiplier(800), 1.35);
    assert.equal(getVisibleTextDelayMultiplier(1300), 1.65);
    assert.equal(getReadingStepDelayMs('slow', 80), 4800);
    assert.equal(getReadingStepDelayMs('slow', 1300), 9900);
  } finally {
    Math.random = originalRandom;
  }
});

function withRandomSequence(values, fn) {
  const originalRandom = Math.random;
  let index = 0;
  try {
    Math.random = () => values[Math.min(index++, values.length - 1)];
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

test('阅读滚动手势: 混合 wheel、短按、反向滚动和长停顿', () => {
  assert.equal(
    withRandomSequence([0.1, 0], () => createReadingGesturePlan(1000).type),
    'wheel'
  );
  assert.equal(
    withRandomSequence([0.6, 0], () => createReadingGesturePlan(1000).type),
    'arrowDown'
  );

  const reverse = withRandomSequence([0.9, 0], () => createReadingGesturePlan(1000));
  assert.equal(reverse.type, 'reverseWheel');
  assert.equal(reverse.deltaY < 0, true);

  assert.equal(
    withRandomSequence([0.96], () => createReadingGesturePlan(1000).type),
    'pageDown'
  );
  assert.equal(
    withRandomSequence([0.99, 0], () => createReadingGesturePlan(1000).type),
    'pause'
  );
});

test('数据目录配置: 默认使用 .weread，显式配置时保留覆盖', () => {
  setRuntimeConfigFromEnv({
    WEREAD_DURATION: '10',
  }, { quiet: true });

  assert.equal(getRuntimeConfigSnapshot().WEREAD_DATA_DIR, '.weread');

  setRuntimeConfigFromEnv({
    WEREAD_DATA_DIR: '  ./custom-data  ',
    WEREAD_DURATION: '10',
  }, { quiet: true });

  assert.equal(getRuntimeConfigSnapshot().WEREAD_DATA_DIR, './custom-data');
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_DATA_DIR'), true);
});

test('启动随机休眠配置: 默认关闭，配置后按最大分钟数计算随机毫秒', () => {
  assert.equal(parseStartupDelayConfig('10'), 10);
  assert.equal(parseStartupDelayConfig('-1'), 0);
  assert.equal(parseStartupDelayConfig('bad'), 0);

  setRuntimeConfigFromEnv({
    WEREAD_DURATION: '10',
  }, { quiet: true });

  assert.equal(getRuntimeConfigSnapshot().WEREAD_STARTUP_DELAY, 0);
  assert.equal(getStartupDelayMs(0, () => 1), 0);

  setRuntimeConfigFromEnv({
    WEREAD_STARTUP_DELAY: '10',
    WEREAD_DURATION: '10',
  }, { quiet: true });

  assert.equal(getRuntimeConfigSnapshot().WEREAD_STARTUP_DELAY, 10);
  assert.equal(getStartupDelayMs(10, () => 0), 0);
  assert.equal(getStartupDelayMs(10, () => 1), 600000);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_STARTUP_DELAY'), true);
});

test('选书配置: 不再暴露 WEREAD_SELECTION，使用 URL 优先和关键词书架匹配', () => {
  const config = createRuntimeConfig({
    DEFAULT_BOOK_URL: '  https://weread.qq.com/web/reader/example  ',
    WEREAD_KEYWORDS: '三体, 历史',
  }, {
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(config.DEFAULT_BOOK_URL, 'https://weread.qq.com/web/reader/example');
  assert.deepEqual(config.WEREAD_KEYWORDS_LIST, ['三体', '历史']);
  assert.equal(Object.hasOwn(config, 'WEREAD_SELECTION'), false);

  setRuntimeConfigFromEnv({
    DEFAULT_BOOK_URL: '  https://weread.qq.com/web/reader/example  ',
    WEREAD_KEYWORDS: '三体',
    WEREAD_DURATION: '10',
  }, { quiet: true });

  const snapshot = getRuntimeConfigSnapshot();
  assert.equal(snapshot.DEFAULT_BOOK_URL, 'https://weread.qq.com/web/reader/example');
  assert.equal(snapshot.WEREAD_KEYWORDS, '三体');
  assert.equal(Object.hasOwn(snapshot, 'WEREAD_SELECTION'), false);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_SELECTION'), false);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'DEFAULT_BOOK_URL'), true);
  assert.equal(RUN_OPTION_SPECS.some((spec) => spec.envKey === 'WEREAD_KEYWORDS'), true);
});

test('章节跳转索引: 仅有 1 章时返回 0，避免越界', () => {
  assert.equal(getChapterJumpIndex(1), 0);
  assert.equal(getChapterJumpIndex(2), 1);
  assert.equal(getChapterJumpIndex(0), -1);
});

test('错误堆栈定位: 应从 src 文件中提取行号', () => {
  const fakeStack = [
    'Error: boom',
    '    at readLoop (/app/src/weread-challenge.js:321:12)',
    '    at main (/app/src/weread-challenge.js:950:3)',
  ].join('\n');

  assert.equal(extractProjectLocation(fakeStack), 'src/weread-challenge.js:321');

  const message = formatErrorMessage({ message: 'boom', stack: fakeStack });
  assert.equal(message, 'boom (at src/weread-challenge.js:321)');
});
