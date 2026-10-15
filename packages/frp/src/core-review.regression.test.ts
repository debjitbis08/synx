import { describe, it, expect } from "vitest";
import * as E from "./event";
import * as R from "./reactive";

/**
 * Regression suite for the correctness/performance review of the
 * Event <-> Reactive recursive core (event.ts / reactive.ts / future.ts).
 *
 * Conventions:
 *   [LOCK]          — guards already-correct behavior; passes today.
 *   [RED-until-fix] — encodes desired post-fix behavior; FAILS today and is
 *                     the acceptance test for the corresponding fix.
 *   [TRIPWIRE]      — pins a current cost so a future change that alters it is
 *                     noticed; the comment says what value to expect after a fix.
 *
 * See review notes for the matching finding numbers (F1..F5).
 */

describe("core review — Event<->Reactive cycle semantics [LOCK]", () => {
  it("F0a: all subscribers present before the first emit receive the first value", () => {
    const [ev, emit] = E.create<number>();
    const seen: number[] = [];
    E.subscribe(ev, (v) => seen.push(v));
    E.subscribe(ev, (v) => seen.push(v * 10));
    emit(5);
    expect(seen).toEqual([5, 50]);
  });

  it("F0b: a value emitted before any subscriber is dropped (event, not behavior)", () => {
    const [ev, emit] = E.create<number>();
    emit(1); // no subscribers yet -> dropped
    const seen: number[] = [];
    E.subscribe(ev, (v) => seen.push(v));
    emit(2);
    expect(seen).toEqual([2]);
  });

  it("F0c: a subscriber added after the first emit does NOT replay the last value", () => {
    const [ev, emit] = E.create<number>();
    E.subscribe(ev, () => {});
    emit(1);
    const late: number[] = [];
    E.subscribe(ev, (v) => late.push(v));
    expect(late).toEqual([]); // event has no current value to replay
    emit(2);
    expect(late).toEqual([2]);
  });

  it("F0d: stepper caches the reactive per initial value", () => {
    const [ev] = E.create<number>();
    const r1 = E.stepper(ev, 0);
    const r2 = E.stepper(ev, 0);
    expect(r1).toBe(r2);
    const r3 = E.stepper(ev, 9);
    expect(r3).not.toBe(r1);
  });
});

describe("core review — dispatch integrity", () => {
  // F1: updateValueInternal iterates `subscribers` by index with a cached
  // length. If a handler unsubscribes (splice) during dispatch, the array
  // shifts under the loop and the *next* subscriber is skipped (and a stale
  // index is read). Fix: snapshot the subscriber list before dispatching.
  it("F1: unsubscribing during dispatch must not skip other subscribers [RED-until-fix]", () => {
    const [ev, emit] = E.create<number>();
    const seen: string[] = [];
    let unsubA: () => void = () => {};
    unsubA = E.subscribe(ev, () => {
      seen.push("A");
      unsubA(); // remove self mid-dispatch
    });
    E.subscribe(ev, () => seen.push("B"));
    E.subscribe(ev, () => seen.push("C"));

    emit(1);

    // Today: ["A","C"] — "B" is skipped because splice shifted "C" into B's slot.
    expect(seen).toEqual(["A", "B", "C"]);
  });

  it("F1b: a handler that removes a *later* handler mid-dispatch stops that handler firing exactly once [LOCK]", () => {
    const [ev, emit] = E.create<number>();
    const seen: string[] = [];
    let unsubC: () => void = () => {};
    E.subscribe(ev, () => {
      seen.push("A");
      unsubC(); // remove C before it would be reached
    });
    E.subscribe(ev, () => seen.push("B"));
    unsubC = E.subscribe(ev, () => seen.push("C"));

    emit(1);
    // C must not fire (it was removed). B must still fire.
    expect(seen).toContain("B");
    expect(seen).not.toContain("C");
  });
});

describe("core review — allocation", () => {
  // F2: E.create builds `Future.reactive(initialEmitValueFuture)` =
  // initialEmitValueFuture.map(v => new ReactiveImpl(v)). Every time a handler
  // runs (i.e. on every subscribe after the first emit) a throwaway
  // ReactiveImpl is allocated and immediately discarded — only the very first
  // one is retained. N post-emit subscribes => N allocations.
  it("F2: subscribing after the first emit must not allocate O(N) reactives [RED-until-fix]", () => {
    const [ev, emit] = E.create<number>();
    E.subscribe(ev, () => {});
    emit(0); // reactive now exists

    R.__private__.resetDebugStats();
    const N = 500;
    for (let i = 0; i < N; i++) E.subscribe(ev, () => {});
    const created = R.__private__.debugStats().created;

    // Today: created === N (500). Ideal: ~0 (no new reactive per subscribe).
    expect(created).toBeLessThan(N / 10);
  });
});

describe("core review — teardown scaling", () => {
  // F3: subscribers that subscribe BEFORE the first emit are stored in the
  // `onFirstEmit` array, and each unsubscribe rebuilds it with
  // `onFirstEmit = onFirstEmit.filter(...)` — O(n) per unsubscribe, O(n^2) to
  // tear them all down. (Also: onFirstEmit is never cleared after first emit.)
  // This is a coarse wall-clock guard; thresholds are generous to avoid flake.
  it("F3: tearing down many pre-emit subscribers stays sub-quadratic [RED-until-fix]", () => {
    const teardown = (n: number): number => {
      const [ev] = E.create<number>();
      const unsubs: Array<() => void> = [];
      for (let i = 0; i < n; i++) unsubs.push(E.subscribe(ev, () => {}));
      const t0 = performance.now();
      for (let i = 0; i < unsubs.length; i++) unsubs[i]();
      return performance.now() - t0;
    };

    teardown(2000); // warm up JIT
    const ms = teardown(16000);

    // Today this is ~1.4s (quadratic). A linear teardown is tens of ms.
    // 300ms cleanly separates the two regimes on any reasonable machine.
    expect(ms).toBeLessThan(300);
  });
});

describe("core review — R.map fan-out", () => {
  // F4: R.map is a lazy fused derivation with no multicast/caching. Each
  // subscriber to a mapped reactive independently re-runs the map function on
  // every source change. With S subscribers, the map fn runs S times per
  // change (and currentValue is written S times).
  it("F4 [TRIPWIRE]: map currently recomputes once per subscriber per change", () => {
    const [ev, emit] = E.create<number>();
    const base = E.fold(ev, 0, (_, x) => x);
    let calls = 0;
    const mapped = R.map(base, (x) => {
      calls++;
      return x * 2;
    });

    const S = 10;
    for (let i = 0; i < S; i++) R.subscribe(mapped, () => {});

    calls = 0; // ignore the immediate reads done during subscribe()
    emit(1);

    // Current (non-multicast) behavior. If map gains shared caching, this
    // should drop to 1 — update the expectation when that fix lands.
    expect(calls).toBe(S);
  });
});

describe("core review — stepper duplication", () => {
  // F6: E.stepper caches its reactive in a single `_stepper` slot keyed on
  // `initial === `. A second call on the same event with a *different* initial
  // silently builds a second reactive, subscribes it to the event, and
  // overwrites `_stepper` — orphaning the first. The orphan stays live (keeps
  // receiving updates) and is unreachable for cleanup (E.cleanup only severs
  // `_stepper.reactive`). Object initials defeat the cache on every call.
  //
  // Recommended fix: memoize one stepper per event; bind `initial` on the
  // first call and reuse thereafter. If the team instead prefers to warn/throw
  // on a conflicting initial, update these expectations to match.

  it("F6a: a second stepper on the same event with a different initial must not orphan a live duplicate [RED-until-fix]", () => {
    const [ev, emit] = E.create<number>();
    const first = E.stepper(ev, 0);
    const second = E.stepper(ev, 99); // different initial

    // One stepper per event: same reactive is returned.
    expect(second).toBe(first);

    // And there must not be two independently-live reactives both updating.
    emit(7);
    expect(R.sample(first)).toBe(R.sample(second));
  });

  it("F6b: object initials must not silently multiply steppers [RED-until-fix]", () => {
    const [ev] = E.create<{ n: number }>();
    const a = E.stepper(ev, { n: 0 });
    const b = E.stepper(ev, { n: 0 }); // structurally equal, different ref
    expect(b).toBe(a);
  });

  it("F6c: repeated stepper with the SAME primitive initial is already memoized [LOCK]", () => {
    const [ev] = E.create<number>();
    expect(E.stepper(ev, 0)).toBe(E.stepper(ev, 0));
  });
});

describe("core review — cleanup cascade to .changes", () => {
  // F7: R.cleanup runs the reactive's own cleanupFns and clears subscribers but
  // never touches `this.changeEvent`. When the reactive OWNS that event (it was
  // created lazily by the `changes` getter, e.g. a fold result), the event's
  // onCleanup handlers never run and it is never torn down. Fix must cascade to
  // an OWNED changes event only — a stepper's `.changes` IS the shared source
  // event and must not be cleaned from downstream.

  it("F7a: R.cleanup fires onCleanup on an OWNED .changes event [RED-until-fix]", () => {
    const [ev] = E.create<number>();
    const r = E.fold(ev, 0, (_, x) => x); // non-stepper: .changes is owned
    const changes = r.changes;
    expect(changes).not.toBe(ev); // sanity: it is a distinct, owned event

    let ran = 0;
    E.onCleanup(changes, () => ran++);
    R.cleanup(r);
    expect(ran).toBe(1);
  });

  it("F7b: R.cleanup on a stepper must NOT tear down its shared source event [LOCK]", () => {
    const [ev, emit] = E.create<number>();
    const r = E.stepper(ev, 0);
    // For a stepper, the source event is reused as the changes event.
    expect(r.changes).toBe(ev);

    let sourceCleaned = 0;
    E.onCleanup(ev, () => sourceCleaned++);
    R.cleanup(r);
    expect(sourceCleaned).toBe(0);

    // The source event still works for its other consumers.
    const seen: number[] = [];
    E.subscribe(ev, (v) => seen.push(v));
    emit(5);
    expect(seen).toEqual([5]);
  });
});
