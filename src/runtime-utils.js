const fs = require('fs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveScreenshot(driver, filePath) {
  const image = await driver.takeScreenshot();
  fs.writeFileSync(filePath, image, 'base64');
}

function getChapterJumpIndex(chapterCount) {
  if (!Number.isInteger(chapterCount) || chapterCount <= 0) {
    return -1;
  }
  return chapterCount > 1 ? 1 : 0;
}

function extractProjectLocation(stack) {
  if (!stack) {
    return '';
  }

  const lines = String(stack).split('\n');
  for (const line of lines) {
    const projectMatch = line.match(/(src[\\/][^:\s)]+\.js):(\d+):(\d+)/);
    if (projectMatch) {
      return `${projectMatch[1]}:${projectMatch[2]}`;
    }
  }

  return '';
}

function formatErrorMessage(error) {
  const baseMessage = String(error?.message || error || 'Unknown error');
  const location = extractProjectLocation(error?.stack);
  if (!location) {
    return baseMessage;
  }
  return `${baseMessage} (at ${location})`;
}

module.exports = {
  sleep,
  saveScreenshot,
  getChapterJumpIndex,
  extractProjectLocation,
  formatErrorMessage,
};
