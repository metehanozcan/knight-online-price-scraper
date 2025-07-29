const { Queue } = require('bullmq');
const Redis = require('ioredis');

let redisUrl = process.env.REDIS_URL || '${{ Redis.REDIS_URL }}';

// ✅ Railway IPv6 fix
if (!redisUrl.includes('family=')) {
  redisUrl += redisUrl.includes('?') ? '&family=0' : '?family=0';
}

const connection = new Redis(redisUrl, {
  tls: redisUrl.startsWith('rediss://') ? {} : undefined
});

connection.on('connect', () => console.log('✅ Redis (BullMQ) bağlandı:', redisUrl));
connection.on('error', (err) => console.error('❌ Redis (BullMQ) hata:', err.message));

const scrapeQueue = new Queue('scrape', { connection });

module.exports = { scrapeQueue, connection };
