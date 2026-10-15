# Synx Roadmap

Synx optimizes for **behavior that can be interrogated, tested and verified**
by humans and agents ([ADR 0001](docs/decisions/0001-optimize-for-explainable-behavior.md)).
The verification track below takes priority over broadening the UI feature
set. Rationale for each item lives in [docs/decisions](docs/decisions/README.md).

**Status:** ✅ done · 🟡 partial · ⬜ not started

---

## Verification track (priority order)

### V1 — Make the existing agent loop trustworthy

Small fixes; prerequisite for everything after.

- ⬜ Reactive errors go to an error channel recorded in traces; test helpers fail on unexpected errors — [0005](docs/decisions/0005-errors-are-trace-entries.md)
- ⬜ `synx_load` re-executes the current source into a fresh graph (today a second load of the same file returns an empty graph) — [0006](docs/decisions/0006-agent-tooling-contract.md)
- ⬜ Split `synx_assert` into `everEmitted` / `currentEquals` / `lastEmitted` / `historyEquals` — [0006](docs/decisions/0006-agent-tooling-contract.md)
- ⬜ `synx_graph` / `synx_load` return structured JSON (`GraphTopology`) alongside text — [0006](docs/decisions/0006-agent-tooling-contract.md)
- ⬜ Fix core review findings ([CORE-REVIEW.md](packages/frp/CORE-REVIEW.md)):
  - ⬜ F1 — dispatch skips a subscriber on mid-dispatch unsubscribe (HIGH)
  - ⬜ F2 — throwaway `ReactiveImpl` allocated per late subscribe
  - ⬜ F3 — O(n²) `onFirstEmit` teardown (HIGH)
  - ⬜ F4 — `R.map` has no multicast
  - ⬜ F5 — dead `mapDerivation.teardown`
  - ⬜ F6 — `E.stepper` creates live duplicate reactives
  - ⬜ F7 — `R.cleanup` does not cascade to owned `.changes`

### V2 — Reference model and differential testing

Protects the optimized core from here on — [0003](docs/decisions/0003-three-layers-of-checking.md)

- ⬜ Write down propagation semantics (glitch-freedom, batch atomicity, simultaneous-event order)
- ⬜ Naive reference interpreter of those semantics
- ⬜ Differential property tests: random graphs + event sequences, optimized core vs reference
- ⬜ Operator laws as property tests (map fusion, merge associativity, fold over concatenation)
- 🟡 Perf tripwires and benchmarks in CI (tripwire tests exist; CI wiring not yet)

### V3 — Scenarios: executable acceptance specs

[0002](docs/decisions/0002-event-trace-as-specification.md)

- ⬜ Typed labels (labeled sources carry payload types)
- ⬜ `scenario({ given, when, then })` runnable by vitest and by MCP
- ⬜ Tool input schemas derived from label types
- ⬜ Rewrite TodoMVC and the MCP sign-up example spec as scenarios

### V4 — Invariants and generated event sequences

[0003](docs/decisions/0003-three-layers-of-checking.md)

- ⬜ `invariant(node(s), predicate, name)` — dev/test only, stripped in production
- ⬜ Generate event sequences from labeled source types (fast-check), shrink failures to minimal traces
- ⬜ Coverage report: nodes not touched by any scenario or invariant

### V5 — Determinism and replay

[0004](docs/decisions/0004-effects-at-the-edges.md)

- ⬜ Injectable scheduler/clock; virtual time for `delay`, timeouts, async
- ⬜ Effects as data at the boundary (align `@synx/async`, `@synx/router`)
- ⬜ Actions-as-tagged-data pattern documented; TodoMVC migrated off closures
- ⬜ Record sessions as traces (incl. effect results); replay deterministically; promote a trace to a scenario

### V6 — Review tooling

[0006](docs/decisions/0006-agent-tooling-contract.md)

- ⬜ `synx diff <base>..<head>`: topology diff + behavior diff (nodes whose histories changed across scenarios/traces, first divergence)
- ⬜ Post `synx diff` output as a PR comment
- ⬜ `synx_explain <node>`: upstream sources, operator chain, current value, recent emissions, covering scenarios

### V7 — Component construction contract

[0007](docs/decisions/0007-structurally-pure-components.md)

- ⬜ Document: structure must not depend on prop values; no side effects during construction
- ⬜ Dev-mode check: structure vs bind phase binding count/ids must match, else throw with component name

### V8 — Measure the agent advantage

- ⬜ Benchmark: Synx with MCP tools vs Synx with source access only, ~10 propagation/lifecycle bug-fix tasks; measure success, regressions, repair iterations, tokens
- ⬜ If V8 shows value, consider a cross-framework comparison

---

## Feature track (by abstraction level)

Carried over from the original roadmap; status reflects the repository as of
2026-10-15.

### Level 0: Core FRP (`@synx/frp`) — Alpine alternative

1. ⬜ CDN distribution — script-tag usage without build tools
2. ⬜ Minimal bundle size — core under 5 kB (unmeasured)
3. ⬜ Global API — `window.Synx.event.create()` for script tags
4. ⬜ Simple docs — "Add reactivity to HTML in 5 minutes"
5. 🟡 Performance — optimized; see CORE-REVIEW F2–F4 and V2 tripwires

### Level 1: DOM bindings (`@synx/dom`)

6. 🟡 DOM helper utilities — `bind`, `on`, `value`, `visibility`, `storage`; more wanted
7. 🟡 Lifecycle helpers — `lifecycle.ts`; cleanup contract issues in CORE-REVIEW F7
8. ⬜ Common patterns library — toggles, accordions, tabs as event patterns

### Level 2: Components — React alternative (lite)

9. ✅ JSX/TSX support — `@synx/jsx`
10. 🟡 Component DevTools — graph/trace via `@synx/debug` + `@synx/mcp`; no visual/browser tool yet
    - ⬜ Event network visualizer
    - ⬜ Props/outputs inspector
    - 🟡 Event flow tracer (trace sessions)
11. ✅ Routing as event streams — `@synx/router`

### Level 3: Full-stack

12. ⬜ Server-side rendering — graph on server, state serialization, rehydration, streaming
13. ⬜ Build tooling — Vite plugin, static graph analysis, code splitting by subgraph, subscription-preserving HMR
14. 🟡 Async data patterns — `@synx/async` (`fromPromise`, `resource`, `retry`, `timeout`); caching strategies ⬜
15. 🟡 Testing framework — `@synx/debug` (spies, sessions, vitest integration); superseded in scope by V3–V5

### Cross-cutting

16. 🟡 Event network visualization — text graph + MCP; browser extension, live animation, DOM→network ⬜; leak detection ⬜
17. ⬜ Time-travel debugging — now V5 (record/replay)
18. 🟡 Error handling — error channel is V1; `retry` exists in `@synx/async`; `catchError` and production reporting hooks ⬜
19. ⬜ Documentation — level guide, Alpine/React-style examples, migration guides, API reference, cookbook
20. ⬜ Performance monitoring — graph metrics, subscription overhead, leak detection, bundle size tracking
21. ⬜ Forms helpers — input → validation → state patterns
22. ⬜ Animation/transitions — frames as events, FLIP, springs, CSS transitions

### Ecosystem

23. ⬜ CLI & scaffolding — `create-synx-app` (minimal / SPA / full-stack), generators
24. 🟡 Package structure — exists: `frp`, `dom`, `jsx`, `router`, `async`, `debug`, `mcp`, `dsl`, `icon`; planned: `ssr`, `devtools`
25. ⬜ Meta/SEO — reactive `<head>`, SSR integration
26. ⬜ Accessibility — focus management, ARIA bindings, keyboard patterns, announcements
27. ⬜ i18n (optional) — reactive translations, locale switching, pluralization

---

## Phases

| Phase | Focus | Status |
| ----- | ----- | ------ |
| 1 | JSX | ✅ |
| 2 | Event network visibility (debug, MCP) | 🟡 — continues as V1, V6 |
| **3** | **Verification track V1–V5** | **⬜ current** |
| 4 | Review tooling and contracts (V6, V7), agent benchmark (V8) | ⬜ |
| 5 | Full-stack essentials (SSR, Vite plugin) | ⬜ |
| 6 | Polish & ecosystem (CLI, docs site, migration guides, perf monitoring) | ⬜ |
