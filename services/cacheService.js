const Redis = require('ioredis');

let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// ✅ Railway IPv6 + IPv4 dual stack fix
if (!redisUrl.includes('family=')) {
  redisUrl += redisUrl.includes('?') ? '&family=0' : '?family=0';
}

// TLS desteği (Railway rediss:// ise güvenli bağlanır)
const redis = new Redis(redisUrl, {
  tls: redisUrl.startsWith('rediss://') ? {} : undefined
});

redis.on('connect', () => console.log('✅ Redis bağlandı:', redisUrl));
redis.on('error', (err) => console.error('❌ Redis hata:', err.message));

async function setPriceData(data) {
  await redis.set('price-data', JSON.stringify(data));
}

async function getPriceData() {
  const raw = await redis.get('price-data');
  if (!raw) {
    return { data: {}, lastUpdate: null, isUpdating: false };
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { data: {}, lastUpdate: null, isUpdating: false };
  }
}

module.exports = { setPriceData, getPriceData };
