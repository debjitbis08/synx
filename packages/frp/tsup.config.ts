import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    event: 'src/event.public.ts',
    reactive: 'src/reactive.public.ts',
    batch: 'src/batch.public.ts',
    lift: 'src/lift.public.ts',
    fix: 'src/fix.public.ts',
    'utils/event': 'src/utils/event.ts',
    'utils/reactive': 'src/utils/reactive.ts',
    'cli/graph': 'src/cli/graph.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});