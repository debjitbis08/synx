# Architecture decisions

Short records of decisions that shape Synx. Each one states the context, the
decision, and its consequences. A decision is changed by writing a new record
that supersedes it, not by editing the old one.

| #    | Decision                                                                 | Status   | Date       |
| ---- | ------------------------------------------------------------------------ | -------- | ---------- |
| 0001 | [Optimize for explainable behavior](0001-optimize-for-explainable-behavior.md) | Accepted | 2026-10-15 |
| 0002 | [The event trace is the unit of specification](0002-event-trace-as-specification.md) | Accepted | 2026-10-15 |
| 0003 | [Three layers of checking: scenarios, invariants, reference model](0003-three-layers-of-checking.md) | Accepted | 2026-10-15 |
| 0004 | [Effects at the edges, actions as data](0004-effects-at-the-edges.md) | Accepted | 2026-10-15 |
| 0005 | [Reactive errors are trace entries, not console output](0005-errors-are-trace-entries.md) | Accepted | 2026-10-15 |
| 0006 | [Agent tooling returns structured, unambiguous results](0006-agent-tooling-contract.md) | Accepted | 2026-10-15 |
| 0007 | [Component factories must be structurally pure](0007-structurally-pure-components.md) | Accepted | 2026-10-15 |
| 0008 | [Plain TypeScript; no DSL or compiler for semantics](0008-plain-typescript.md) | Accepted | 2026-10-15 |

Progress on the work these decisions imply is tracked in [ROADMAP.md](../../ROADMAP.md).
