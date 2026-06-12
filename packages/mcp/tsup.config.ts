import { defineConfig } from 'tsup';

// Note: building requires @modelcontextprotocol/sdk to be installed
// (server.ts / cli.ts depend on it).
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
