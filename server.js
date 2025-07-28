const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const scrapingService = require('./services/scrapingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Çok fazla istek gönderdiniz, lütfen tekrar deneyin.' }
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.static('public'));

// API sadece cache'teki veriyi döner
app.get('/api/prices', (req, res) => {
    res.json(scrapingService.getPriceData());
});

app.get('/api/prices/best', (req, res) => {
    res.json(scrapingService.getBestPrices());
});

// Manuel güncelleme endpoint'i (isteğe bağlı)
app.post('/api/prices/update', async (req, res) => {
    await scrapingService.updateAllPrices();
    res.json({ updated: true, lastUpdate: scrapingService.getPriceData().lastUpdate });
});

// Healthcheck
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        lastUpdate: scrapingService.getPriceData().lastUpdate
    });
});

// Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// İlk scraping başlat
(async () => {
    console.log('⏳ İlk scraping başlatılıyor...');
    await scrapingService.updateAllPrices();
})();

// Cron job ile her 15 dakikada bir çalıştır
cron.schedule('*/15 * * * *', async () => {
    console.log('🔄 Cron job - scraping başlıyor...');
    await scrapingService.updateAllPrices();
});

app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
