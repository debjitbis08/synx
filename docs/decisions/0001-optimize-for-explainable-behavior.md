# 0001 — Optimize for explainable behavior

**Status:** Accepted · 2026-10-15

## Context

Synx will not out-compete React, Solid or Svelte on syntax, component
ergonomics or ecosystem breadth. What it has that they lack is an explicit FRP
model (UI is a fold over events) plus an inspectable execution graph
(`@synx/debug` topology and traces, exposed to agents by `@synx/mcp`).

An external source review (2026-10-15) identified the graph + verification
model as Synx's most defensible direction.

## Decision

Synx's primary optimization target is that a program's behavior can be
**interrogated, tested and verified** by humans and agents: what does it do,
what changed, and did a change preserve the intended behavior.

When choosing between work items, deepening the graph, execution and
verification model wins over broadening the UI feature set.

## Consequences

- Features that make behavior observable or checkable (traces, scenarios,
  invariants, graph diffs) are prioritized over new UI conveniences.
- The runtime stays free of AI dependencies; agent tooling is dev/test-only.
- Raw rendering performance remains a requirement, not the headline: it is
  protected by benchmarks and tripwire tests (see [0003](0003-three-layers-of-checking.md)).
