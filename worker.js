process.setMaxListeners(20);

const { Worker } = require('bullmq');
const { connection } = require('./queues/scrapeQueue');
const scrapingService = require('./services/scrapingService');
const cacheService = require('./services/cacheService');

console.log('🚀 Worker başlatılıyor...');

// Worker başlarken cache'den veri yükle
(async () => {
  try {
    const cached = await cacheService.getPriceData();
    if (cached.data && Object.keys(cached.data).length > 0) {
      scrapingService.priceData = cached.data;
      scrapingService.lastUpdate = cached.lastUpdate;
      console.log(`✅ Cache'den ${Object.keys(cached.data).length} site verisi yüklendi`);
    }
  } catch (err) {
    console.error('❌ Cache yükleme hatası:', err.message);
  }
})();

const worker = new Worker('scrape', async (job) => {
  console.log(`🔄 Scrape job başladı: ${job.id}`);
  
  try {
    // Update flag'ini set et
    await cacheService.setUpdating(true);
    
    // Paralel scraping yap
    const data = await scrapingService.updateAllPrices();
    
    // Cache'e kaydet
    await cacheService.setPriceData({
      data,
      lastUpdate: new Date().toISOString(),
      isUpdating: false
    });
    
    console.log(`✅ Scrape job tamamlandı: ${job.id}`);
    return { success: true, sites: Object.keys(data).length };
    
  } catch (err) {
    console.error(`❌ Scrape job başarısız: ${job.id}`, err.message);
    
    // Hata durumunda da update flag'ini kapat
    await cacheService.setUpdating(false);
    
    throw err;
  }
}, { 
  connection,
  concurrency: 1, // Aynı anda sadece 1 job çalışsın
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 20 }
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} başarıyla tamamlandı`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} başarısız:`, err.message);
});

worker.on('error', err => {
  console.error('❌ Worker hatası:', err);
});

console.log('✅ Worker hazır ve dinliyor...');
