import { describe, expect, it, vi } from "vitest";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import {
  autoCleanup,
  createScope,
  trackDisposerInCurrentScope,
  trackEventInCurrentScope,
  trackReactiveInCurrentScope,
} from "./lifecycle";

describe("lifecycle - createScope", () => {
  it("should track and dispose explicit resources", () => {
    const scope = createScope();
    const disposer = vi.fn();
    const [ev, emit] = E.create<number>();
    const reactive = E.stepper(ev, 0);

    const eventCleanup = vi.fn();
    const reactiveCleanup = vi.fn();
    E.onCleanup(ev, eventCleanup);
    R.onCleanup(reactive, reactiveCleanup);

    scope.use(disposer);
    scope.event(ev);
    scope.reactive(reactive);
    scope.dispose();

    emit(1);
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(eventCleanup).toHaveBeenCalledTimes(1);
    expect(reactiveCleanup).toHaveBeenCalledTimes(1);
    expect(R.get(reactive)).toBe(0);
  });

  it("should track resources created inside run()", () => {
    const scope = createScope();
    const eventCleanup = vi.fn();
    const reactiveCleanup = vi.fn();
    const disposer = vi.fn();

    const { emit, reactive } = scope.run(() => {
      const [ev, emit] = E.create<number>();
      const reactive = E.stepper(ev, 0);
      E.onCleanup(ev, eventCleanup);
      R.onCleanup(reactive, reactiveCleanup);
      trackDisposerInCurrentScope(disposer);
      return { emit, reactive };
    });

    scope.dispose();
    emit(9);

    expect(disposer).toHaveBeenCalledTimes(1);
    expect(eventCleanup).toHaveBeenCalledTimes(1);
    expect(reactiveCleanup).toHaveBeenCalledTimes(1);
    expect(R.get(reactive)).toBe(0);
  });

  it("should support track* helpers in current scope", () => {
    const scope = createScope();
    const [ev, emit] = E.create<number>();
    const reactive = E.stepper(ev, 1);
    const stop = vi.fn();

    scope.run(() => {
      trackEventInCurrentScope(ev);
      trackReactiveInCurrentScope(reactive);
      trackDisposerInCurrentScope(stop);
    });

    scope.dispose();
    emit(2);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(R.get(reactive)).toBe(1);
  });

  it("should dispose scope when attached root is disconnected", async () => {
    const scope = createScope();
    const host = document.createElement("div");
    document.body.appendChild(host);
    scope.attachRoot(host);

    const { emit, reactive } = scope.run(() => {
      const [ev, emit] = E.create<number>();
      const reactive = E.stepper(ev, 0);
      return { emit, reactive };
    });

    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    emit(5);
    expect(R.get(reactive)).toBe(0);
  });
});

describe("lifecycle - autoCleanup", () => {
  it("should dispose all tracked options", () => {
    const disposer = vi.fn();
    const [ev, emit] = E.create<number>();
    const reactive = E.stepper(ev, 1);
    const eventCleanup = vi.fn();
    const reactiveCleanup = vi.fn();

    E.onCleanup(ev, eventCleanup);
    R.onCleanup(reactive, reactiveCleanup);

    const dispose = autoCleanup({
      events: [ev],
      reactives: [reactive],
      disposers: [disposer],
    });

    dispose();
    emit(2);

    expect(disposer).toHaveBeenCalledTimes(1);
    expect(eventCleanup).toHaveBeenCalledTimes(1);
    expect(reactiveCleanup).toHaveBeenCalledTimes(1);
    expect(R.get(reactive)).toBe(1);
  });

  it("should dispose on beforeunload for active scopes", () => {
    const scope = createScope();
    const { emit, reactive } = scope.run(() => {
      const [ev, emit] = E.create<number>();
      const reactive = E.stepper(ev, 10);
      return { emit, reactive };
    });

    window.dispatchEvent(new Event("beforeunload"));
    emit(11);

    expect(R.get(reactive)).toBe(10);
  });
});
