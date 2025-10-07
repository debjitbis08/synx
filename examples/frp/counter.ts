import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// Create the events that represent button clicks in a typical counter UI.
const [increment, emitIncrement] = E.create<void>();
const [decrement, emitDecrement] = E.create<void>();

// Convert those clicks into numeric deltas and merge them into a single stream.
const changes = E.concat(
  E.map(increment, () => 1),
  E.map(decrement, () => -1),
);

// Fold the incoming deltas into a reactive counter value.
const count = E.fold(changes, 0, (total, delta) => total + delta);

// Derive a display label and print it whenever the count updates.
const label = R.map(count, (value) => `Count: ${value}`);
const stop = R.effect(label, (value) => {
  console.log(value);
});

// Emulate user interactions by calling the emitters directly.
const incrementClick = () => emitIncrement();
const decrementClick = () => emitDecrement();

incrementClick(); // Count: 1
incrementClick(); // Count: 2
decrementClick(); // Count: 1
incrementClick(); // Count: 2

stop();
E.cleanup(increment);
E.cleanup(decrement);
E.cleanup(changes);
R.cleanup(count);
R.cleanup(label);
