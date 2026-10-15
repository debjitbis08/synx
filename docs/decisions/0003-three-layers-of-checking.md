# 0003 — Three layers of checking: scenarios, invariants, reference model

**Status:** Accepted · 2026-10-15

## Context

Example-based acceptance tests only check the cases someone wrote down. With
agents writing code, bugs concentrate in the paths nobody wrote an example for.
Separately, the optimized core (`event.ts`, `reactive.ts`, `batch.ts`) has
real correctness defects — see `packages/frp/CORE-REVIEW.md`, e.g. F1, a
subscriber skipped when another unsubscribes mid-dispatch — and full formal
verification is not practical in TypeScript.

## Decision

Correctness is checked in three layers:

1. **Scenarios** say what the app should do ([0002](0002-event-trace-as-specification.md)).
2. **Invariants** say what must never happen. They attach to nodes
   (`invariant(todos, ts => ids unique)`) and are checked against randomly
   generated event sequences (property-based, e.g. fast-check), with failures
   shrunk to a minimal trace. Invariants are dev/test-only and removed from
   production builds.
3. **A reference model** keeps the engine honest. A small, deliberately naive
   interpreter of Synx semantics (no batching, no fast paths) is the executable
   spec. Differential tests run random graphs and event sequences through both
   it and the optimized core and require identical emission histories.

Propagation semantics are written down and encoded in the reference model:
glitch-free topological propagation, atomic batches, a defined order for
simultaneous events. Operator laws (map fusion, merge associativity, fold over
concatenated sequences) are property tests.

## Consequences

- The core may use any optimization (dispatch fast paths, fusion, template
  cloning); divergence from the reference model is caught automatically.
- Performance is guarded alongside correctness: existing TRIPWIRE tests and
  benchmarks run in CI so a fix that slows the core is noticed.
- Uncovered nodes (no scenario or invariant touches them) are reported, so
  reviewers can see where the checking is thin.
