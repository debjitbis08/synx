# 0005 — Reactive errors are trace entries, not console output

**Status:** Accepted · 2026-10-15

## Context

Exceptions thrown in user callbacks are caught and sent to `console.error`
unconditionally on hot paths, e.g. subscriber dispatch
(`packages/frp/src/reactive.ts`) and `mergeWith` (`packages/frp/src/event.ts`).
A bug in a fold shows up as a missing emission in a trace with no failure
attached. Agents and tests cannot detect it programmatically.

## Decision

Errors raised in reactive callbacks go to an error channel. Each report records
the operator, the error, the affected node and source location where available.

- Debug sessions record errors as trace entries; MCP tools surface them.
- Test helpers fail on any unexpected reactive error by default.
- Production behavior stays isolating (one failing subscriber does not stop
  the others) and reports to a pluggable hook instead of only the console.

## Consequences

- Agents get failures they can inspect instead of console noise.
- The hot path keeps its try/catch; only the handler changes, so performance
  impact should be negligible (verified by the tripwire benchmarks).
