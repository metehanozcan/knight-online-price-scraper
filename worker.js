process.setMaxListeners(20);

const { Worker } = require('bullmq');
const { connection } = require('./queues/scrapeQueue');
const scrapingService = require('./services/scrapingService');
const cacheService = require('./services/cacheService');

(async () => {
  try {
    const cached = await cacheService.getPriceData();
    scrapingService.priceData = cached.data;
    scrapingService.lastUpdate = cached.lastUpdate;
  } catch (err) {
    console.error('Failed to load cached prices:', err.message);
  }
})();

const worker = new Worker('scrape', async () => {
  try {
    const data = await scrapingService.updateAllPrices();
    await cacheService.setPriceData({
      data,
      lastUpdate: new Date().toISOString(),
      isUpdating: false
    });
  } catch (err) {
    console.error('Update failed:', err.message);
    const cached = await cacheService.getPriceData();
    await cacheService.setPriceData({
      data: cached.data,
      lastUpdate: cached.lastUpdate,
      isUpdating: false
    });
    throw err;
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Scrape job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Scrape job ${job?.id} failed`, err);
});
