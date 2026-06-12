import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// ── Counter logic (testable) ────────────────────────────────────────
export function createCounter(
  increment: E.Event<void>,
  decrement: E.Event<void>,
) {
  const changes = E.concat(
    E.map(increment, () => 1),
    E.map(decrement, () => -1),
  );
  const count = E.fold(changes, 0, (total, delta) => total + delta);
  const label = R.map(count, (value) => `Count: ${value}`);
  return { changes, count, label };
}

// ── Demo ────────────────────────────────────────────────────────────
const [increment, emitIncrement] = E.create<void>();
const [decrement, emitDecrement] = E.create<void>();
const { changes, count, label } = createCounter(increment, decrement);

const stop = R.effect(label, (value) => {
  console.log(value);
});

emitIncrement(); // Count: 1
emitIncrement(); // Count: 2
emitDecrement(); // Count: 1
emitIncrement(); // Count: 2

stop();
E.cleanup(increment);
E.cleanup(decrement);
E.cleanup(changes);
R.cleanup(count);
R.cleanup(label);
