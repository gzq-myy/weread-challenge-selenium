const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDurationConfig, parseKeywords } = require('../src/config');
const {
  getChapterJumpIndex,
  extractProjectLocation,
  formatErrorMessage,
} = require('../src/runtime-utils');

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
