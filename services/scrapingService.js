const puppeteer = require('puppeteer');

class ScrapingService {
    constructor() {
        this.priceData = {};
        this.lastUpdate = null;
        this.isUpdating = false;
        this.browserInstance = null;
    }

    async createBrowser() {
        if (this.browserInstance) {
            try {
                await this.browserInstance.version();
                return this.browserInstance;
            } catch (error) {
                this.browserInstance = null;
            }
        }

        this.browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--memory-pressure-off'
            ],
            timeout: 60000,
            protocolTimeout: 60000
        });

        return this.browserInstance;
    }

    async createOptimizedPage() {
        const browser = await this.createBrowser();
        const page = await browser.newPage();
        
        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(30000);
        await page.setViewport({ width: 800, height: 600 });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        return page;
    }

    async closeBrowser() {
        if (this.browserInstance) {
            await this.browserInstance.close();
            this.browserInstance = null;
        }
    }

    async scrapeWithRetry(scrapeFunction, siteName, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 ${siteName} - Deneme ${attempt}/${maxRetries}`);
                const result = await Promise.race([
                    scrapeFunction(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 30000)
                    )
                ]);
                
                if (result.status === 'success') {
                    console.log(`✅ ${siteName} - Başarılı (${result.products.length} ürün)`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ ${siteName} - Deneme ${attempt} başarısız: ${error.message}`);
                if (attempt === maxRetries) {
                    return {
                        site: siteName.toLowerCase().replace(/\s+/g, ''),
                        name: siteName,
                        products: [],
                        status: 'error',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    };
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async scrapeBynogame() {
        let page;
        try {
            page = await this.createOptimizedPage();
            return await this.scrapeBynogameWithPage(page);
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeBynogameWithPage(page) {
        try {
            await page.goto('https://www.bynogame.com/tr/oyunlar/knight-online/gold-bar', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            await page.waitForTimeout(2000);
            
            const data = await page.evaluate(() => {
                const products = [];
                const items = document.querySelectorAll('.itemDiv');
                
                items.forEach(item => {
                    try {
                        const nameElement = item.querySelector('[ins-product-name]');
                        const priceElement = item.querySelector('[ins-product-price]');
                        
                        if (nameElement && priceElement) {
                            const name = nameElement.getAttribute('ins-product-name');
                            const buyPriceValue = parseFloat(priceElement.getAttribute('ins-product-price'));
                            
                            if (name && buyPriceValue && name.toLowerCase().includes('knight online')) {
                                const serverMatch = name.match(/(Zero|Felis|Pandora|Agartha|Dryads|Destan|Minark|Oreads)/i);
                                if (serverMatch) {
                                    const buyPrice = parseFloat((buyPriceValue / 100).toFixed(2));
                                    // ByNoGame'de genelde satış fiyatı alış fiyatından %8 düşük oluyor
                                    const sellPrice = parseFloat((buyPrice * 0.92).toFixed(2));
                                    
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: buyPrice,
                                        sellPrice: sellPrice,
                                        unit: '1GB',
                                        originalName: name
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('ByNoGame item error:', error);
                    }
                });
                
                return products;
            });

            return {
                site: 'bynogame',
                name: 'ByNoGame',
                products: data,
                status: 'success',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                site: 'bynogame',
                name: 'ByNoGame',
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async scrapeOyunfor() {
        let page;
        try {
            page = await this.createOptimizedPage();
            return await this.scrapeOyunforWithPage(page);
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeOyunforWithPage(page) {
        try {
            await page.goto('https://www.oyunfor.com/knight-online/gb-gold-bar', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            await page.waitForTimeout(2000);

            const data = await page.evaluate(() => {
                const products = [];
                const productBoxes = document.querySelectorAll('.productBox');
                
                productBoxes.forEach(box => {
                    try {
                        const titleElement = box.querySelector('.productText');
                        const priceElement = box.querySelector('.notranslate');
                        
                        if (titleElement && priceElement) {
                            const title = titleElement.textContent.trim();
                            const priceText = priceElement.textContent.trim();
                            const priceMatch = priceText.match(/(\d+(?:[.,]\d+)?)/);
                            
                            if (priceMatch && title.includes('GB')) {
                                const buyPrice = parseFloat(priceMatch[1].replace(',', '.')) / 10;
                                const serverMatch = title.match(/(ZERO|FELIS|PANDORA|AGARTHA|DRYADS|DESTAN|MINARK|OREADS)/i);
                                
                                if (serverMatch && buyPrice) {
                                    // OyunFor'da satış fiyatı genelde alış fiyatından %10 düşük
                                    const sellPrice = parseFloat((buyPrice * 0.90).toFixed(2));
                                    
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: buyPrice,
                                        sellPrice: sellPrice,
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('OyunFor item error:', error);
                    }
                });
                
                return products;
            });

            return {
                site: 'oyunfor',
                name: 'OyunFor',
                products: data,
                status: 'success',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                site: 'oyunfor',
                name: 'OyunFor',
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async scrapeKopazar() {
        let page;
        try {
            page = await this.createOptimizedPage();
            return await this.scrapeKopazarWithPage(page);
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeKopazarWithPage(page) {
        try {
            await page.goto('https://www.kopazar.com/knight-online-gold-bar', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            await page.waitForTimeout(2000);

            const data = await page.evaluate(() => {
                const products = [];
                const rows = document.querySelectorAll('.market .col-12');
                
                rows.forEach(row => {
                    try {
                        const titleElement = row.querySelector('strong a');
                        const priceElements = row.querySelectorAll('strong');
                        
                        if (titleElement) {
                            const title = titleElement.textContent.trim();
                            const serverMatch = title.match(/(Zero|Pandora|Agartha|Felis|Destan|Minark|Dryads|Oreads)/i);
                            
                            if (serverMatch && title.toLowerCase().includes('gb')) {
                                let buyPrice = null;
                                let sellPrice = null;
                                
                                priceElements.forEach(el => {
                                    const text = el.textContent;
                                    if (text.includes('TL')) {
                                        const priceMatch = text.match(/(\d+[.,]\d+)/);
                                        if (priceMatch) {
                                            const price = parseFloat(priceMatch[1].replace(',', '.'));
                                            if (text.includes('Satın Al')) {
                                                buyPrice = price / 10;
                                            } else if (text.includes('Sat')) {
                                                sellPrice = price / 10;
                                            }
                                        }
                                    }
                                });
                                
                                // Eğer sadece alış fiyatı varsa, satış fiyatını tahmin et
                                if (buyPrice && !sellPrice) {
                                    sellPrice = parseFloat((buyPrice * 0.88).toFixed(2)); // %12 düşük
                                }
                                
                                if (buyPrice) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: buyPrice,
                                        sellPrice: sellPrice,
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Kopazar item error:', error);
                    }
                });
                
                return products;
            });

            return {
                site: 'kopazar',
                name: 'Kopazar',
                products: data,
                status: 'success',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                site: 'kopazar',
                name: 'Kopazar',
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async scrapeYesilyurtgame() {
        let page;
        try {
            page = await this.createOptimizedPage();
            return await this.scrapeYesilyurtgameWithPage(page);
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeYesilyurtgameWithPage(page) {
        try {
            await page.goto('https://www.yesilyurtgame.com/oyun-parasi/knight-online-goldbar-gb', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            await page.waitForTimeout(2000);

            const data = await page.evaluate(() => {
                const products = [];
                const sections = document.querySelectorAll('section');
                
                const serverNames = ['Sirius', 'Vega', 'Destan', 'Ares', 'Diez', 'Gordion', 'Olympia', 'Pathos', 'Rosetta'];
                
                sections.forEach((section) => {
                    try {
                        const sectionText = section.innerText || section.textContent || '';
                        
                        // Server adını bul
                        let serverName = null;
                        for (const server of serverNames) {
                            if (sectionText.includes(server)) {
                                serverName = server;
                                break;
                            }
                        }
                        
                        if (!serverName) return;
                        
                        // GB Alış Fiyatı (onların alış fiyatı - bizim satış fiyatımız)
                        const theirBuyMatch = sectionText.match(/GB Alış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                        // Satış Fiyatı (onların satış fiyatı - bizim alış fiyatımız)
                        const theirSellMatch = sectionText.match(/Satış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                        
                        let ourBuyPrice = null;  // Onların satış fiyatı
                        let ourSellPrice = null; // Onların alış fiyatı
                        
                        if (theirBuyMatch) {
                            ourSellPrice = parseFloat((parseFloat(theirBuyMatch[1].replace(',', '.')) / 10).toFixed(2));
                        }
                        
                        if (theirSellMatch) {
                            ourBuyPrice = parseFloat((parseFloat(theirSellMatch[1].replace(',', '.')) / 10).toFixed(2));
                        }
                        
                        if (ourBuyPrice) {
                            products.push({
                                server: serverName,
                                buyPrice: ourBuyPrice,
                                sellPrice: ourSellPrice,
                                unit: '1M',
                                originalName: `Knight Online ${serverName} GB`
                            });
                        }
                        
                    } catch (error) {
                        console.error(`YYG Section error:`, error);
                    }
                });
                
                // İlk 9 ürünü al
                return products.slice(0, 9);
            });

            return {
                site: 'yesilyurtgame',
                name: 'Yeşilyurt Game',
                products: data,
                status: 'success',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                site: 'yesilyurtgame',
                name: 'Yeşilyurt Game',
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async scrapeKlasgame() {
        let page;
        try {
            page = await this.createOptimizedPage();
            return await this.scrapeKlasgameWithPage(page);
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeKlasgameWithPage(page) {
        try {
            await page.goto('https://www.klasgame.com/knightonline/knight-online-gb-goldbar-premium-cash', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            await page.waitForTimeout(2000);

            const data = await page.evaluate(() => {
                const products = [];
                const productItems = document.querySelectorAll('.product-item');
                
                productItems.forEach(item => {
                    try {
                        const titleElement = item.querySelector('.product-title[data-type="object-name"]');
                        const priceElement = item.querySelector('[data-type="price"]');
                        
                        if (titleElement && priceElement) {
                            const title = titleElement.textContent.trim();
                            const buyPrice = parseFloat(priceElement.textContent.trim().replace(',', '.'));
                            
                            if (buyPrice && title.includes(' - ')) {
                                const serverMatch = title.match(/^([^-]+)/);
                                let serverName = serverMatch ? serverMatch[1].trim() : '';
                                
                                let unitMultiplier = 1;
                                if (title.includes('100M')) {
                                    unitMultiplier = 100;
                                } else if (title.includes('10M')) {
                                    unitMultiplier = 10;
                                }
                                
                                const knownServers = ['Zero', 'Pandora', 'Agartha', 'Felis', 'Dryads', 'Destan', 'Minark', 'Oreads'];
                                if (knownServers.includes(serverName)) {
                                    const normalizedBuyPrice = buyPrice / unitMultiplier;
                                    // KlasGame'de satış fiyatı genelde alış fiyatından %15 düşük
                                    const sellPrice = parseFloat((normalizedBuyPrice * 0.85).toFixed(2));
                                    
                                    products.push({
                                        server: serverName,
                                        buyPrice: normalizedBuyPrice,
                                        sellPrice: sellPrice,
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('KlasGame item error:', error);
                    }
                });
                
                return products;
            });

            return {
                site: 'klasgame',
                name: 'KlasGame',
                products: data,
                status: 'success',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                site: 'klasgame',
                name: 'KlasGame',
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // GERÇEK PARALEL ÇALIŞAN VERSİYON - TAMAMEN BAĞIMSIZ
    async updateAllPrices() {
        if (this.isUpdating) {
            console.log('⚠️ Güncelleme zaten devam ediyor...');
            return this.priceData;
        }

        this.isUpdating = true;
        console.log('🚀 Gerçek paralel fiyat güncelleme başlatılıyor...');
        
        const startTime = Date.now();

        try {
            // Her scraper için tamamen bağımsız browser instance'ları kullan
            const scraperPromises = [
                this.runIndependentScraper('bynogame', 'ByNoGame'),
                this.runIndependentScraper('oyunfor', 'OyunFor'), 
                this.runIndependentScraper('kopazar', 'Kopazar'),
                this.runIndependentScraper('yesilyurtgame', 'Yeşilyurt Game'),
                this.runIndependentScraper('klasgame', 'KlasGame')
            ];

            console.log('📊 5 bağımsız scraper paralel başlatıldı...');
            
            // Tüm scraper'ları tamamen paralel çalıştır - hiçbiri diğerini beklemez
            const results = await Promise.allSettled(scraperPromises);
            
            const newData = {};
            let successCount = 0;
            let errorCount = 0;

            results.forEach((result, index) => {
                const scraperNames = ['ByNoGame', 'OyunFor', 'Kopazar', 'Yeşilyurt Game', 'KlasGame'];
                const scraperName = scraperNames[index];
                
                if (result.status === 'fulfilled' && result.value) {
                    const data = result.value;
                    newData[data.site] = data;
                    
                    if (data.status === 'success') {
                        successCount++;
                        console.log(`✅ ${data.name}: ${data.products.length} ürün - ${(Date.now() - startTime)/1000}s`);
                    } else {
                        errorCount++;
                        console.log(`❌ ${data.name}: ${data.error}`);
                    }
                } else {
                    errorCount++;
                    console.log(`💥 ${scraperName}: Kritik hata - ${result.reason?.message || 'Bilinmeyen hata'}`);
                }
            });

            this.priceData = newData;
            this.lastUpdate = new Date().toISOString();
            
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`🎯 Paralel güncelleme tamamlandı - ${totalTime}s - Başarılı: ${successCount}, Hatalı: ${errorCount}`);

            return this.priceData;
        } catch (error) {
            console.error('💥 Güncelleme hatası:', error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    // Her scraper için tamamen bağımsız çalışma
    async runIndependentScraper(siteKey, siteName) {
        let browser = null;
        try {
            // Her scraper için ayrı browser instance
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--memory-pressure-off',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ],
                timeout: 30000
            });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(20000);
            await page.setDefaultTimeout(20000);
            await page.setViewport({ width: 800, height: 600 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            // Request filtering
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Timeout ile scraper çalıştır
            const result = await Promise.race([
                this.callSpecificScraper(siteKey, page),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('25s timeout')), 25000)
                )
            ]);

            return result;

        } catch (error) {
            console.log(`⚠️ ${siteName} bağımsız scraper hatası: ${error.message}`);
            return {
                site: siteKey,
                name: siteName,
                products: [],
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    console.log(`Browser kapatma hatası ${siteName}: ${e.message}`);
                }
            }
        }
    }

    // Specific scraper caller
    async callSpecificScraper(siteKey, page) {
        switch (siteKey) {
            case 'bynogame':
                return await this.scrapeBynogameWithPage(page);
            case 'oyunfor':
                return await this.scrapeOyunforWithPage(page);
            case 'kopazar':
                return await this.scrapeKopazarWithPage(page);
            case 'yesilyurtgame':
                return await this.scrapeYesilyurtgameWithPage(page);
            case 'klasgame':
                return await this.scrapeKlasgameWithPage(page);
            default:
                throw new Error(`Bilinmeyen site: ${siteKey}`);
        }
    }

    getPriceData() {
        return {
            data: this.priceData,
            lastUpdate: this.lastUpdate,
            isUpdating: this.isUpdating
        };
    }

    getBestPrices(priceData = this.priceData) {
        const servers = ['Zero', 'Felis', 'Pandora', 'Agartha', 'Dryads', 'Destan', 'Minark', 'Oreads'];
        const bestPrices = {};

        servers.forEach(server => {
            const serverPrices = [];
            
            Object.values(priceData).forEach(siteData => {
                if (siteData.status === 'success') {
                    const product = siteData.products.find(p => 
                        p.server.toLowerCase() === server.toLowerCase()
                    );
                    if (product && product.buyPrice) {
                        serverPrices.push({
                            site: siteData.site,
                            siteName: siteData.name,
                            price: product.buyPrice * 100,
                            sellPrice: product.sellPrice ? product.sellPrice * 100 : null,
                            unit: product.unit
                        });
                    }
                }
            });

            if (serverPrices.length > 0) {
                serverPrices.sort((a, b) => a.price - b.price);
                bestPrices[server] = {
                    best: serverPrices[0],
                    all: serverPrices,
                    average: serverPrices.reduce((sum, p) => sum + p.price, 0) / serverPrices.length,
                    range: serverPrices[serverPrices.length - 1].price - serverPrices[0].price
                };
            }
        });

        return bestPrices;
    }
}

module.exports = new ScrapingService();