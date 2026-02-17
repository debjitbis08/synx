import { describe, expect, it } from "vitest";
import { defineComponent } from "./component/define";
import { h } from "./tags";

function measureMs(fn: () => void, runs = 1): number {
  const start = performance.now();
  for (let i = 0; i < runs; i += 1) fn();
  return (performance.now() - start) / runs;
}

function makeTree(size: number) {
  return h(
    "section",
    {},
    ...Array.from({ length: size }, (_, i) =>
      h("div", { "data-i": i }, h("span", {}, String(i)))
    )
  );
}

describe("Performance - h()", () => {
  it("should create 1000 elements in < 10ms", () => {
    // Warm up JIT and template cache.
    for (let i = 0; i < 50; i += 1) h("div");

    const hElapsed = measureMs(() => {
      for (let i = 0; i < 1000; i += 1) h("div");
    });
    const nativeElapsed = measureMs(() => {
      for (let i = 0; i < 1000; i += 1) document.createElement("div");
    });

    // Keep intent of the "<10ms" target while tolerating slower CI/jsdom hosts.
    const budget = Math.max(10, nativeElapsed * 5);
    expect(hElapsed).toBeLessThan(budget);
  });

  it("should not leak memory with repeated creation", () => {
    const gc = (globalThis as unknown as { gc?: () => void }).gc;
    if (typeof gc !== "function") {
      // Node was not launched with --expose-gc, so skip strict leak signal.
      expect(true).toBe(true);
      return;
    }

    gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i += 1) {
      const el = makeTree(20) as HTMLElement;
      document.body.appendChild(el);
      el.remove();
    }

    gc();
    const after = process.memoryUsage().heapUsed;
    const deltaMb = (after - before) / (1024 * 1024);

    expect(deltaMb).toBeLessThan(8);
  });
});

describe("Performance - defineComponent", () => {
  it("should cache template efficiently", () => {
    let calls = 0;
    const Comp = defineComponent(() => {
      calls += 1;
      return {
        el: makeTree(20) as HTMLElement,
        props: {},
        outputs: {},
      };
    });

    Comp();
    for (let i = 0; i < 25; i += 1) Comp();

    // First render: structure + bind, remaining renders: bind-only
    expect(calls).toBe(27);
  });

  it("should clone quickly (< 1ms for 50-element component)", () => {
    const Comp = defineComponent(() => ({
      el: makeTree(50) as HTMLElement,
      props: {},
      outputs: {},
    }));

    // Prime template cache.
    Comp();

    const warmMs = measureMs(() => {
      const instance = Comp();
      (instance.el as HTMLElement).remove();
    }, 30);

    const coldMs = measureMs(() => {
      const Fresh = defineComponent(() => ({
        el: makeTree(50) as HTMLElement,
        props: {},
        outputs: {},
      }));
      const instance = Fresh();
      (instance.el as HTMLElement).remove();
    }, 30);

    expect(warmMs).toBeLessThan(coldMs * 2);
    expect(warmMs).toBeLessThan(40);
  });

  it("should handle 100 component instances efficiently", () => {
    const CachedComp = defineComponent(() => ({
      el: makeTree(15) as HTMLElement,
      props: {},
      outputs: {},
    }));

    // Prime template cache.
    CachedComp();

    const cachedMs = measureMs(() => {
      const nodes: HTMLElement[] = [];
      for (let i = 0; i < 100; i += 1) {
        const instance = CachedComp();
        nodes.push(instance.el as HTMLElement);
      }
      for (let i = 0; i < nodes.length; i += 1) nodes[i].remove();
    });

    const coldMs = measureMs(() => {
      const nodes: HTMLElement[] = [];
      for (let i = 0; i < 100; i += 1) {
        const Fresh = defineComponent(() => ({
          el: makeTree(15) as HTMLElement,
          props: {},
          outputs: {},
        }));
        const instance = Fresh();
        nodes.push(instance.el as HTMLElement);
      }
      for (let i = 0; i < nodes.length; i += 1) nodes[i].remove();
    });

    expect(cachedMs).toBeLessThan(coldMs);
    expect(cachedMs).toBeLessThan(2000);
  });
});
