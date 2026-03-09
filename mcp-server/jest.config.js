/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 95,
      functions: 99,
      lines: 99,
    },
  },
};
