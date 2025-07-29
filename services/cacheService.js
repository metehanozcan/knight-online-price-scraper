const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || '${{ Redis.REDIS_URL }}');

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
