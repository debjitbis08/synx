import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@synx/frp': resolve(__dirname, 'packages/frp/src'),
      '@synx/frp/reactive': resolve(__dirname, 'packages/frp/src/reactive.public.ts'),
      '@synx/frp/event': resolve(__dirname, 'packages/frp/src/event.public.ts'),
      '@synx/frp/batch': resolve(__dirname, 'packages/frp/src/batch.public.ts'),
      '@synx/frp/lift': resolve(__dirname, 'packages/frp/src/lift.public.ts'),
      '@synx/dom': resolve(__dirname, 'packages/dom/src'),
      '@synx/dsl': resolve(__dirname, 'packages/dsl/src'),
      '@synx/icon': resolve(__dirname, 'packages/icon/src'),
      '@synx/icon/components': resolve(__dirname, 'packages/icon/src/components/index.ts'),
      '@synx/jsx': resolve(__dirname, 'packages/jsx/src'),
      '@synx/jsx/jsx-runtime': resolve(__dirname, 'packages/jsx/src/jsx-runtime.ts'),
      '@synx/jsx/jsx-dev-runtime': resolve(__dirname, 'packages/jsx/src/jsx-dev-runtime.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    reporters: 'default',
  },
});
