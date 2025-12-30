import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        // Highly interactive CLI modules - tested via e2e tests
        'src/lib/wtlink/main-menu.ts',
        'src/lib/wtlink/manage-manifest.ts',
        'src/lib/wtlink/link-configs.ts',
        'src/lib/wtlink/index.ts',
        'src/lib/prompts.ts',
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
