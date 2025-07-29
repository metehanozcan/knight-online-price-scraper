const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const scrapeQueue = new Queue('scrape', { connection });

module.exports = { scrapeQueue, connection };
