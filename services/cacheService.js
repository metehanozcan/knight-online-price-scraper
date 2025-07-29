const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function setPriceData(data) {
  const payload = {
    data,
    lastUpdate: Date.now(),
    isUpdating: false,
  };
  await redis.set('price-data', JSON.stringify(payload));
}

async function getPriceData() {
  const raw = await redis.get('price-data');
  if (!raw) {
    return { data: {}, lastUpdate: null, isUpdating: false };
  }
  return JSON.parse(raw);
}

async function setUpdating(flag = true) {
  const current = await getPriceData();
  current.isUpdating = flag;
  await redis.set('price-data', JSON.stringify(current));
}

module.exports = { setPriceData, getPriceData, setUpdating };
