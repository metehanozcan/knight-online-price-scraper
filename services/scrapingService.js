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
                            const price = parseFloat(priceElement.getAttribute('ins-product-price'));
                            
                            if (name && price && name.toLowerCase().includes('knight online')) {
                                const serverMatch = name.match(/(Zero|Felis|Pandora|Agartha|Dryads|Destan|Minark|Oreads)/i);
                                if (serverMatch) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: parseFloat((price / 100).toFixed(2)),
                                        sellPrice: null,
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
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeOyunfor() {
        let page;
        try {
            page = await this.createOptimizedPage();
            
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
                                const price = parseFloat(priceMatch[1].replace(',', '.'));
                                const serverMatch = title.match(/(ZERO|FELIS|PANDORA|AGARTHA|DRYADS|DESTAN|MINARK|OREADS)/i);
                                
                                if (serverMatch && price) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: price / 10,
                                        sellPrice: null,
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
        } finally {
            if (page) await page.close();
        }
    }

    async scrapeKopazar() {
        let page;
        try {
            page = await this.createOptimizedPage();
            
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
                                
                                priceElements.forEach(el => {
                                    const text = el.textContent;
                                    if (text.includes('TL') && text.includes('Satın Al')) {
                                        const priceMatch = text.match(/(\d+[.,]\d+)/);
                                        if (priceMatch) {
                                            buyPrice = parseFloat(priceMatch[1].replace(',', '.'));
                                        }
                                    }
                                });
                                
                                if (buyPrice) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: buyPrice / 10,
                                        sellPrice: null,
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
        } finally {
            if (page) await page.close();
        }
    }

  async scrapeYesilyurtgame() {
    let page;
    try {
        page = await this.createOptimizedPage();
        
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
                    
                    // GB Alış Fiyatı (bizim satış fiyatımız)
                    const buyMatch = sectionText.match(/GB Alış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                    // Satış Fiyatı (bizim alış fiyatımız)
                    const sellMatch = sectionText.match(/Satış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                    
                    let buyPrice = null;
                    let sellPrice = null;
                    
                    if (buyMatch) {
                        buyPrice = parseFloat(buyMatch[1].replace(',', '.'));
                    }
                    
                    if (sellMatch) {
                        sellPrice = parseFloat(sellMatch[1].replace(',', '.'));
                    }
                    
                    // Python kodunda 10 ile çarpılıyor, bu 10M biriminde olduğunu gösteriyor
                    // Biz 1M cinsinden istiyoruz, o yüzden 10'a bölüyoruz
                    if (sellPrice) {
                        products.push({
                            server: serverName,
                            buyPrice: parseFloat((sellPrice / 10).toFixed(2)), // Satış fiyatı bizim alış fiyatımız
                            sellPrice: buyPrice ? parseFloat((buyPrice / 10).toFixed(2)) : null, // GB Alış fiyatı bizim satış fiyatımız
                            unit: '1M',
                            originalName: `Knight Online ${serverName} GB`
                        });
                    }
                    
                } catch (error) {
                    console.error(`YYG Section error:`, error);
                }
            });
            
            // İlk 9 ürünü al (Python kodundaki gibi)
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
    } finally {
        if (page) await page.close();
    }
}

    async scrapeKlasgame() {
        let page;
        try {
            page = await this.createOptimizedPage();
            
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
                            const price = parseFloat(priceElement.textContent.trim().replace(',', '.'));
                            
                            if (price && title.includes(' - ')) {
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
                                    products.push({
                                        server: serverName,
                                        buyPrice: price / unitMultiplier,
                                        sellPrice: null,
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
        } finally {
            if (page) await page.close();
        }
    }

    // PARALEL ÇALIŞAN YENİ VERSİYON
    async updateAllPrices() {
        if (this.isUpdating) {
            console.log('⚠️ Güncelleme zaten devam ediyor...');
            return this.priceData;
        }

        this.isUpdating = true;
        console.log('🚀 Paralel fiyat güncelleme başlatılıyor...');

        try {
            // TÜM SCRAPER'LARI PARALEL ÇALIŞTIR
            const scraperPromises = [
                this.scrapeWithRetry(() => this.scrapeBynogame(), 'ByNoGame'),
                this.scrapeWithRetry(() => this.scrapeOyunfor(), 'OyunFor'),
                this.scrapeWithRetry(() => this.scrapeKopazar(), 'Kopazar'),
                this.scrapeWithRetry(() => this.scrapeYesilyurtgame(), 'Yeşilyurt Game'),
                this.scrapeWithRetry(() => this.scrapeKlasgame(), 'KlasGame')
            ];

            const results = await Promise.allSettled(scraperPromises);
            const newData = {};

            let successCount = 0;
            let errorCount = 0;

            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    newData[data.site] = data;
                    
                    if (data.status === 'success') {
                        successCount++;
                        console.log(`✅ ${data.name}: ${data.products.length} ürün`);
                    } else {
                        errorCount++;
                        console.log(`❌ ${data.name}: Hata`);
                    }
                }
            });

            this.priceData = newData;
            this.lastUpdate = new Date().toISOString();
            console.log(`🎯 Paralel güncelleme tamamlandı - Başarılı: ${successCount}, Hatalı: ${errorCount}`);

            return this.priceData;
        } catch (error) {
            console.error('💥 Güncelleme hatası:', error);
            throw error;
        } finally {
            this.isUpdating = false;
            await this.closeBrowser();
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