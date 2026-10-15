# 0006 — Agent tooling returns structured, unambiguous results

**Status:** Accepted · 2026-10-15

## Context

`@synx/mcp` works for a single load, but has defects that break an agent's
normal edit → reload → inject loop:

- `synx_assert` passes if the value appears *anywhere* in the node's history
  (`packages/mcp/src/core.ts`), which agents read as "currently equals".
- `loadFile` re-imports a cached module. Because `load()` clears the registry
  first and the module does not re-run, a second load of the same file yields
  an **empty** graph.
- `synx_graph`/`synx_load` return only formatted text, although
  `GraphTopology` is already structured.

## Decision

Agent-facing tools follow these rules:

- **Structured first.** Every tool returns JSON (stable node ids, kinds,
  operators, edges, lifecycle); readable text is optional alongside it.
- **Unambiguous names.** Assertions are split by meaning: `everEmitted`,
  `currentEquals`, `lastEmitted`, `historyEquals`.
- **Reload means fresh.** Loading a file always re-executes the current
  source into an isolated graph instance.
- **Explain, don't just dump.** Tools answer whole questions, e.g.
  `explain <node>`: upstream sources, operator chain, current value, recent
  emissions, covering scenarios.

## Consequences

- MCP tests are added for each rule (reload after edit, assertion variants).
- `synx diff` (topology diff + behavior diff over scenarios and recorded traces)
  is built on the same structured output and is the primary review tool for
  agent-authored changes.
