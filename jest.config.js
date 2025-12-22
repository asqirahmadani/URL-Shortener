module.exports = {
  // Use ts-jest preset for TypeScript
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directory
  rootDir: '.',

  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'ts'],

  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/unit/**/*.spec.ts',
    '<rootDir>/test/integration/**/*.spec.ts',
    '<rootDir>/test/e2e/**/*.spec.ts',
  ],

  // Transform TypeScript files
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },

  // Module path aliases (match tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
  },

  // Collect coverage
  collectCoverage: true,

  // Coverage collection patterns
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude non-logic files
    '!src/**/*.dto.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.module.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.decorator.ts',
    '!src/**/*.guard.ts',
    '!src/**/*.filter.ts',
    '!src/**/*.interceptor.ts',
    '!src/**/*.pipe.ts',
    '!src/**/*.strategy.ts',
    '!src/**/*.config.ts',
    '!src/**/*.constant.ts',
    '!src/**/*.enum.ts',
    '!src/**/*.type.ts',
    '!src/**/*.exception.ts',
    '!src/**/*.validation.ts',
    '!src/**/index.ts',
    '!src/app.controller.ts',
    '!src/app.service.ts',
    '!src/main.ts',
    // Exclude migration files
    '!src/**/migrations/**',
    '!src/**/*.migration.ts',
  ],

  // Coverage thresholds - enforce quality gates
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
    // Per-file thresholds for critical services
    './src/modules/auth/auth.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/modules/url/url.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },

  // Coverage reporters
  coverageReporters: [
    'text', // Console output
    'text-summary', // Summary in console
    'html', // HTML report for browsers
    'lcov', // For CI/CD tools (SonarQube, Codecov)
    'json', // JSON for programmatic access
    'cobertura', // XML format for Jenkins
  ],

  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',

  // Path patterns to ignore
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/test/', '/.git/'],

  // Setup files
  // setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

  // Test timeout (in milliseconds)
  testTimeout: 30000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Max workers for parallel execution
  maxWorkers: '50%',

  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',

  // Fail on console errors/warnings (optional - uncomment if desired)
  // errorOnDeprecated: true,

  // Global teardown
  // globalTeardown: '<rootDir>/test/teardown.ts',
};
