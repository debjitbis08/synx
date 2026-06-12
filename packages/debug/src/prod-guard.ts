// Runtime safety net: @synx/debug is dev/test-only and must never ship to
// production. If the package is loaded with NODE_ENV=production, warn loudly so
// an accidental import is caught. Set globalThis.__SYNX_DEBUG_ALLOW_PROD__ to
// silence (e.g. for intentional production diagnostics).

function isProduction(): boolean {
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return proc?.env?.NODE_ENV === "production";
}

export function warnIfProduction(): void {
  const allow = (globalThis as { __SYNX_DEBUG_ALLOW_PROD__?: boolean })
    .__SYNX_DEBUG_ALLOW_PROD__;
  if (isProduction() && allow !== true) {
    console.warn(
      "[synx/debug] @synx/debug was loaded in a production build " +
        "(NODE_ENV=production). This package is dev/test-only and should not " +
        "ship to production. Remove the import, or set " +
        "globalThis.__SYNX_DEBUG_ALLOW_PROD__ = true to silence this warning.",
    );
  }
}
