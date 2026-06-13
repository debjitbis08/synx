import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";
import {
  createSession,
  registry,
  installTopologyHook,
  clearTopology,
  formatTrace,
  type TraceSession,
  type TraceEntry,
  type GraphTopology,
} from "@synx/debug";

export interface AssertResult {
  pass: boolean;
  expected: unknown;
  actual: unknown;
  history: unknown[];
  message: string;
}

export interface InjectResult {
  trace: string;
  entries: TraceEntry[];
}

/**
 * Transport-agnostic engine behind the MCP server. Loads a component module
 * (which labels its nodes), wraps it in a trace session, and drives
 * inject/assert/trace/graph operations. The MCP server (server.ts) is a thin
 * adapter over this; tests exercise it directly.
 */
export class SynxMcpCore {
  private session: TraceSession | null = null;

  constructor(private readonly projectRoot: string = process.cwd()) {}

  /**
   * Load a component by running an importer. Installs the topology hook first
   * so construction is recorded, then wraps the populated registry in a
   * session. The importer's side effect (executing the module) must label the
   * component's nodes.
   */
  async load(importer: () => Promise<unknown>): Promise<GraphTopology> {
    this.disposeSession();
    registry.clear();
    clearTopology();
    installTopologyHook();
    await importer();
    this.session = createSession({ useRegistry: true });
    return this.session.graph();
  }

  /** Load a component file resolved against the project root (CLI path). */
  loadFile(file: string): Promise<GraphTopology> {
    const abs = resolve(this.projectRoot, file);
    // Import via a relative *specifier* (not a file:// URL) so the active
    // resolver — e.g. tsx's tsconfig-path mapping — applies to the component's
    // own imports too. A file:// URL bypasses that and yields duplicate module
    // instances (a separate @synx/debug registry), so the graph comes up empty.
    const here = dirname(fileURLToPath(import.meta.url));
    let spec = relative(here, abs).split(sep).join("/");
    if (!spec.startsWith(".")) spec = `./${spec}`;
    // No cache-busting query: a `?query` suffix makes tsx stop treating the
    // file as TypeScript (and skip path mapping). Modules are therefore loaded
    // once per process — re-loading the same path returns the cached module.
    return this.load(() => import(/* @vite-ignore */ spec));
  }

  graph(): GraphTopology {
    return this.requireSession().graph();
  }

  graphText(): string {
    return this.requireSession().graphText();
  }

  inject(node: string, value: unknown): InjectResult {
    const session = this.requireSession();
    const before = session.trace().length;
    session.inject(node, value);
    const fresh = session.trace().slice(before);
    return { trace: formatTrace(fresh), entries: fresh };
  }

  history(node: string): { history: unknown[]; count: number } {
    const values = this.emitted(node);
    return { history: values, count: values.length };
  }

  assert(node: string, expected: unknown): AssertResult {
    const values = this.emitted(node);
    const pass = values.some((v) => deepEqual(v, expected));
    const actual = values.length > 0 ? values[values.length - 1] : undefined;
    const message = pass
      ? `PASS  ${node}`
      : `FAIL  ${node}\n` +
        `  Expected: ${fmt(expected)}\n` +
        `  Received: ${fmt(actual)}\n` +
        `  History:  [${values.map(fmt).join(", ")}]`;
    return { pass, expected, actual, history: values, message };
  }

  traceText(): string {
    return this.requireSession().traceText();
  }

  resetTrace(): string {
    this.requireSession().reset();
    return "Session reset";
  }

  private emitted(node: string): unknown[] {
    return this.requireSession()
      .trace()
      .filter((e) => e.nodeName === node && e.kind !== "inject")
      .map((e) => e.nextValue);
  }

  private requireSession(): TraceSession {
    if (!this.session) {
      throw new Error("No component loaded. Call synx_load first.");
    }
    return this.session;
  }

  private disposeSession(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }
}

function fmt(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
