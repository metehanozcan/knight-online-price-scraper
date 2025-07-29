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
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=VizDisplayCompositor',
                '--disable-ipc-flooding-protection',
                '--disable-images',
                '--disable-javascript',
                '--disable-plugins',
                '--disable-extensions',
                '--disable-web-security',
                '--aggressive-cache-discard',
                '--memory-pressure-off'
            ],
            timeout: 120000,
            protocolTimeout: 120000
        });

        return this.browserInstance;
    }

    async createOptimizedPage() {
        const browser = await this.createBrowser();
        const page = await browser.newPage();
        
        // Aggressive timeouts
        await page.setDefaultNavigationTimeout(90000);
        await page.setDefaultTimeout(90000);
        
        // Lightweight viewport
        await page.setViewport({ width: 800, height: 600 });
        
        // Realistic headers
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        // Block unnecessary resources
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

    async scrapeWithRetry(scrapeFunction, siteName, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 ${siteName} - Deneme ${attempt}/${maxRetries}`);
                const result = await Promise.race([
                    scrapeFunction(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Overall timeout')), 120000)
                    )
                ]);
                
                if (result.status === 'success') {
                    console.log(`✅ ${siteName} - Başarılı (${result.products.length} ürün)`);
                    return result;
                } else if (attempt === maxRetries) {
                    console.log(`❌ ${siteName} - Son deneme başarısız`);
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
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, attempt * 5000));
            }
        }
    }

async scrapeBynogame() {
    let page;
    try {
        page = await this.createOptimizedPage();
        
        console.log('📡 ByNoGame sayfasına gidiliyor...');
        
        // Multiple navigation strategies
        const navigationStrategies = [
            { waitUntil: 'networkidle0', timeout: 60000 },
            { waitUntil: 'networkidle2', timeout: 45000 },
            { waitUntil: 'domcontentloaded', timeout: 30000 }
        ];
        
        let navigationSuccess = false;
        for (const strategy of navigationStrategies) {
            try {
                await page.goto('https://www.bynogame.com/tr/oyunlar/knight-online/gold-bar', strategy);
                navigationSuccess = true;
                break;
            } catch (navError) {
                console.log(`⚠️ ByNoGame navigation strategy failed: ${strategy.waitUntil}`);
            }
        }
        
        if (!navigationSuccess) {
            throw new Error('All navigation strategies failed');
        }

        console.log('⏳ ByNoGame sayfa yüklendi, parsing başlıyor...');
        await page.waitForTimeout(5000);
        
        // Alternatif olarak, belirli elementlerin yüklenmesini bekle
        try {
            await page.waitForSelector('.itemDiv, .product-item, [ins-product-name]', { timeout: 10000 });
        } catch (error) {
            console.log('⚠️ ByNoGame - Ürün elementleri bulunamadı, devam ediliyor...');
        }

        const data = await page.evaluate(() => {
            const products = [];
            
            // Comprehensive selectors
            const itemSelectors = [
                '.itemDiv',
                '.product-item', 
                '.product-card',
                '[data-product]',
                '.urun-item',
                '.item',
                '.product'
            ];
            
            let items = [];
            for (const selector of itemSelectors) {
                items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    console.log(`ByNoGame - Found ${items.length} items with ${selector}`);
                    break;
                }
            }
            
            if (items.length === 0) {
                console.log('ByNoGame - No items found, trying generic selectors');
                items = document.querySelectorAll('div[class*="item"], div[class*="product"]');
            }
            
            items.forEach(item => {
                try {
                    // Comprehensive name extraction
                    const nameSelectors = [
                        '[ins-product-name]',
                        '.product-title',
                        '.product-name', 
                        '.urun-adi',
                        'h1', 'h2', 'h3', 'h4', 'h5',
                        '.title',
                        '[title]',
                        '.name'
                    ];
                    
                    let name = '';
                    for (const selector of nameSelectors) {
                        const nameElement = item.querySelector(selector);
                        if (nameElement) {
                            name = nameElement.getAttribute('ins-product-name') || 
                                   nameElement.getAttribute('title') ||
                                   nameElement.textContent?.trim();
                            if (name) break;
                        }
                    }
                    
                    // Comprehensive price extraction
                    const priceSelectors = [
                        '[ins-product-price]',
                        '.price',
                        '.fiyat',
                        '.product-price',
                        '.amount',
                        '[class*="price"]',
                        '[class*="fiyat"]'
                    ];
                    
                    let buyPrice = 0;
                    for (const selector of priceSelectors) {
                        const priceElement = item.querySelector(selector);
                        if (priceElement) {
                            const priceText = priceElement.getAttribute('ins-product-price') || 
                                            priceElement.textContent;
                            const priceMatch = priceText?.match(/(\d+(?:[.,]\d+)?)/);
                            if (priceMatch) {
                                buyPrice = parseFloat(priceMatch[1].replace(',', '.'));
                                break;
                            }
                        }
                    }
                    
                    // Extract sell price
                    let sellPrice = null;
                    const sellSelectors = [
                        'button[type="submit"]',
                        '.sell-btn', 
                        '.satis-btn',
                        '[class*="sell"]',
                        '[class*="satis"]'
                    ];
                    
                    for (const selector of sellSelectors) {
                        const sellElement = item.querySelector(selector);
                        if (sellElement) {
                            const sellText = sellElement.textContent || '';
                            const sellMatch = sellText.match(/(\d+(?:[.,]\d+)?)/);
                            if (sellMatch) {
                                sellPrice = parseFloat(sellMatch[1].replace(',', '.'));
                                break;
                            }
                        }
                    }
                    
                    if (name && buyPrice && (name.toLowerCase().includes('gold bar') || name.toLowerCase().includes('gb') || name.toLowerCase().includes('knight online'))) {
                        const serverMatch = name.match(/(Zero|Felis|Pandora|Agartha|Dryads|Destan|Minark|Oreads)/i);
                        if (serverMatch) {
                            // ByNoGame'de fiyatlar 1M cinsinden geliyor (10M değil!)
                            // Bu yüzden bölmeye gerek yok, doğrudan kullan
                        const normalizedBuyPrice = parseFloat(buyPrice.toFixed(6));
        const normalizedSellPrice = sellPrice ? parseFloat(sellPrice.toFixed(6)) : null;
                            
                         products.push({
    server: serverMatch[1],
    buyPrice: parseFloat((normalizedBuyPrice / 100).toFixed(2)), // 1GB fiyatı (100M)
    sellPrice: normalizedSellPrice ? parseFloat((normalizedSellPrice / 100).toFixed(2)) : null,
    unit: '1GB', // artık normalize ettik
    originalName: name,
    originalPrice: buyPrice, // orijinal 1M fiyatı
    originalSellPrice: sellPrice
});

                            
                            console.log(`ByNoGame - Eklendi: ${serverMatch[1]}, Fiyat: ${normalizedBuyPrice} (1M için)`);
                        }
                    }
                } catch (error) {
                    console.error('ByNoGame item processing error:', error);
                }
            });
            
            console.log(`ByNoGame - Toplam ${products.length} ürün işlendi`);
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
        console.error('❌ ByNoGame scraping error:', error.message);
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
            
            console.log('📡 OyunFor sayfasına gidiliyor...');
            
            // Try multiple URLs and strategies
            const urls = [
                'https://www.oyunfor.com/knight-online/gb-gold-bar',
                'https://oyunfor.com/knight-online/gb-gold-bar'
            ];
            
            let pageLoaded = false;
            for (const url of urls) {
                try {
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 60000
                    });
                    pageLoaded = true;
                    break;
                } catch (urlError) {
                    console.log(`⚠️ OyunFor URL failed: ${url}`);
                }
            }
            
            if (!pageLoaded) {
                throw new Error('All URLs failed to load');
            }

            console.log('⏳ OyunFor sayfa yüklendi, parsing başlıyor...');
            await page.waitForTimeout(5000);

            const data = await page.evaluate(() => {
                const products = [];
                
                // Try multiple selectors
                const selectors = [
                    '.productBox',
                    '.product-box',
                    '.product-item',
                    '.product',
                    '[class*="product"]'
                ];
                
                let productBoxes = [];
                for (const selector of selectors) {
                    productBoxes = document.querySelectorAll(selector);
                    if (productBoxes.length > 0) {
                        console.log(`OyunFor - Found ${productBoxes.length} products with ${selector}`);
                        break;
                    }
                }
                
                productBoxes.forEach(box => {
                    try {
                        const titleSelectors = [
                            '.productText',
                            '.product-title',
                            '.title',
                            'h1', 'h2', 'h3', 'h4'
                        ];
                        
                        const priceSelectors = [
                            '.notranslate',
                            '.price',
                            '.fiyat',
                            '[class*="price"]'
                        ];
                        
                        let titleElement = null;
                        let priceElement = null;
                        
                        for (const sel of titleSelectors) {
                            titleElement = box.querySelector(sel);
                            if (titleElement) break;
                        }
                        
                        for (const sel of priceSelectors) {
                            priceElement = box.querySelector(sel);
                            if (priceElement) break;
                        }
                        
                        if (titleElement && priceElement) {
                            const title = titleElement.textContent.trim();
                            const priceText = priceElement.textContent.trim();
                            const priceMatch = priceText.match(/(\d+(?:[.,]\d+)?)/);
                            
                            if (priceMatch && title.includes('GB')) {
                                const price = parseFloat(priceMatch[1].replace(',', '.'));
                                const serverMatch = title.match(/(ZERO|FELIS|PANDORA|AGARTHA|DRYADS|DESTAN|MINARK|OREADS)/i);
                                
                                let sellPrice = null;
                                const sellButtons = box.querySelectorAll('.sellToUsBtn, [class*="sell"]');
                                if (sellButtons.length > 0) {
                                    const sellPriceAttr = sellButtons[0].getAttribute('data-price');
                                    if (sellPriceAttr) {
                                        sellPrice = parseFloat(sellPriceAttr);
                                    }
                                }
                                
                                if (serverMatch && price) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: price / 10, // OyunFor 10M cinsinden
                                        sellPrice: sellPrice ? sellPrice / 10 : null,
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('OyunFor item processing error:', error);
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
            console.error('❌ OyunFor scraping error:', error.message);
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

    async scrapeKlasgame() {
        let page;
        try {
            page = await this.createOptimizedPage();
            
            console.log('📡 KlasGame sayfasına gidiliyor...');
            
            await page.goto('https://www.klasgame.com/knightonline/knight-online-gb-goldbar-premium-cash', {
                waitUntil: 'domcontentloaded',
                timeout: 90000
            });

            console.log('⏳ KlasGame sayfa yüklendi, parsing başlıyor...');
            await page.waitForTimeout(8000); // Longer wait for dynamic content

            const data = await page.evaluate(() => {
                const products = [];
                const productItems = document.querySelectorAll('.product-item, [class*="product"]');
                
                console.log(`KlasGame - ${productItems.length} ürün bulundu`);
                
                productItems.forEach(item => {
                    try {
                        const titleElement = item.querySelector('.product-title, [data-type="object-name"], h3, h4');
                        const priceElement = item.querySelector('[data-type="price"], .price, [class*="price"]');
                        const unitElement = item.querySelector('.product-unit, [class*="unit"]');
                        
                        if (titleElement && priceElement) {
                            const title = titleElement.textContent.trim();
                            const priceText = priceElement.textContent.trim().replace(',', '.');
                            const price = parseFloat(priceText);
                            
                            let unitText = unitElement ? unitElement.textContent.trim() : '';
                            
                            const isKnightOnlineGB = (
                                title.includes(' - ') && 
                                (title.includes('M') || title.includes('GB')) ||
                                unitText.includes('Coins') ||
                                title.toLowerCase().includes('knight online')
                            );
                            
                            if (price && isKnightOnlineGB) {
                                const serverMatch = title.match(/^([^-]+)/);
                                let serverName = serverMatch ? serverMatch[1].trim() : '';
                                
                                const serverMap = {
                                    'Zero': 'ZERO',
                                    'Pandora': 'PANDORA', 
                                    'Agartha': 'AGARTHA',
                                    'Felis': 'FELIS',
                                    'Dryads': 'DRYADS',
                                    'Destan': 'DESTAN',
                                    'Minark': 'MINARK',
                                    'Oreads': 'OREADS'
                                };
                                
                                const normalizedServer = serverMap[serverName] || serverName.toUpperCase();
                                
                                let unitMultiplier = 1;
                                if (title.includes('100M') || unitText.includes('100.000.000')) {
                                    unitMultiplier = 100;
                                } else if (title.includes('10M') || unitText.includes('10.000.000')) {
                                    unitMultiplier = 10;
                                } else if (title.includes('1M') || unitText.includes('1.000.000')) {
                                    unitMultiplier = 1;
                                }
                                
                                const knownServers = ['ZERO', 'PANDORA', 'AGARTHA', 'FELIS', 'DRYADS', 'DESTAN', 'MINARK', 'OREADS'];
                                if (knownServers.includes(normalizedServer)) {
                                    products.push({
                                        server: normalizedServer,
                                        buyPrice: price / unitMultiplier,
                                        sellPrice: null, // KlasGame sell price parsing is complex
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('KlasGame item processing error:', error);
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
            console.error('❌ KlasGame scraping error:', error.message);
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

    // Diğer scraper fonksiyonları (Kopazar, Yesilyurtgame) aynı kalır...
    async scrapeKopazar() {
        let page;
        try {
            page = await this.createOptimizedPage();
            
            console.log('📡 Kopazar sayfasına gidiliyor...');
            await page.goto('https://www.kopazar.com/knight-online-gold-bar', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            await page.waitForTimeout(3000);

            const data = await page.evaluate(() => {
                const products = [];
                const rows = document.querySelectorAll('.market .col-12, [class*="market"] [class*="col"]');
                
                rows.forEach(row => {
                    try {
                        const titleElement = row.querySelector('strong a, a strong, .title, h3, h4');
                        const priceElements = row.querySelectorAll('strong, .price, [class*="price"]');
                        
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
                                                buyPrice = price;
                                            } else if (text.includes('Bize Sat')) {
                                                sellPrice = price;
                                            }
                                        }
                                    }
                                });
                                
                                if (buyPrice) {
                                    products.push({
                                        server: serverMatch[1],
                                        buyPrice: buyPrice / 10, // Kopazar 10M cinsinden
                                        sellPrice: sellPrice ? sellPrice / 10 : null,
                                        unit: '1M',
                                        originalName: title
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Kopazar item processing error:', error);
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
            console.error('❌ Kopazar scraping error:', error.message);
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
        
        console.log('📡 Yeşilyurt Game sayfasına gidiliyor...');
        await page.goto('https://www.yesilyurtgame.com/oyun-parasi/knight-online-goldbar-gb', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(8000); // Daha uzun bekleme

        const data = await page.evaluate(() => {
            const products = [];
            
            // Gerçek HTML'e göre doğru selector
            const sections = document.querySelectorAll('.NXAKMWVtmqrBIipOGUCL section');
            
            console.log(`YeşilYurt Game - ${sections.length} section bulundu`);
            console.log('HTML yapısı:', document.querySelector('.NXAKMWVtmqrBIipOGUCL')?.outerHTML?.substring(0, 500));
            
            sections.forEach((section, index) => {
                try {
                    console.log(`Section ${index} işleniyor:`, section.outerHTML.substring(0, 200));
                    
                    // Title - .RVkdhcYgTNMBPzZyAbuU a
                    const titleElement = section.querySelector('.RVkdhcYgTNMBPzZyAbuU a');
                    
                    // Sell price - .qSWXQCnbAMDamHxtvEij içinde "Satış Fiyatı : X TL"
                    const sellPriceElement = section.querySelector('.qSWXQCnbAMDamHxtvEij');
                    
                    // Buy price - .rztMvBoJilVTRxfgUGnu içinde "GB Alış Fiyatı : X TL"
                    const buyPriceElement = section.querySelector('.rztMvBoJilVTRxfgUGnu');
                    
                    if (titleElement) {
                        const title = titleElement.textContent.trim();
                        console.log(`Title bulundu: ${title}`);
                        
                        if (sellPriceElement) {
                            console.log(`Sell price element: ${sellPriceElement.textContent}`);
                        }
                        if (buyPriceElement) {
                            console.log(`Buy price element: ${buyPriceElement.textContent}`);
                        }
                        
                        // Knight Online kontrolü
                        if (title.includes('Knight Online') && title.includes('M')) {
                            
                            // Server match
                            const serverMatch = title.match(/Knight Online\s+([A-Za-z]+)/i);
                            
                            if (serverMatch) {
                                let serverName = serverMatch[1].trim();
                                console.log(`Server bulundu: ${serverName}`);
                                
                                // Server mapping  
                                const serverMap = {
                                    'Zero': 'ZERO',
                                    'Agartha': 'AGARTHA',
                                    'Pandora': 'PANDORA', 
                                    'Felis': 'FELIS',
                                    'Dryads': 'DRYADS',
                                    'Destan': 'DESTAN',
                                    'Minark': 'MINARK',
                                    'Oreads': 'OREADS'
                                };
                                
                                const normalizedServer = serverMap[serverName] || serverName.toUpperCase();
                                
                                // Parse sell price
                                let sellPrice = null;
                                if (sellPriceElement) {
                                    const sellText = sellPriceElement.textContent;
                                    const sellMatch = sellText.match(/Satış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                                    if (sellMatch) {
                                        sellPrice = parseFloat(sellMatch[1].replace(',', '.'));
                                    }
                                }
                                
                                // Parse buy price (alış fiyatı)
                                let buyPrice = null;
                                if (buyPriceElement) {
                                    const buyText = buyPriceElement.textContent;
                                    const buyMatch = buyText.match(/GB Alış Fiyatı\s*:\s*(\d+(?:[.,]\d+)?)/);
                                    if (buyMatch) {
                                        buyPrice = parseFloat(buyMatch[1].replace(',', '.'));
                                    }
                                }
                                
                                console.log(`Parsed - Buy: ${buyPrice}, Sell: ${sellPrice}`);
                                
                                // Unit detection
                                let unitMultiplier = 1;
                                if (title.includes('10 m') || title.includes('10M')) {
                                    unitMultiplier = 10;
                                } else if (title.includes('1 M') || title.includes('1M')) {
                                    unitMultiplier = 1;
                                }
                                
                                // Use sell price as buy price if buy price not found
                                const finalBuyPrice = buyPrice || sellPrice;
                                
                                if (finalBuyPrice && ['ZERO', 'AGARTHA', 'PANDORA', 'FELIS', 'DRYADS', 'DESTAN', 'MINARK', 'OREADS'].includes(normalizedServer)) {
                                    const normalizedBuyPrice = parseFloat((finalBuyPrice / unitMultiplier).toFixed(4));
                                    const normalizedSellPrice = buyPrice ? parseFloat((buyPrice / unitMultiplier).toFixed(4)) : null;
                                    
                                    products.push({
                                        server: normalizedServer,
                                        buyPrice: normalizedBuyPrice,
                                        sellPrice: normalizedSellPrice, 
                                        unit: '1M',
                                        originalName: title,
                                        unitMultiplier: unitMultiplier,
                                        rawBuyPrice: finalBuyPrice,
                                        rawSellPrice: buyPrice
                                    });
                                    
                                    console.log(`✅ Ürün eklendi: ${normalizedServer} - ${normalizedBuyPrice}`);
                                }
                            }
                        }
                    } else {
                        console.log(`Section ${index} - Title element bulunamadı`);
                    }
                } catch (error) {
                    console.error(`Section ${index} processing error:`, error);
                }
            });
            
            console.log(`YeşilYurt Game - Toplam ${products.length} ürün işlendi`);
            return products;
        });

        return {
            site: 'yesilyurtgame',
            name: 'Yeşilyurt Game',
            products: data,
            status: 'success',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Yesilyurtgame scraping error:', error.message);
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

    async updateAllPrices() {
        if (this.isUpdating) {
            console.log('⚠️ Fiyat güncellemesi zaten devam ediyor...');
            return this.priceData;
        }

        this.isUpdating = true;
        console.log('🚀 Tüm sitelerden fiyat güncelleme başlatılıyor...');

        try {
            // Daha agresif retry ile
            const scrapers = [
                () => this.scrapeWithRetry(() => this.scrapeBynogame(), 'ByNoGame', 3),
                () => this.scrapeWithRetry(() => this.scrapeOyunfor(), 'OyunFor', 3), 
                () => this.scrapeWithRetry(() => this.scrapeKopazar(), 'Kopazar', 3),
                () => this.scrapeWithRetry(() => this.scrapeYesilyurtgame(), 'Yeşilyurt Game', 3),
                () => this.scrapeWithRetry(() => this.scrapeKlasgame(), 'KlasGame', 3)
            ];

            const results = await Promise.allSettled(scrapers.map(scraper => scraper()));
            this.priceData = {};
            
            let successCount = 0;
            let errorCount = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    this.priceData[data.site] = data;
                    
                    if (data.status === 'success') {
                        successCount++;
                        console.log(`✅ ${data.name}: ${data.products.length} ürün başarıyla alındı`);
                    } else {
                        errorCount++;
                        console.log(`❌ ${data.name}: Hata - ${data.error}`);
                    }
                } else {
                    errorCount++;
                    console.error(`💥 Scraper ${index} tamamen başarısız:`, result.reason?.message);
                }
            });

            this.lastUpdate = new Date().toISOString();
            console.log(`🎯 Fiyat güncelleme tamamlandı - Başarılı: ${successCount}, Hatalı: ${errorCount}`);
            
            return this.priceData;
        } catch (error) {
            console.error('💥 Fiyat güncelleme hatası:', error);
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