# Synx Debugging & Testing Framework — Spec

> **Status: implemented.** All three layers below ship and are covered by tests. The
> dev-only `@synx/debug` package holds the runtime (spy, session, registry, topology,
> assertions, vitest matchers); `@synx/mcp` is the MCP server; a worked demo lives in
> `examples/mcp/`. The only deferred item is the optional JSDoc `@debug` transform. See
> [Implementation status](#implementation-status) at the end.

## Overview

A debugging and testing framework for the Synx FRP library, built as three layers that
stack from "zero ceremony" to "full AI-driven testing":

1. **Spy** — direct, registry-free recording of any event or reactive. The 80% case.
2. **Session** — named nodes with value injection, propagation traces, and assertions.
   Built on an explicit `label()` registry; no global magic, no build step.
3. **MCP server** — exposes a session as Model Context Protocol tools so an AI agent can
   load a component, inject values, read traces, and assert behavior interactively.

The runtime lives in the dev-only `@synx/debug` package and is stripped from production
builds (zero runtime cost in prod); the MCP server is a separate `@synx/mcp` package.

### Design principles

- **Explicit over magic.** Nodes are named by calling `label()` / `spy()` / `session`
  methods, not by a compile-time transform scanning comments. The framework works
  identically under `tsx`, `vite`, `vitest`, or any bundler, because it depends on no
  build pipeline.
- **No required global state.** A `session` is a value you create and dispose. Nothing
  leaks between tests by default.
- **Layered.** Each layer is usable on its own; higher layers compose the lower ones. Most
  tests never need more than `spy()`.
- **Names are explicit; edges are derived.** See "Names vs. edges" below — this distinction
  drives the whole design.

---

## Core concept: Names vs. edges

These are two separate problems with two different sources of truth.

**Names** (`"count"`, `"label"`) cannot be recovered from the runtime graph. At runtime a
node is just a `ReactiveImpl`/event object; the variable name from the source text is gone.
A human-readable name must be supplied explicitly via `label("count", node)` (or, later,
the optional JSDoc sugar). **Labeling is required to make a node visible to the session and
MCP layers.**

**Edges** (`count → label`) _and operation names_ are captured automatically at construction
time, for free, by an **operator-boundary hook** — the user never declares them. The FRP
operators are wrapped once at their public export boundary (`event.public.ts` /
`reactive.public.ts`) with `debuggable(op, fn)` from `@synx/frp/debug`. When an operator
runs, it reports to a hook installed by `@synx/debug`: "a `fold` was built, here is its
output node and its input nodes." `@synx/debug` records `output → { op, inputs }` keyed by
object identity (descending one level into array args like `mergeAll([a, b, c])`). Edge
recovery then walks, for each labeled node, from its recorded inputs up through any
*unlabeled* intermediates to the nearest labeled ancestors — so only your named surface
appears in the graph.

Key properties:

- **Uniform across all node-producing combinators** (`map`, `fold`, `concat`, `merge*`,
  `filter`, `tag`, `zip`, `snapshot`, `switch*`, `ap`, `chain`, …), not just `map`. Source
  constructors (`create`/`of`) and terminals (`subscribe`/`effect`) are not wrapped.
- **Zero cost in production.** `debuggable` is the identity function unless a DEV/debug flag
  is set, so wrapped operators add nothing in prod builds.
- **No dependency cycle.** The hook (`debuggable`/`setDebugHook`) lives in `@synx/frp` core;
  `@synx/debug` plugs into it via `setDebugHook`. Core never imports the debug package.

One-liner: **you always label for names; edges and op tags are captured for you.**

---

## Layer 1: Spy

Direct subscription-based recording. No registry, no names, no globals — just wrap a node
and read what it did.

```ts
import { spy } from "@synx/debug";

const countSpy = spy(count);     // count: Reactive<number>
const clickSpy = spy(clicks);    // clicks: Event<void>

emitInc();

countSpy.value;        // current value
countSpy.history;      // [0, 1] — initial value, then each change
countSpy.changeCount;  // 1

clickSpy.values;       // all emitted values
clickSpy.lastValue;    // most recent, or undefined
clickSpy.count;        // number of emissions
clickSpy.called;       // boolean

countSpy.reset();      // clear recorded history
countSpy.dispose();    // stop recording
```

API:

```ts
function spy<A>(target: Event<A>): EventSpy<A>;
function spy<A>(target: Reactive<A>): ReactiveSpy<A>;

interface EventSpy<A> {
  readonly values: ReadonlyArray<A>;
  readonly lastValue: A | undefined;
  readonly count: number;
  readonly called: boolean;
  reset(): void;
  dispose(): void;
}

interface ReactiveSpy<A> {
  readonly value: A;
  readonly history: ReadonlyArray<A>;  // starts with initial value
  readonly changeCount: number;        // excludes initial
  reset(): void;
  dispose(): void;
}
```

`spyEvent` / `spyReactive` are also exported for when the type is statically known.

---

## Layer 2: Session

Named-node testing: inject values into source events, watch the whole graph propagate,
assert on intermediate nodes, and print a human/AI-readable trace.

### Registration

A node becomes session-visible by being labeled. Two ways:

```ts
import { label, labelSource } from "@synx/debug";

// A derived node you want to observe (passthrough — returns target unchanged):
const count = label("count", E.fold(deltas, 0, (acc, d) => acc + d));

// A source event you want to inject into (needs its emitter):
const [clicks, emitClick] = E.create<void>();
labelSource("clicks", clicks, emitClick);
```

`label` registers into a global registry; `labelSource` additionally stores the emitter so
the session can push values in.

### Creating a session

```ts
import { createSession } from "@synx/debug";

// Option A: auto-load everything currently in the registry
const s = createSession({ useRegistry: true });

// Option B: register inline, no global registry
const s = createSession();
s.source("clicks", clicks, emitClick);  // injectable source
s.track("count", count);                // observed derived node
s.track("label", labelNode);
```

### Injecting, asserting, tracing

```ts
s.inject("clicks", undefined);

s.expect("count").toHaveLastEmitted(1);
s.expect("label").toHaveEmitted("Count: 1");

console.log(s.traceText());
s.reset();    // clear trace history, keep subscriptions and graph state
s.dispose();  // unsubscribe everything
```

API:

```ts
interface TraceSession {
  source<A>(name: string, event: Event<A>, emit: (value: A) => void): void;
  track<A>(name: string, target: Event<A> | Reactive<A>): void;
  inject(nodeName: string, value: unknown): void;
  expect(nodeName: string): NodeAssertion;
  trace(): TraceEntry[];
  traceText(): string;
  graph(): GraphTopology;   // node + edge topology of tracked nodes
  graphText(): string;      // rendered for orientation
  reset(): void;
  dispose(): void;
}

interface SessionOptions {
  useRegistry?: boolean;  // auto-load all currently-registered nodes
}

function createSession(opts?: SessionOptions): TraceSession;
```

### Assertions

Available both as session methods (`s.expect(name)`) and as vitest matchers.

```ts
interface NodeAssertion {
  toHaveEmitted(value: unknown): void;     // value appeared anywhere in emissions
  toNotHaveEmitted(): void;                // node never emitted
  toHaveHistory(values: unknown[]): void;  // full emission sequence matches
  toHaveLastEmitted(value: unknown): void; // most recent emission matches
}
```

All use deep equality on values.

### Vitest integration

```ts
import "@synx/debug/vitest";  // registers expect.extend matchers

expect(s).toHaveEmitted("count", 1);
expect(s).toHaveHistory("count", [1, 2, 1]);
expect(s).toHaveLastEmitted("label", "Count: 1");
```

Matchers delegate to the same assertion logic but produce proper vitest diffs on failure.

### Test lifecycle

`createSession()` holds no global state, so isolation is automatic when you register
inline. When using `{ useRegistry: true }`, clear the registry between tests:

```ts
import { registry } from "@synx/debug";
afterEach(() => registry.clear());
```

---

## Trace format

`traceText()` renders accumulated entries grouped by injection round, indented by
propagation depth, with operator tags:

```
inject: increment = null
  increment  emitted   null
    changes    emitted   1  [concat]
      count      updated   0 -> 1  [fold]
        label      updated   "Count: 0" -> "Count: 1"  [map]
```

Rules:

- One block per `inject()` call; the `inject:` header shows the source and value.
- Indentation = propagation depth, computed by BFS over the edge graph from the injected
  source (2 spaces per level).
- `emitted` for events, `updated` for reactives (with `old -> new`).
- Operator tag (`[fold]`) in brackets, from the topology hook's recorded operation.
- Unlabeled nodes are invisible.
- Degrades gracefully: if the topology hook was never installed, output is flat (no depth,
  no op tags).

---

## Graph topology

Topology is captured by the operator-boundary hook (see "Names vs. edges"). Two pieces:

- The **registry** maps each labeled name to a descriptor holding the live node object (and
  emitter for sources).
- The **construct map** (in `topology.ts`) records `node object → { op, inputs }` for every
  wrapped operator that ran while the hook was installed.

```ts
interface NodeDescriptor<A = unknown> {
  name: string;
  kind: "source" | "derived";
  target: Event<A> | Reactive<A>;     // the live node object
  emit?: (value: A) => void;          // present only for source nodes
}

interface GraphTopology {
  nodes: Array<{ name: string; operation: string; kind: string }>;
  edges: Array<{ from: string; to: string }>;
}
```

`session.graph()` builds `nodes` (operation pulled from the construct map; sources tagged
`"source"`, derived nodes falling back to `"derived"` if no topology was recorded) and
derives `edges` via `resolveEdges`, which walks each labeled node's recorded inputs up
through unlabeled intermediates to the nearest labeled ancestors. Edge resolution takes the
names from the *session's tracked nodes*, so it works whether you registered via `label()`
or inline `source()`/`track()`.

`graphText()` renders it for orientation (real output, from `examples/mcp/`):

```
Nodes (8):
  emailInput     [source]
  passwordInput  [source]
  email          [stepper]  <- emailInput
  password       [stepper]  <- passwordInput
  emailValid     [map]  <- email
  passwordValid  [map]  <- password
  formValid      [ap]  <- passwordValid, emailValid
  status         [map]  <- formValid

Edges: emailInput->email, passwordInput->password, email->emailValid,
       password->passwordValid, passwordValid->formValid,
       emailValid->formValid, formValid->status
```

Topology helpers — `installTopologyHook()`, `clearTopology()`, `operationOf()`,
`resolveEdges()`, `resolveNamedEdges()`, `formatGraph()` — are exported from `@synx/debug`.

---

## Layer 3: MCP server

Package `@synx/mcp` (binary `synx-mcp`, ESM-only). A sidecar process that wraps a session
and exposes it as MCP tools, enabling an AI agent (e.g. Claude Code) to develop and test
components interactively.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "synx": { "command": "npx", "args": ["synx-mcp", "--project", "."] }
  }
}
```

The server executes component files with the project's TS runtime (`tsx`). A file must
instantiate its component at the top level (and `label` its nodes) so the registry is
populated on load. See `examples/mcp/` for a worked component + walkthrough.

### Architecture

- **`SynxMcpCore`** (SDK-free) drives a session: `load()` installs the topology hook, runs
  the component module, and wraps the populated registry in a session; then
  `graph`/`inject`/`assert`/`history`/`trace`/`reset`. `loadFile()` imports via a relative
  specifier (not a `file://` URL — that bypasses TS path mapping under `tsx` and would
  duplicate the registry).
- **`server.ts`** is a thin `@modelcontextprotocol/sdk` stdio adapter over the core;
  `createServer()` (handler registration) is split from `startServer()` (stdio connect) so
  it is testable in-process. Tool errors are returned as `isError` results, not crashes.
- Tested two ways: SDK-free core tests, and an **in-memory integration test** driving a real
  SDK `Client ↔ Server` over a linked transport pair.

### Tools

| Tool | Input | Output |
|------|-------|--------|
| `synx_load` | `{ file }` | executes the file, returns `Loaded …` + the graph |
| `synx_graph` | `{}` | current graph as text |
| `synx_inject` | `{ node, value }` | resulting propagation trace |
| `synx_assert` | `{ node, expected }` | `PASS`/`FAIL` with emission history |
| `synx_history` | `{ node }` | `{ history, count }` |
| `synx_trace` | `{}` | full accumulated trace text |
| `synx_reset` | `{}` | clears trace history (keeps graph loaded) |

Example `synx_inject` output:

```
inject: emailInput = "a@b.com"
  emailInput  emitted   "a@b.com"
    email       updated   "" -> "a@b.com"  [stepper]
      emailValid  updated   false -> true  [map]
        formValid   updated   false -> false  [ap]
          status      updated   "fill in the form" -> "fill in the form"  [map]
```

Example `synx_assert` failure:

```
FAIL  count
  Expected: 10
  Received: 11
  History:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
```

---

## Optional sugar: JSDoc `@debug` transform

A later, optional convenience that removes hand-written `label()` calls by reading the
variable name at compile time. It is **sugar over `label()`**, never the load-bearing
mechanism — the framework works fully without it.

```ts
/** @debug count */
const count = E.fold(deltas, 0, (acc, d) => acc + d);
```

A dev-only tsup/esbuild plugin finds a `@debug <name>` JSDoc immediately preceding a
`const` whose RHS is an FRP operator call, and rewrites it to the equivalent `label()`
registration. Because it only auto-supplies the name the user would otherwise pass to
`label()`, nodes named this way behave identically to explicitly-labeled ones. Not applied
in production builds.

This is deferred until manual labeling proves painful in practice.

---

## Production safety

`@synx/debug` must never load in production application code. Two safeguards:

- **Runtime guard.** Importing `@synx/debug` calls `warnIfProduction()`, which logs a loud
  warning when loaded with `NODE_ENV === "production"`. Silence with
  `globalThis.__SYNX_DEBUG_ALLOW_PROD__ = true`.
- **Import lint.** `scripts/check-no-debug-imports.mjs` (run via `pnpm check:debug`) fails
  if `@synx/debug` is imported from production source — anything outside `*.test`/`*.spec`/
  `*.debug` files, the `@synx/debug` and `@synx/mcp` packages, `test/`, `scripts/`, and
  config. Dependency-free, since the repo has no ESLint/Biome to host a rule.
- The core hook (`debuggable`) is the identity function in production, so the wrapped
  operators incur no cost when the debug package is absent.

---

## Implementation status

Done:

- **Spy** — `spy` / `spyEvent` / `spyReactive`.
- **Session** — `createSession`, `label` / `labelSource`, registry, `inject`, `expect`,
  `trace` / `traceText`, `graph` / `graphText`, `reset` / `dispose`.
- **Assertions** — `NodeAssertion` methods + `@synx/debug/vitest` `expect.extend` matchers.
- **Topology** — operator-boundary `debuggable` hook in `@synx/frp/debug`; wrapped combinators
  in `event.public.ts` / `reactive.public.ts`; construct map + `resolveEdges`; depth- and
  op-tagged trace rendering.
- **MCP server** — `@synx/mcp` with all seven `synx_*` tools, `SynxMcpCore`, stdio adapter,
  SDK-free + in-memory integration tests.
- **Example** — `examples/mcp/` (branching sign-up form, README walkthrough, `.mcp.json`).
- **Production safety** — runtime guard + `pnpm check:debug` import lint.
- **Packaging** — all `@synx/*` packages are `type: module` with build extensions matching
  their `exports`; `@synx/frp/debug` and `@synx/dom/tags` are exported.

Deferred:

- **JSDoc `@debug` transform** (see "Optional sugar" above). Optional sugar over `label()`,
  not built — manual labeling has not proven painful enough to justify a compile-time
  transform.

Known caveat:

- Launching the raw stdio binary against a `.ts` component *inside this monorepo* is subject
  to src-vs-dist resolution (tsconfig paths vs `node_modules`). A normally-installed project
  resolves `@synx/*` consistently, so this is a dev-environment artifact, not a server bug;
  the server is verified via the in-memory integration test and the example-driven core
  tests.
