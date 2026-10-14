const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Store the browser cache in a directory relative to the project
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
