import { bind, on } from '@synx/dom';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Expected element matching selector: ${selector}`);
  }
  return element;
}

const decrementButton = queryRequired<HTMLButtonElement>('[data-role="decrement"]');
const incrementButton = queryRequired<HTMLButtonElement>('[data-role="increment"]');
const valueDisplay = queryRequired<HTMLSpanElement>('[data-role="value"]');

const decrementClicks = on(decrementButton, 'click');
const incrementClicks = on(incrementButton, 'click');

const increments = E.map(incrementClicks, () => 1);
const decrements = E.map(decrementClicks, () => -1);
const deltas = E.concat(increments, decrements);

const count = E.fold(deltas, 0, (total, change) => total + change);
const countLabel = R.map(count, (value) => `Count: ${value}`);

bind(valueDisplay, 'text', countLabel);

window.addEventListener('beforeunload', () => {
  E.cleanup(decrementClicks);
  E.cleanup(incrementClicks);
  E.cleanup(increments);
  E.cleanup(decrements);
  E.cleanup(deltas);
  R.cleanup(count);
  R.cleanup(countLabel);
});
