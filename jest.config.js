module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/?(spec|test).[jt]s?(x)',
    '**/?(*.)(spec|test).[jt]s?(x)',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^\\./makeDispatcher$': '<rootDir>/test/node-sqlite/makeDispatcher.ts',
  },
  restoreMocks: true,
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { plugins: ['@babel/plugin-transform-strict-mode'] }, // RN preset emits sloppy-mode modules
    ],
  },
  modulePathIgnorePatterns: ['<rootDir>/lib', '<rootDir>/example'],
}
