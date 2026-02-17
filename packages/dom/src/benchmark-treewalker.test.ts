import { describe, it, expect } from "vitest";
import { defineComponent } from "./component/define";
import { h } from "./tags";

describe("Path-Based Binding Benchmark", () => {
  it("should efficiently instantiate large components using path-based binding", () => {
    // Create a component with many nested elements
    const Large = defineComponent(() => ({
      el: h(
        "div",
        {},
        ...Array.from({ length: 100 }, (_, i) =>
          h("section", {},
            h("div", { "data-item": i },
              h("span", {}, String(i)),
              h("button", {}, "Action")
            )
          )
        )
      ) as HTMLElement,
      props: {},
      outputs: {},
    }));

    // Warm up - create template
    const warmup = Large();
    warmup.cleanup();

    // Benchmark: Create 50 instances
    const iterations = 50;
    const start = performance.now();
    const instances = Array.from({ length: iterations }, () => Large());
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // Cleanup
    instances.forEach(instance => instance.cleanup());

    // Path-based binding eliminates DOM traversal in bind phase
    // Each component has ~300 elements, 100 with binding IDs
    console.log(`Path-based: ${avgMs.toFixed(2)}ms per instance (${iterations} instances, ${(elapsed).toFixed(0)}ms total)`);
    console.log(`  ~${(iterations * 100)} binding elements via direct path access`);

    // Should complete in reasonable time even with 50 instances of 300-element components
    expect(elapsed).toBeLessThan(2000); // Reasonable threshold with test environment variance
    expect(avgMs).toBeLessThan(40); // Less than 40ms per instance average
  });

  it("should scale efficiently with component complexity", () => {
    const results: Array<{ size: number; timeMs: number }> = [];

    for (const size of [10, 50, 100, 200]) {
      const Comp = defineComponent(() => ({
        el: h(
          "div",
          {},
          ...Array.from({ length: size }, (_, i) =>
            h("div", { "data-i": i }, h("span", {}, String(i)))
          )
        ) as HTMLElement,
        props: {},
        outputs: {},
      }));

      // Prime template
      Comp().cleanup();

      // Measure
      const start = performance.now();
      const instances = Array.from({ length: 10 }, () => Comp());
      const elapsed = performance.now() - start;

      instances.forEach(instance => instance.cleanup());
      results.push({ size, timeMs: elapsed / 10 });
    }

    console.log("\nScaling Results:");
    results.forEach(({ size, timeMs }) => {
      console.log(`  ${size} elements: ${timeMs.toFixed(2)}ms per instance`);
    });

    // Should scale linearly (not exponentially)
    // 200 elements is 20x more elements, so should be < 30x slower (allows for some overhead)
    const ratio = results[3].timeMs / results[0].timeMs;
    const elementRatio = results[3].size / results[0].size; // 200 / 10 = 20x
    expect(ratio).toBeLessThan(elementRatio * 1.5); // Allow 50% overhead
  });
});
