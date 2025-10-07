import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { Eq } from "./types";

export function distinctBy<T>(r: R.Reactive<T>, eq: Eq<T>): R.Reactive<T> {
  const initial = R.get(r);
  let prev = initial;

  const [ev, emit] = E.create<T>();

  // Forward only when `eq(prev, v)` is false
  const unsubscribe = R.effect(r, (v) => {
    if (!eq(prev, v)) {
      prev = v;
      emit(v);
    }
  });

  // Turn the (distinct) change stream back into a Reactive
  const out = E.stepper(ev, initial);

  R.onCleanup(out, unsubscribe);

  return out;
}

export function distinct<T>(r: R.Reactive<T>): R.Reactive<T> {
  return distinctBy(r, (a: T, b: T) => a === b);
}
