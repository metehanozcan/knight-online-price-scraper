process.setMaxListeners(20);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { scrapeQueue } = require('./queues/scrapeQueue');
const cacheService = require('./services/cacheService');
require('dotenv').config();

const scrapingService = require('./services/scrapingService');
const priceController = require('./controllers/priceController');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

// Başlangıçta cache'den veri yükle
(async () => {
    try {
        const cached = await cacheService.getPriceData();
        if (cached.data && Object.keys(cached.data).length > 0) {
            scrapingService.priceData = cached.data;
            scrapingService.lastUpdate = cached.lastUpdate;
            console.log(`✅ Başlangıçta ${Object.keys(cached.data).length} site verisi cache'den yüklendi`);
        } else {
            console.log('⚠️ Cache boş, ilk scraping bekleniyor...');
        }
    } catch (err) {
        console.error('❌ Başlangıç cache yükleme hatası:', err.message);
    }
})();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"] // API çağrıları için
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : true, // Development'ta tüm origin'lere izin ver
    credentials: true
}));

// Rate limiting - daha yüksek limit
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 dakika
    max: 100, // 100 istek
    message: {
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Static dosyalar için rate limit yok
        return req.path.startsWith('/static') || req.path.endsWith('.js') || req.path.endsWith('.css');
    }
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Routes
app.use('/api', priceController);

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Schedule automatic price updates
const updateInterval = parseInt(process.env.UPDATE_INTERVAL) || 10;

// İlk scraping'i 30 saniye sonra yap
setTimeout(async () => {
    try {
        const cached = await cacheService.getPriceData();
        // Eğer cache boşsa veya 1 saatten eskiyse
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const lastUpdateTime = cached.lastUpdate ? new Date(cached.lastUpdate).getTime() : 0;
        
        if (!cached.data || Object.keys(cached.data).length === 0 || lastUpdateTime < oneHourAgo) {
            console.log('📊 İlk scraping başlatılıyor...');
            await scrapeQueue.add('initial-scrape', {}, {
                removeOnComplete: true,
                removeOnFail: false
            });
        } else {
            console.log('✅ Cache güncel, ilk scraping atlanıyor');
        }
    } catch (error) {
        console.error('❌ İlk scraping hatası:', error);
    }
}, 30000);

// Periyodik güncelleme
scrapeQueue.add(
    'scheduled-scrape',
    {},
    { 
        repeat: { 
            every: updateInterval * 60 * 1000 
        }, 
        jobId: 'scheduled-scrape',
        removeOnComplete: true,
        removeOnFail: false
    }
);

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('🛑 Kapatma sinyali alındı, temiz kapatma yapılıyor...');
    
    try {
        // Queue'yu durdur
        await scrapeQueue.close();
        // Redis bağlantısını kapat
        await cacheService.redis.quit();
        
        console.log('✅ Temiz kapatma tamamlandı');
        process.exit(0);
    } catch (error) {
        console.error('❌ Kapatma hatası:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(PORT, () => {
    console.log('🚀 Knight Online GB Price Scraper');
    console.log(`📊 Server running on port ${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔄 Auto-update: every ${updateInterval} minutes`);
    console.log(`📈 API: http://localhost:${PORT}/api`);
    console.log(`💾 Cache: ${process.env.REDIS_URL ? 'Remote Redis' : 'Local Redis'}`);
});

module.exports = app;