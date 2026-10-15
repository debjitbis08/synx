# 0007 — Component factories must be structurally pure

**Status:** Accepted · 2026-10-15

## Context

`packages/dom/src/component/define.ts` builds a template once per component
definition (structure phase, using the first instance's initial prop values),
then calls the factory again in bind mode for every instance. Two hazards
follow:

- If DOM structure depends on a prop, later instances get the first
  instance's structure.
- Non-DOM side effects in the factory (fetch, timers, logging) run twice for
  the first instance.

These rules were implicit. Valid-looking TypeScript can violate them.

## Decision

The contract is explicit: a component factory's **DOM structure must not
depend on prop values**, and the factory must not perform side effects during
construction (effects go through lifecycle hooks or the boundary, see
[0004](0004-effects-at-the-edges.md)). Structure that varies goes through
explicit structural primitives (conditional/list bindings).

In dev builds the framework enforces it: compare binding count and ids between
the structure and bind phases and throw with the component name on mismatch.

## Consequences

- The template-cloning optimization stays.
- Violations fail loudly in development instead of rendering wrong DOM.
