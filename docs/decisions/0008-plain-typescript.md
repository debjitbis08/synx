# 0008 — Plain TypeScript; no DSL or compiler for semantics

**Status:** Accepted · 2026-10-15

## Context

The source review proposed `E.command({ name, input: Schema, update })` so the
graph knows what an operation *means*. More generally, AI-oriented frameworks
are tempted to add a DSL or compiler transform to make semantics analyzable.

## Decision

Synx stays plain TypeScript with no mandatory special syntax or compiler step.
Meaning comes from conventions TypeScript already expresses:

- typed labels ([0002](0002-event-trace-as-specification.md)),
- actions as tagged data ([0004](0004-effects-at-the-edges.md)),
- invariants and scenarios as ordinary function calls ([0003](0003-three-layers-of-checking.md)).

A `command` wrapper is **deferred**, not rejected: revisit it if tagged
actions plus typed labels turn out to be insufficient for agents in practice.

## Consequences

- Existing tooling, editor support and model familiarity with TypeScript are
  kept.
- Static analysis stays partial (callbacks are arbitrary JS); runtime traces,
  invariants and the reference model compensate.
- Layered adoption (`@synx/frp` alone, + DOM, + components) is unaffected.
