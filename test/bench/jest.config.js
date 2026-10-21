const base = require('../../jest.config')
module.exports = {
  ...base,
  rootDir: '../..',
  roots: ['<rootDir>/test/bench'],
  testMatch: ['**/*.bench.ts'],
  moduleNameMapper: {}, // each adapter's makeDispatcher is jest.mock'ed in the bench file
  testTimeout: 600000,
}
