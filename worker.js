const { Worker } = require('bullmq');
const { connection } = require('./queues/scrapeQueue');
const scrapingService = require('./services/scrapingService');
const cacheService = require('./services/cacheService');

const worker = new Worker('scrape', async () => {
  const data = await scrapingService.updateAllPrices();
  await cacheService.setPriceData({
    data,
    lastUpdate: new Date().toISOString(),
    isUpdating: false
  });
}, { connection });

worker.on('completed', job => {
  console.log(`Scrape job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Scrape job ${job?.id} failed`, err);
});
