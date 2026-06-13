import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { label, labelSource } from "@synx/debug";

// Private test fixture (not an example): a minimal labeled counter graph the
// MCP core/integration tests load via build(). Kept here so the tests don't
// depend on anything under examples/.
export function buildCounter(): void {
  const [increment, emitIncrement] = E.create<void>();
  const [decrement, emitDecrement] = E.create<void>();

  const changes = E.concat(
    E.map(increment, () => 1),
    E.map(decrement, () => -1),
  );
  const count = E.fold(changes, 0, (total, delta) => total + delta);
  const countLabel = R.map(count, (value) => `Count: ${value}`);

  labelSource("increment", increment, emitIncrement);
  labelSource("decrement", decrement, emitDecrement);
  label("changes", changes);
  label("count", count);
  label("label", countLabel);
}
