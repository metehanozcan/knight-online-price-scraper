const express = require('express');
const scrapingService = require('../services/scrapingService');

const router = express.Router();

// Get all price data
router.get('/prices', async (req, res) => {
    try {
        const data = scrapingService.getPriceData();
        res.json({
            success: true,
            data: data.data,
            lastUpdate: data.lastUpdate,
            isUpdating: data.isUpdating,
            timestamp: new Date().toISOString()
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

// Get best prices by server
router.get('/prices/best', async (req, res) => {
    try {
        const bestPrices = scrapingService.getBestPrices();
        res.json({
            success: true,
            data: bestPrices,
            timestamp: new Date().toISOString()
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

// Force price update
router.post('/prices/update', async (req, res) => {
    try {
        console.log('Manual price update requested');
        const data = await scrapingService.updateAllPrices();
        res.json({ 
            success: true,
            message: 'Prices updated successfully',
            data,
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

// Get specific site prices
router.get('/prices/:site', async (req, res) => {
    try {
        const { site } = req.params;
        const data = scrapingService.getPriceData();
        
        if (data.data[site]) {
            res.json({
                success: true,
                data: data.data[site],
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(404).json({ 
                success: false,
                error: 'Site not found',
                availableSites: Object.keys(data.data)
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

// Get price statistics
router.get('/prices/stats/summary', async (req, res) => {
    try {
        const data = scrapingService.getPriceData();
        const bestPrices = scrapingService.getBestPrices();
        
        // Calculate overall statistics
        const allPrices = [];
        Object.values(data.data).forEach(siteData => {
            if (siteData.status === 'success') {
                siteData.products.forEach(product => {
                    if (product.buyPrice) {
                        allPrices.push(product.buyPrice * 100); // Convert to GB price
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
            isUpdating: data.isUpdating
        };
        
        res.json({
            success: true,
            stats,
            bestPrices,
            timestamp: new Date().toISOString()
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
router.get('/health', (req, res) => {
    const data = scrapingService.getPriceData();
    const sitesStatus = {};
    
    Object.entries(data.data).forEach(([site, siteData]) => {
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
        isUpdating: data.isUpdating,
        sitesStatus,
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;