// Dependency-free debug hook for the FRP core.
//
// `@synx/debug` plugs in via `setDebugHook()`. With no hook installed (and in
// production builds) `debuggable()` is the identity function, so wrapped
// operators incur zero per-call cost. This keeps the core free of any
// dependency on the debug package (which itself depends on the core).

export interface DebugConstructEvent {
  /** Operator name, e.g. "map", "fold", "concat". */
  op: string;
  /** The node this operator produced (an Event or Reactive). */
  output: unknown;
  /** The raw arguments the operator was called with. */
  args: readonly unknown[];
}

export type DebugHook = (event: DebugConstructEvent) => void;

let hook: DebugHook | null = null;

export function setDebugHook(next: DebugHook | null): void {
  hook = next;
}

export function getDebugHook(): DebugHook | null {
  return hook;
}

// One-time dev check at module load. In production this is false, so
// `debuggable` returns the raw operator and adds no wrapper frame.
const DEBUG_ENABLED: boolean = (() => {
  const g = globalThis as { __SYNX_DEBUG__?: boolean };
  if (g.__SYNX_DEBUG__ === true) return true;

  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  if (!proc || proc.env == null) return false;

  const flag = proc.env.SYNX_DEBUG;
  if (flag === "1" || flag === "true") return true;
  return proc.env.NODE_ENV !== "production";
})();

/**
 * Wrap a node-producing operator so its construction is reported to the active
 * debug hook (if any). The wrapped function preserves the exact signature of
 * the original. In production / when debugging is disabled, returns the
 * original function unchanged.
 */
export function debuggable<F extends (...args: any[]) => any>(
  op: string,
  fn: F,
): F {
  if (!DEBUG_ENABLED) return fn;
  const wrapped = function (this: unknown, ...args: any[]) {
    const output = fn.apply(this, args);
    if (hook) hook({ op, output, args });
    return output;
  };
  return wrapped as F;
}
