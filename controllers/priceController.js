const express = require('express');
const scrapingService = require('../services/scrapingService');
const cacheService = require('../services/cacheService');
const { scrapeQueue } = require('../queues/scrapeQueue');

const router = express.Router();

// Get all price data - SADECE CACHE'TEN
router.get('/prices', async (req, res) => {
    try {
        // Cache'ten hızlıca veri çek - blocking operation yok
        const data = await cacheService.getPriceData();
        
        // Eğer cache boşsa bile hızlıca cevap ver
        const responseData = {
            success: true,
            data: data.data || {},
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false,
            timestamp: new Date().toISOString(),
            cacheStatus: Object.keys(data.data || {}).length > 0 ? 'hit' : 'empty'
        };
        
        // Hızlı response
        res.json(responseData);
        
    } catch (error) {
        console.error('Error fetching cached prices:', error);
        // Hata durumunda bile hızlı cevap ver
        res.json({
            success: true,
            data: {},
            lastUpdate: null,
            isUpdating: false,
            timestamp: new Date().toISOString(),
            cacheStatus: 'error',
            error: 'Cache read failed'
        });
    }
});

// Get best prices by server - SADECE CACHE'TEN
router.get('/prices/best', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        const bestPrices = scrapingService.getBestPrices(data.data || {});
        
        res.json({
            success: true,
            data: bestPrices,
            timestamp: new Date().toISOString(),
            cacheStatus: Object.keys(data.data || {}).length > 0 ? 'hit' : 'empty'
        });
    } catch (error) {
        console.error('Error fetching best prices:', error);
        res.json({ 
            success: true,
            data: {},
            timestamp: new Date().toISOString(),
            cacheStatus: 'error',
            error: 'Cache read failed'
        });
    }
});

// Force price update - ASYNC BACKGROUND
router.post('/prices/update', async (req, res) => {
    try {
        console.log('Manual price update requested');
        
        // Hemen queue'ya ekle ve cevap ver - beklemez
        await scrapeQueue.add('manual-scrape', {}, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000
            }
        });
        
        res.json({
            success: true,
            message: 'Price update queued successfully',
            timestamp: new Date().toISOString(),
            note: 'Update is running in background'
        });
        
    } catch (error) {
        console.error('Error queueing update:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to queue update',
            message: error.message
        });
    }
});

// Get specific site prices - SADECE CACHE'TEN
router.get('/prices/:site', async (req, res) => {
    try {
        const { site } = req.params;
        const data = await cacheService.getPriceData();
        
        if (data.data && data.data[site]) {
            res.json({
                success: true,
                data: data.data[site],
                timestamp: new Date().toISOString(),
                cacheStatus: 'hit'
            });
        } else {
            res.json({ 
                success: true,
                data: null,
                error: 'Site not found in cache',
                availableSites: Object.keys(data.data || {}),
                cacheStatus: 'miss'
            });
        }
    } catch (error) {
        console.error('Error fetching site prices:', error);
        res.json({ 
            success: true,
            data: null,
            error: 'Cache read failed',
            cacheStatus: 'error'
        });
    }
});

// Get price statistics - HIZLI CACHE
router.get('/prices/stats/summary', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        const bestPrices = scrapingService.getBestPrices(data.data || {});
        
        // Calculate overall statistics
        const allPrices = [];
        Object.values(data.data || {}).forEach(siteData => {
            if (siteData.status === 'success') {
                siteData.products.forEach(product => {
                    if (product.buyPrice) {
                        allPrices.push(product.buyPrice * 100); // Convert to GB price
                    }
                });
            }
        });
        
        const stats = {
            totalSites: Object.keys(data.data || {}).length,
            activeSites: Object.values(data.data || {}).filter(site => site.status === 'success').length,
            totalPrices: allPrices.length,
            avgPrice: allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0,
            minPrice: allPrices.length > 0 ? Math.min(...allPrices) : 0,
            maxPrice: allPrices.length > 0 ? Math.max(...allPrices) : 0,
            priceRange: allPrices.length > 0 ? Math.max(...allPrices) - Math.min(...allPrices) : 0,
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false,
            cacheStatus: Object.keys(data.data || {}).length > 0 ? 'hit' : 'empty'
        };
        
        res.json({
            success: true,
            stats,
            bestPrices,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching price statistics:', error);
        res.json({ 
            success: true,
            stats: {
                totalSites: 0,
                activeSites: 0,
                totalPrices: 0,
                avgPrice: 0,
                minPrice: 0,
                maxPrice: 0,
                priceRange: 0,
                lastUpdate: null,
                isUpdating: false,
                cacheStatus: 'error'
            },
            bestPrices: {},
            timestamp: new Date().toISOString(),
            error: 'Statistics calculation failed'
        });
    }
});

// Health check - HIZLI CACHE
router.get('/health', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        const sitesStatus = {};
        
        Object.entries(data.data || {}).forEach(([site, siteData]) => {
            sitesStatus[site] = {
                status: siteData.status,
                lastUpdate: siteData.timestamp,
                productCount: siteData.products ? siteData.products.length : 0
            };
        });
        
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false,
            sitesStatus,
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
            cacheStatus: Object.keys(data.data || {}).length > 0 ? 'healthy' : 'empty'
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            uptime: process.uptime(),
            error: 'Cache health check failed',
            timestamp: new Date().toISOString(),
            cacheStatus: 'error'
        });
    }
});

module.exports = router;