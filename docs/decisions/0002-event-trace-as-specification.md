# 0002 — The event trace is the unit of specification

**Status:** Accepted · 2026-10-15

## Context

Because Synx UI is a fold over events, a sequence of input events plus the
expected observable values is a complete, checkable description of behavior.
Today that idea exists only inside debug sessions; specifications live in
prose and tests in ad-hoc code.

## Decision

Testing is a first-class interface of the framework, used acceptance-test-first
(ATDD-style). The shared format is a **scenario**: initial state, a sequence of
events on labeled sources, and expected values on labeled nodes.

```ts
scenario("completing the last active todo enables 'clear completed'", {
  given: { todos: [{ id: "a", done: false }] },
  when:  [["todoList.toggled", "a"]],
  then:  { activeCount: 0, clearCompletedVisible: true },
});
```

The same scenario object is the human-readable spec, the vitest test, the
input to MCP `inject`/`assert`, and the basis for behavior diffs in review.
Real sessions can be recorded as traces and promoted to scenarios.

Labels become the spec vocabulary, so they are **typed**: a labeled source
carries its payload type, scenarios are checked at compile time, and tool input
schemas are derived from those types.

## Consequences

- Writing scenarios first forces naming the events and outputs, which is
  designing the graph's interface before its internals.
- Scenarios are required for behavior someone would sign off on (business
  rules, workflows, edge cases from bug reports), **not** for every node.
  Plumbing is covered by invariants and types ([0003](0003-three-layers-of-checking.md)).
- No Cucumber-style translation layer: the scenario format is the framework's
  own vocabulary, which keeps the cost per feature low enough to persist.
