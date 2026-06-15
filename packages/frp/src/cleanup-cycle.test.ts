import { describe, it, expect } from "vitest";
import * as E from "./event";
import * as R from "./reactive";

/**
 * Regression: an Event and its stepper Reactive hold mutual cleanup links.
 * A reactive's onCleanup that cleans its source event (the common pattern for
 * wrapping external sources, e.g. @synx/dom mediaQueryMatches and
 * @synx/router's location source) must not recurse on dispose.
 */
describe("stepper Event/Reactive mutual cleanup", () => {
  it("does not recurse when cleaning the reactive triggers cleaning its source event", () => {
    const [ev] = E.create<number>();
    const r = E.stepper(ev, 0);

    let ran = 0;
    R.onCleanup(r, () => {
      ran++;
      E.cleanup(ev);
    });

    expect(() => R.cleanup(r)).not.toThrow();
    expect(ran).toBe(1); // disposer runs exactly once
  });

  it("does not recurse when cleaning the source event cleans its stepper reactive", () => {
    const [ev] = E.create<number>();
    const r = E.stepper(ev, 0);

    let ran = 0;
    R.onCleanup(r, () => {
      ran++;
      E.cleanup(ev);
    });

    expect(() => E.cleanup(ev)).not.toThrow();
    expect(ran).toBe(1);
  });

  it("repeated cleanup calls are no-ops", () => {
    const [ev] = E.create<number>();
    const r = E.stepper(ev, 0);
    let ran = 0;
    R.onCleanup(r, () => ran++);

    R.cleanup(r);
    R.cleanup(r);
    E.cleanup(ev);

    expect(ran).toBe(1);
  });
});
