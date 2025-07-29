const Redis = require('ioredis');

let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Railway IPv6 fix
if (!redisUrl.includes('family=')) {
  redisUrl += redisUrl.includes('?') ? '&family=0' : '?family=0';
}

const redis = new Redis(redisUrl, {
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => console.log('✅ Redis (Cache) bağlandı'));
redis.on('error', (err) => console.error('❌ Redis (Cache) hata:', err.message));

const CACHE_KEY = 'price-data';
const CACHE_TTL = 86400; // 24 saat

async function setPriceData(data) {
  try {
    const payload = {
      data: data.data || {},
      lastUpdate: data.lastUpdate || new Date().toISOString(),
      isUpdating: data.isUpdating || false,
      timestamp: Date.now()
    };
    
    await redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL);
    console.log('✅ Cache güncellendi');
    return true;
  } catch (error) {
    console.error('❌ Cache yazma hatası:', error);
    return false;
  }
}

async function getPriceData() {
  try {
    const raw = await redis.get(CACHE_KEY);
    
    if (!raw) {
      console.log('⚠️ Cache boş');
      return { 
        data: {}, 
        lastUpdate: null, 
        isUpdating: false 
      };
    }
    
    const parsed = JSON.parse(raw);
    console.log(`✅ Cache'den ${Object.keys(parsed.data).length} site verisi alındı`);
    return parsed;
  } catch (error) {
    console.error('❌ Cache okuma hatası:', error);
    return { 
      data: {}, 
      lastUpdate: null, 
      isUpdating: false 
    };
  }
}

async function setUpdating(flag = true) {
  try {
    const current = await getPriceData();
    current.isUpdating = flag;
    await redis.set(CACHE_KEY, JSON.stringify(current), 'EX', CACHE_TTL);
  } catch (error) {
    console.error('❌ Update flag hatası:', error);
  }
}

module.exports = { 
  setPriceData, 
  getPriceData, 
  setUpdating,
  redis 
};