/**
 * MCP-loadable counter component — the `@synx/debug` form of counter.ts.
 *
 * It builds the same graph as examples/frp/counter.ts but labels every node and
 * instantiates at the top level, so importing the module populates the
 * @synx/debug registry. That is what the MCP server's `synx_load` (and any trace
 * session created with `{ useRegistry: true }`) needs in order to see the graph.
 *
 * Drive it through the MCP server:
 *   synx_load   { "file": "examples/frp/counter.debug.ts" }
 *   synx_inject { "node": "increment", "value": null }
 *   synx_assert { "node": "count", "expected": 1 }
 *
 * Naming note: the node names (increment, decrement, changes, count, label) are
 * the component's observable surface — renaming one is a breaking change for any
 * test or agent session that references it.
 */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { label, labelSource } from "@synx/debug";

export interface Counter {
  changes: E.Event<number>;
  count: R.Reactive<number>;
  label: R.Reactive<string>;
}

export function createCounter(
  increment: E.Event<void>,
  decrement: E.Event<void>,
): Counter {
  const changes = E.concat(
    E.map(increment, () => 1),
    E.map(decrement, () => -1),
  );
  const count = E.fold(changes, 0, (total, delta) => total + delta);
  const label = R.map(count, (value) => `Count: ${value}`);
  return { changes, count, label };
}

/**
 * Build the counter and label its nodes. Importing this module runs it once (so
 * `synx_load` can pick the graph up); tests call it directly to rebuild a fresh,
 * labeled graph per case.
 */
export function build(): Counter {
  const [increment, emitIncrement] = E.create<void>();
  const [decrement, emitDecrement] = E.create<void>();
  const counter = createCounter(increment, decrement);

  labelSource("increment", increment, emitIncrement);
  labelSource("decrement", decrement, emitDecrement);
  label("changes", counter.changes);
  label("count", counter.count);
  label("label", counter.label);
  return counter;
}

// Top-level instantiation so executing the module registers the nodes.
build();
