import { describe, expect, it } from "vitest";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { Ref, RefMap, refMapOutputs, refOutput } from "./ref";

describe("Ref", () => {
  it("should set/get/current values", () => {
    const r = Ref<number>();
    expect(r.current()).toBeNull();
    r.set(42);
    expect(r.current()).toBe(42);
    expect(r.get()).toBe(42);
  });

  it("should throw when get is called before ref is ready", () => {
    const r = Ref<number>();
    expect(() => r.get()).toThrow(/not ready/i);
  });

  it("should forward DOM events from current target", async () => {
    const button = document.createElement("button");
    const r = Ref<EventTarget>();
    const clicks: Event[] = [];
    const stop = E.subscribe(r.outputs.click, (event) => clicks.push(event));

    r.set(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
    button.dispatchEvent(new MouseEvent("click"));
    button.dispatchEvent(new MouseEvent("click"));

    expect(clicks.length).toBe(2);
    stop();
  });

  it("should switch DOM event source when target changes", async () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    const r = Ref<EventTarget>();
    let count = 0;
    const stop = E.subscribe(r.outputs.click, () => {
      count += 1;
    });

    r.set(a);
    await new Promise((resolve) => setTimeout(resolve, 0));
    a.dispatchEvent(new MouseEvent("click"));
    r.set(b);
    await new Promise((resolve) => setTimeout(resolve, 0));
    a.dispatchEvent(new MouseEvent("click"));
    b.dispatchEvent(new MouseEvent("click"));

    expect(count).toBe(2);
    stop();
  });

  it("should forward component outputs via refOutput", async () => {
    const [outEvent, emitOut] = E.create<string>();
    const r = Ref<{ outputs?: Record<string, E.Event<any>> }>();
    const values: string[] = [];
    const out = refOutput<string>(r, "saved");
    const stop = E.subscribe(out, (value) => values.push(value));

    r.set({ outputs: { saved: outEvent } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emitOut("ok");
    emitOut("done");

    expect(values).toEqual(["ok", "done"]);
    stop();
  });
});

describe("RefMap", () => {
  it("should set/get/delete and clear entries", () => {
    const refs = RefMap<string, number>();
    refs.set("a", 1);
    refs.set("b", 2);

    expect(R.get(refs.size)).toBe(2);
    expect(refs.get("a").current()).toBe(1);
    expect(refs.get("b").current()).toBe(2);

    refs.delete("a");
    expect(R.get(refs.size)).toBe(1);
    expect(refs.get("a").current()).toBeNull();

    refs.clear();
    expect(R.get(refs.size)).toBe(0);
  });

  it("should expose reactive keys/values/entries", () => {
    const refs = RefMap<string, number>();
    refs.set("x", 10);
    refs.set("y", 20);

    expect(R.get(refs.keys()).sort()).toEqual(["x", "y"]);
    expect(R.get(refs.values()).sort()).toEqual([10, 20]);
    expect(R.get(refs.entries()).length).toBe(2);
  });

  it("should expose output event arrays with refMapOutputs", () => {
    const refs = RefMap<number, { outputs?: Record<string, E.Event<string>> }>();
    const [aEvent] = E.create<string>();
    const [bEvent] = E.create<string>();

    refs.set(1, { outputs: { saved: aEvent } });
    refs.set(2, { outputs: { saved: bEvent } });

    const outputEvents = R.get(refMapOutputs(refs, "saved"));
    expect(outputEvents.length).toBe(2);
    expect(outputEvents[0]).toBe(aEvent);
    expect(outputEvents[1]).toBe(bEvent);
  });

  it("should use fallback output for missing keys", () => {
    const refs = RefMap<number, { outputs?: Record<string, E.Event<string>> }>();
    refs.set(1, { outputs: {} });

    const outputEvents = R.get(refMapOutputs(refs, "saved", "fallback"));
    expect(outputEvents.length).toBe(1);

    const values: string[] = [];
    const stop = E.subscribe(outputEvents[0], (value) => values.push(value));
    expect(values).toEqual(["fallback"]);
    stop();
  });
});
