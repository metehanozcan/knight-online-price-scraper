const assert = require('assert');
const scrapingService = require('../services/scrapingService');
const data = require('./sampleData');

async function testGetBestPrices() {
  const result = scrapingService.getBestPrices(data.data);
  assert(result.Zero.best.site === 'kopazar', 'Zero best site should be kopazar');
  assert(result.Zero.best.price === 284, 'Zero best price should be 284');
  assert(result.Felis.best.site === 'oyunfor', 'Felis best site should be oyunfor');
  assert(result.Destan.best.price === 374, 'Destan best price should be 374');
  console.log('✓ getBestPrices');
}

module.exports = { testGetBestPrices };
