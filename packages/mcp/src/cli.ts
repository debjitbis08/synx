#!/usr/bin/env node
import { startServer } from "./server";

function parseProjectRoot(argv: string[]): string {
  const i = argv.indexOf("--project");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.cwd();
}

startServer(parseProjectRoot(process.argv.slice(2))).catch((error) => {
  console.error("[synx-mcp] failed to start:", error);
  process.exit(1);
});
