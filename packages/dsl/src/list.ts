import { Reactive, map } from "@synx/frp/reactive"
import { Eq } from "./types";

export function uniqWith<T>(
  xs: Reactive<readonly T[]>,
  eq: Eq<T>
): Reactive<T[]> {
  return map(xs, (arr) => {
    const out: T[] = [];
    outer: for (const x of arr) {
      for (const y of out) {
        if (eq(x, y)) continue outer; // already have an equal element
      }
      out.push(x);
    }
    return out;
  });
}