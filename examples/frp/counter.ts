import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// Create an event stream that will carry increment values.
const [increment, emitIncrement] = E.create<number>();

// Accumulate the event stream into a reactive state value.
const count = E.fold(increment, 0, (total, delta) => total + delta);

// Derive a reactive value for presentation.
const label = R.map(count, (value) => `count → ${value}`);

const stop = R.subscribe(label, (value) => {
  console.log(value);
});

[1, 1, 2, 3].forEach((delta) => {
  emitIncrement(delta);
});

stop();
E.cleanup(increment);
R.cleanup(count);
R.cleanup(label);
