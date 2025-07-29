const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'puppeteer') {
    return {
      launch: async () => ({
        newPage: async () => ({
          setDefaultNavigationTimeout: async () => {},
          setDefaultTimeout: async () => {},
          setViewport: async () => {},
          setUserAgent: async () => {},
          setExtraHTTPHeaders: async () => {},
          setRequestInterception: async () => {},
          on: () => {},
          goto: async () => {},
          waitForTimeout: async () => {},
          evaluate: async () => {},
          $$eval: async () => [],
          close: async () => {}
        }),
        close: async () => {},
        version: async () => 'stub'
      })
    };
  }
  return originalLoad(request, parent, isMain);
};

const { testGetBestPrices } = require('./getBestPrices.test');

(async () => {
  try {
    await testGetBestPrices();
    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
})();
