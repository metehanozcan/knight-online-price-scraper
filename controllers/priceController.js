const express = require('express');
const scrapingService = require('../services/scrapingService');
const cacheService = require('../services/cacheService');
const { scrapeQueue } = require('../queues/scrapeQueue');

const router = express.Router();

// SADECE CACHE'DEN VERİ AL - SCRAPING TETİKLEME
router.get('/prices', async (req, res) => {
    try {
        // Sadece cache'den al
        const data = await cacheService.getPriceData();
        
        // Cache boşsa bile boş data döndür, scraping tetikleme
        res.json({
            success: true,
            data: data.data || {},
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false,
            timestamp: new Date().toISOString(),
            source: 'cache'
        });
    } catch (error) {
        console.error('Error fetching prices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch prices',
            message: error.message
        });
    }
});

// Get best prices by server - SADECE CACHE'DEN
router.get('/prices/best', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        const bestPrices = scrapingService.getBestPrices(data.data || {});
        
        res.json({
            success: true,
            data: bestPrices,
            timestamp: new Date().toISOString(),
            source: 'cache'
        });
    } catch (error) {
        console.error('Error fetching best prices:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch best prices',
            message: error.message 
        });
    }
});

// MANUEL GÜNCELLEME - SADECE BU ENDPOINT SCRAPING TETİKLER
router.post('/prices/update', async (req, res) => {
    try {
        console.log('Manual price update requested');
        
        // Zaten güncelleme varsa reddet
        const currentData = await cacheService.getPriceData();
        if (currentData.isUpdating) {
            return res.status(429).json({
                success: false,
                error: 'Update already in progress',
                message: 'Güncelleme zaten devam ediyor'
            });
        }
        
        // Queue'ya ekle
        await scrapeQueue.add('manual-scrape', {}, {
            removeOnComplete: true,
            removeOnFail: false
        });
        
        res.json({
            success: true,
            message: 'Price update queued',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error updating prices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update prices',
            message: error.message
        });
    }
});

// Get specific site prices - SADECE CACHE
router.get('/prices/:site', async (req, res) => {
    try {
        const { site } = req.params;
        const data = await cacheService.getPriceData();
        
        if (data.data && data.data[site]) {
            res.json({
                success: true,
                data: data.data[site],
                timestamp: new Date().toISOString(),
                source: 'cache'
            });
        } else {
            res.status(404).json({ 
                success: false,
                error: 'Site not found',
                availableSites: Object.keys(data.data || {})
            });
        }
    } catch (error) {
        console.error('Error fetching site prices:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch site prices',
            message: error.message 
        });
    }
});

// Get price statistics - SADECE CACHE
router.get('/prices/stats/summary', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        
        if (!data.data || Object.keys(data.data).length === 0) {
            return res.json({
                success: true,
                stats: {
                    totalSites: 0,
                    activeSites: 0,
                    totalPrices: 0,
                    avgPrice: 0,
                    minPrice: 0,
                    maxPrice: 0,
                    priceRange: 0,
                    lastUpdate: data.lastUpdate,
                    isUpdating: data.isUpdating || false
                },
                bestPrices: {},
                timestamp: new Date().toISOString(),
                source: 'cache'
            });
        }
        
        const bestPrices = scrapingService.getBestPrices(data.data);
        
        // Calculate overall statistics
        const allPrices = [];
        Object.values(data.data).forEach(siteData => {
            if (siteData.status === 'success') {
                siteData.products.forEach(product => {
                    if (product.buyPrice) {
                        allPrices.push(product.buyPrice * 100);
                    }
                });
            }
        });
        
        const stats = {
            totalSites: Object.keys(data.data).length,
            activeSites: Object.values(data.data).filter(site => site.status === 'success').length,
            totalPrices: allPrices.length,
            avgPrice: allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0,
            minPrice: allPrices.length > 0 ? Math.min(...allPrices) : 0,
            maxPrice: allPrices.length > 0 ? Math.max(...allPrices) : 0,
            priceRange: allPrices.length > 0 ? Math.max(...allPrices) - Math.min(...allPrices) : 0,
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false
        };
        
        res.json({
            success: true,
            stats,
            bestPrices,
            timestamp: new Date().toISOString(),
            source: 'cache'
        });
    } catch (error) {
        console.error('Error fetching price statistics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch price statistics',
            message: error.message 
        });
    }
});

// Health check
router.get('/health', async (req, res) => {
    try {
        const data = await cacheService.getPriceData();
        const sitesStatus = {};
        
        if (data.data) {
            Object.entries(data.data).forEach(([site, siteData]) => {
                sitesStatus[site] = {
                    status: siteData.status,
                    lastUpdate: siteData.timestamp,
                    productCount: siteData.products ? siteData.products.length : 0
                };
            });
        }
        
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating || false,
            sitesStatus,
            cacheStatus: 'active',
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;