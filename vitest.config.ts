import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // JUnit XML reporter for Codecov Test Analytics
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'src/cli/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/cli/**/*.test.ts',
        // Type-only files (no runtime code)
        'src/lib/**/types.ts',
        'src/lib/**/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
