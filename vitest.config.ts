import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'src/cli/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/cli/**/*.test.ts',
        // TUI modules with interactive terminal I/O (not unit testable)
        'src/lib/wtlink/main-menu.ts',
        'src/lib/wtlink/manage-manifest.ts',
        'src/lib/wtlink/link-configs.ts',
        // CLI entry points (yargs setup only, tested via e2e)
        'src/cli/wt.ts',
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
