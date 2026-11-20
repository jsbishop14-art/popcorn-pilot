import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 20000,
  },
});
