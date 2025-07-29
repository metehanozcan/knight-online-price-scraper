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

// GÜVENLİ TRUST PROXY KONFİGÜRASYONU
if (process.env.NODE_ENV === 'production') {
    // Production'da sadece ilk proxy'yi güven (Railway, Heroku, etc. için)
    app.set('trust proxy', 1);
} else {
    // Development'ta localhost için
    app.set('trust proxy', 'loopback');
}

const PORT = process.env.PORT || 3000;

// HIZLI CACHE LOAD - NON-BLOCKING
(async () => {
    try {
        console.log('🔄 Loading cached data...');
        const cached = await cacheService.getPriceData();
        
        if (cached.data && Object.keys(cached.data).length > 0) {
            scrapingService.priceData = cached.data;
            scrapingService.lastUpdate = cached.lastUpdate;
            console.log('✅ Cached data loaded:', Object.keys(cached.data).length, 'sites');
        } else {
            console.log('⚠️ No cached data found, will trigger initial scrape');
            scrapingService.priceData = {};
            scrapingService.lastUpdate = null;
        }
    } catch (err) {
        console.error('❌ Failed to load cached prices:', err.message);
        scrapingService.priceData = {};
        scrapingService.lastUpdate = null;
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
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// GÜVENLİ RATE LIMITING
const limiter = rateLimit({
    windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX || 100,
    
    // Güvenli key generator - IP + User-Agent kombinasyonu
    keyGenerator: (req) => {
        const forwarded = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || 'unknown';
        // IP + User-Agent hash'i ile daha güvenli rate limiting
        return `${forwarded}_${userAgent.substring(0, 50)}`;
    },
    
    // Skip successful requests - sadece failed request'leri say
    skipSuccessfulRequests: true,
    
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: 'Rate limit exceeded'
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    // Rate limit aşıldığında log
    onLimitReached: (req, res, options) => {
        console.log(`Rate limit exceeded for IP: ${req.ip}, User-Agent: ${req.get('User-Agent')?.substring(0, 50)}`);
    }
});

// Sadece API endpoint'lerine rate limiting uygula
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

// Health check endpoint - rate limit'e tabi değil
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Rate limit error'ı özel olarak handle et
    if (err.code === 'ERR_ERL_PERMISSIVE_TRUST_PROXY') {
        console.error('Trust proxy configuration error - this should not happen');
        return res.status(500).json({
            error: 'Server configuration error',
            message: 'Trust proxy settings need adjustment'
        });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ARKAPLAN GÜNCELLEME SCHEDULING
const updateInterval = process.env.UPDATE_INTERVAL || 10;

// Uygulama başladıktan sonra queue'yu kur
app.listen(PORT, async () => {
    console.log('🚀 Knight Online GB Price Scraper');
    console.log(`📊 Server running on port ${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔄 Auto-update: every ${updateInterval} minutes`);
    console.log(`📈 API: http://localhost:${PORT}/api`);
    console.log(`🛡️ Trust proxy: ${app.get('trust proxy')}`);
    
    try {
        // Schedule automatic price updates
        await scrapeQueue.add(
            'scheduled-scrape',
            {},
            { 
                repeat: { every: updateInterval * 60 * 1000 },
                jobId: 'scheduled-scrape',
                removeOnComplete: 5,
                removeOnFail: 3
            }
        );
        console.log('✅ Scheduled updates configured');
        
        // İlk scrape'i 5 saniye sonra başlat (sadece cache boşsa)
        setTimeout(async () => {
            try {
                const cached = await cacheService.getPriceData();
                if (!cached.data || Object.keys(cached.data).length === 0) {
                    console.log('🔄 Cache empty, triggering initial scrape...');
                    await scrapeQueue.add('initial-scrape', {}, {
                        attempts: 3,
                        backoff: 'exponential'
                    });
                } else {
                    console.log('✅ Cache has data, skipping initial scrape');
                }
            } catch (error) {
                console.error('❌ Initial scrape setup failed:', error.message);
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ Queue setup failed:', error.message);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    try {
        await scrapeQueue.close();
        console.log('Queue closed');
    } catch (error) {
        console.error('Error closing queue:', error.message);
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    try {
        await scrapeQueue.close();
        console.log('Queue closed');
    } catch (error) {
        console.error('Error closing queue:', error.message);
    }
    process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Uygulamayı crash ettirme, sadece log
});

module.exports = app;