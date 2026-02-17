/**
 * Development mode utilities for Synx DOM.
 * Provides runtime warnings and checks that are stripped in production builds.
 */

/**
 * Detects if the framework is running in development or debug mode.
 * Checks in order:
 * 1. __SYNX_DEBUG__ global flag
 * 2. SYNX_DEBUG environment variable
 * 3. NODE_ENV !== "production"
 */
const isDevOrDebugMode = (): boolean => {
  const globalScope = globalThis as { __SYNX_DEBUG__?: boolean };
  if (globalScope.__SYNX_DEBUG__ === true) return true;

  // Check environment variables (Node.js, bundlers)
  if (typeof process !== "undefined" && process.env) {
    const debug = process.env.SYNX_DEBUG;
    if (debug === "1" || debug === "true") return true;
    return process.env.NODE_ENV !== "production";
  }

  // Default to dev mode if we can't determine
  return true;
};

const isDev = isDevOrDebugMode();

/**
 * Logs a warning message in development mode only.
 * Automatically prefixed with [Synx].
 * No-op in production builds (can be tree-shaken by bundlers).
 *
 * @param message - The warning message to display
 */
export function warn(message: string): void {
  if (isDev) {
    console.warn(`[Synx] ${message}`);
  }
}

/**
 * Checks if we're running in development mode.
 * Useful for conditional dev-only code blocks.
 */
export function isDevMode(): boolean {
  return isDev;
}
