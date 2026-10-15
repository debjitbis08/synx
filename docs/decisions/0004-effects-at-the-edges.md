# 0004 — Effects at the edges, actions as data

**Status:** Accepted · 2026-10-15

## Context

Deterministic replay, generated event sequences and the reference model
([0003](0003-three-layers-of-checking.md)) all require that running the same
events produces the same results. Arbitrary effects inside callbacks (fetch,
storage, timers) and real time break that. Separately, TodoMVC folds over
closures (`state => state`), so a trace shows *that* an action happened but not
*what* it was.

## Decision

- **Pure folds and maps.** Effects are values returned at the boundary and run
  by interpreters (the shape `@synx/async` and `@synx/router` already have).
- **Injectable time.** `delay`, timeouts and async go through a scheduler/clock
  that tests can replace with virtual time.
- **Actions are data.** Recommended pattern: tagged unions
  (`{ type: "delete", id }`) folded by a reducer with an exhaustive `switch`,
  instead of closures. Examples are updated to follow it.

## Consequences

- A trace plus recorded effect results reproduces a run exactly, which makes
  record/replay deterministic rather than best-effort.
- Traces become self-describing without a new API (see [0008](0008-plain-typescript.md)).
- The compiler catches unhandled action kinds.
- This is a convention plus tooling support, not a hard runtime restriction;
  closures in folds still work.
