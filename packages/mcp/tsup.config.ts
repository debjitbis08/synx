import { defineConfig } from 'tsup';

// Note: building requires @modelcontextprotocol/sdk to be installed
// (server.ts / cli.ts depend on it).
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  // ESM-only: @modelcontextprotocol/sdk ships ESM-only subpath exports.
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
