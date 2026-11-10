const base = require('../../jest.config')
module.exports = {
  ...base,
  rootDir: '../..',
  roots: ['<rootDir>/test/bench'],
  testMatch: ['**/*.bench.ts'],
  testTimeout: 600000,
}
