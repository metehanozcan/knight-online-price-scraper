process.setMaxListeners(20);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
// const { scrapeQueue } = require('./queues/scrapeQueue'); // Worker'da kullanılacak
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
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
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

// Frontend sadece cache'ten veri servis eder
// Worker işlemleri ayrı bir süreçte çalışır
console.log('🖥️ Frontend server - sadece cache\'ten veri servis ediyor');
console.log('⚙️ Worker işlemleri ayrı süreçte çalışmalı: node worker.js');

// Graceful shutdown - sadece Redis bağlantısını kapat
const gracefulShutdown = async () => {
    console.log('🛑 Frontend kapatılıyor...');
    
    try {
        // Sadece Redis bağlantısını kapat
        await cacheService.redis.quit();
        
        console.log('✅ Frontend temiz kapatıldı');
        process.exit(0);
    } catch (error) {
        console.error('❌ Kapatma hatası:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Knight Online GB Price Scraper - Frontend Server');
    console.log(`📊 Frontend server running on port ${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📈 API: http://localhost:${PORT}/api`);
    console.log(`💾 Cache: ${process.env.REDIS_URL ? 'Railway Redis' : 'Local Redis'}`);
    console.log(`⚙️ Worker ayrı çalıştırılmalı: node worker.js`);
});

module.exports = app;