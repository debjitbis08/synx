import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@synx/frp': resolve(__dirname, 'packages/frp/src'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    reporters: 'default',
  },
});
