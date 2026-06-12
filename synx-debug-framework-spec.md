# Synx Debugging & Testing Framework — Spec & Plan

## Overview

A debugging and testing framework for the Synx FRP library, built as three layers that
stack from "zero ceremony" to "full AI-driven testing":

1. **Spy** — direct, registry-free recording of any event or reactive. The 80% case.
2. **Session** — named nodes with value injection, propagation traces, and assertions.
   Built on an explicit `label()` registry; no global magic, no build step.
3. **MCP server** — exposes a session as Model Context Protocol tools so an AI agent can
   load a component, inject values, read traces, and assert behavior interactively.

Everything lives in the dev-only `@synx/debug` package and is stripped from production
builds. Zero runtime cost in prod.

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

**Edges** (`count → label`) _can_ be recovered structurally, for free, once nodes are
labeled. The FRP core already stores upstream links — a map-derived reactive holds
`mapDerivation.source`, an object pointer to its parent (`packages/frp/src/reactive.ts`).
Given a registry that maps node-object → name, edge recovery is: for each labeled node,
walk its upstream `source` pointers until reaching another labeled node, then emit an edge
between their names. The user labels nodes but **never declares how they connect**.

Caveat: structural upstream links exist cleanly for `map` derivations. `fold`, `merge`,
`switch`, and event combinators track upstream differently (some keep only downstream
subscribers). Edge recovery covers those as the core exposes their links, with an optional
explicit-inputs fallback on `label()` for operators that don't yet.

One-liner: **you always label for names; you rarely declare edges.**

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
  graph(): GraphTopology;   // planned — see Graph topology
  graphText(): string;      // planned
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
inject: clicks = "click"
  deltas        emitted   1                         [E.map]
    count       updated   0 → 1                     [E.fold]
      label     updated   "Count: 0" → "Count: 1"   [R.map]
```

Rules:

- One block per `inject()` call; the `inject:` header shows the source and value.
- Indentation = propagation depth, computed by walking upstream `source` links from each
  node back toward the injected source (2 spaces per level).
- `emitted` for events, `updated` for reactives (with `old → new`).
- Operator tag (`[E.fold]`) in brackets, from the registry's `operation` field.
- Unlabeled nodes are invisible.

---

## Graph topology

The registry maps each labeled node to a descriptor and supports object → name lookup so
edges can be derived structurally.

```ts
interface NodeDescriptor<A = unknown> {
  name: string;
  kind: "source" | "derived";
  operation: string;                  // "fold", "map", "stepper", … (best-effort)
  target: Event<A> | Reactive<A>;     // the live node object
  emit?: (value: A) => void;          // present only for source nodes
}

interface GraphTopology {
  nodes: Array<{ name: string; operation: string; kind: string }>;
  edges: Array<{ from: string; to: string }>;
}
```

`session.graph()` builds `edges` by walking each labeled node's upstream `source` pointers
(`mapDerivation.source` and equivalents) until it reaches another labeled node. Operators
that don't expose upstream links yet can supply inputs explicitly:

```ts
label("count", node, { inputs: ["deltas"] });  // explicit-edges fallback
```

`graphText()` renders it for orientation:

```
Nodes (4):
  clicks   [source]
  deltas   [E.map]   ← clicks
  count    [E.fold]  ← deltas
  label    [R.map]   ← count

Edges: clicks→deltas, deltas→count, count→label
```

---

## Layer 3: MCP server

Package `@synx/mcp` (binary `synx-mcp`). A sidecar process that wraps a session and
exposes it as MCP tools, enabling an AI agent (e.g. Claude Code) to develop and test
components interactively.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "synx": { "command": "npx", "args": ["synx-mcp", "--project", "."] }
  }
}
```

The server executes component files with `tsx`. A file must instantiate its component at
the top level (and `label` its nodes) so the registry is populated on load.

### Tools

| Tool | Input | Output |
|------|-------|--------|
| `synx_load` | `{ file }` | graph topology + summary (executes the file, populates registry) |
| `synx_graph` | `{}` | current graph as text |
| `synx_inject` | `{ node, value }` | resulting trace text + entries |
| `synx_assert` | `{ node, expected }` | `{ pass, actual, expected, message }` |
| `synx_history` | `{ node }` | `{ history, count }` |
| `synx_trace` | `{}` | full accumulated trace text |
| `synx_reset` | `{}` | clears trace history (keeps graph loaded) |

Example `synx_inject` output:

```
inject: clicks = "click"
  deltas   emitted  1       [E.map]
  count    updated  0 → 1   [E.fold]
  label    updated  "Count: 0" → "Count: 1"  [R.map]
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

`@synx/debug` must never load in production application code:

- The package warns (or throws) if imported when `NODE_ENV === "production"`.
- A lint rule forbids importing `@synx/debug` outside test files and dev entry points.
- All `label()`/`spy()`/session calls are dev-only; with the package absent, `label()` is
  a passthrough and incurs no cost.

---

## Implementation order

Built bottom-up — each step is independently useful and unblocks the next.

1. **Polish the runtime core.**
   - Trace format: add depth indentation (walk upstream `source` links) and operator tags.
   - Ship `@synx/debug/vitest` matchers so failures get real diffs.
   - Add the `NODE_ENV === "production"` guard / warning.

2. **Runnable example.** `examples/frp/counter.debug.ts` + a session-style test, so the API
   is documented outside the package's own test suite and the ergonomics get exercised.

3. **Registry → graph topology.** Add `operation` and object → name lookup; derive edges
   by walking upstream `source` pointers, with an explicit-inputs fallback on `label()`.
   Add `session.graph()` / `graphText()`. (Unblocks the MCP server.)

4. **MCP server.** Start with `synx_load`, `synx_inject`, `synx_assert`, `synx_trace`,
   `synx_reset`; add `synx_graph` / `synx_history` once topology lands.

5. **JSDoc `@debug` transform.** Last, and only if manual labeling proves painful. Build it
   as pure sugar over the existing `label()` registration.
