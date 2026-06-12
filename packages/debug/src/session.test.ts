import { describe, it, expect, afterEach } from "vitest";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { createSession } from "./session";
import { label, labelSource } from "./label";
import { registry } from "./registry";

describe("session with direct tracking", () => {
  it("tracks source and derived nodes", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);

    s.expect("count").toHaveLastEmitted(1);
    s.expect("count").toHaveEmitted(1);

    s.dispose();
  });

  it("tracks multiple injections", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);
    s.inject("clicks", undefined);
    s.inject("clicks", undefined);

    s.expect("count").toHaveHistory([1, 2, 3]);
    s.expect("count").toHaveLastEmitted(3);

    s.dispose();
  });

  it("tracks events and reactives together", () => {
    const [clicks, emitClick] = E.create<void>();
    const deltas = E.map(clicks, () => 1);
    const count = E.fold(deltas, 0, (total, d) => total + d);
    const countLabel = R.map(count, (n) => `Count: ${n}`);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("deltas", deltas);
    s.track("count", count);
    s.track("countLabel", countLabel);

    s.inject("clicks", undefined);

    s.expect("deltas").toHaveEmitted(1);
    s.expect("count").toHaveLastEmitted(1);
    s.expect("countLabel").toHaveLastEmitted("Count: 1");

    s.dispose();
  });

  it("throws on inject to non-source node", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.track("count", count);

    expect(() => s.inject("count", 5)).toThrow("not a source node");

    s.dispose();
  });

  it("throws on inject to unknown node", () => {
    const s = createSession();

    expect(() => s.inject("nonexistent", 1)).toThrow("No node registered");

    s.dispose();
  });

  it("throws on expect of unknown node", () => {
    const s = createSession();

    expect(() => s.expect("nonexistent")).toThrow("No node registered");

    s.dispose();
  });

  it("produces trace text with inject header", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);

    const text = s.traceText();
    expect(text).toContain("inject: clicks");
    expect(text).toContain("count");
    expect(text).toContain("updated");
    expect(text).toContain("0 -> 1");

    s.dispose();
  });

  it("reset clears trace but keeps subscriptions", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);
    expect(s.trace().length).toBeGreaterThan(0);

    s.reset();
    expect(s.trace().length).toBe(0);

    // Subscriptions still active
    s.inject("clicks", undefined);
    s.expect("count").toHaveLastEmitted(2);

    s.dispose();
  });

  it("toNotHaveEmitted passes when no emissions", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    // No injection — count should not have emitted
    s.expect("count").toNotHaveEmitted();

    s.dispose();
  });

  it("toNotHaveEmitted fails when emissions exist", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);

    expect(() => s.expect("count").toNotHaveEmitted()).toThrow(
      "not have emitted",
    );

    s.dispose();
  });
});

describe("session with registry", () => {
  afterEach(() => {
    registry.clear();
  });

  it("loads nodes from global registry", () => {
    const [clicks, emitClick] = E.create<void>();
    labelSource("clicks", clicks, emitClick);

    const count = E.fold(clicks, 0, (n) => n + 1);
    label("count", count);

    const s = createSession({ useRegistry: true });

    s.inject("clicks", undefined);
    s.expect("count").toHaveLastEmitted(1);

    s.dispose();
  });

  it("registry + manual tracking coexist", () => {
    const [clicks, emitClick] = E.create<void>();
    labelSource("clicks", clicks, emitClick);

    const count = E.fold(clicks, 0, (n) => n + 1);
    const doubled = R.map(count, (n) => n * 2);

    // count is in registry, doubled is tracked manually
    label("count", count);

    const s = createSession({ useRegistry: true });
    s.track("doubled", doubled);

    s.inject("clicks", undefined);
    s.expect("count").toHaveLastEmitted(1);
    s.expect("doubled").toHaveLastEmitted(2);

    s.dispose();
  });
});

describe("session trace format", () => {
  it("formats reactive updates with previous -> next", () => {
    const [clicks, emitClick] = E.create<void>();
    const count = E.fold(clicks, 0, (n) => n + 1);

    const s = createSession();
    s.source("clicks", clicks, emitClick);
    s.track("count", count);

    s.inject("clicks", undefined);
    s.inject("clicks", undefined);

    const text = s.traceText();
    expect(text).toContain("0 -> 1");
    expect(text).toContain("1 -> 2");

    s.dispose();
  });

  it("formats event emissions with inject header", () => {
    const [clicks, emitClick] = E.create<string>();

    const s = createSession();
    s.source("clicks", clicks, emitClick);

    s.inject("clicks", "hello");

    const text = s.traceText();
    expect(text).toContain('inject: clicks = "hello"');
    expect(text).toContain("clicks");
    expect(text).toContain("emitted");

    s.dispose();
  });

  it("returns no-entries message when empty", () => {
    const s = createSession();
    expect(s.traceText()).toBe("(no trace entries)");
    s.dispose();
  });
});
