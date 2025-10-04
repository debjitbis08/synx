import * as E from '@synx/frp/event';

const [numbers, pushNumber] = E.create<number>();
const [letters, pushLetter] = E.create<string>();

const pairs = E.zip(numbers, letters);

const stop = E.subscribe(pairs, ([n, l]) => {
  console.log(`${n} → ${l}`);
});

[1, 2, 3].forEach(pushNumber);
['a', 'b', 'c'].forEach(pushLetter);

stop();
E.cleanup(numbers);
E.cleanup(letters);
E.cleanup(pairs);
