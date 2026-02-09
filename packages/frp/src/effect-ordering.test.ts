import { describe, it, expect } from "vitest";
import * as E from "./event";
import * as R from "./reactive";

class FakeEditInput {
  visible = false;
  focused = false;
  selected = false;

  focus() {
    if (this.visible) this.focused = true;
  }

  select() {
    if (this.focused) this.selected = true;
  }
}

describe("effect ordering", () => {
  it("reproduces ordering bug: side effect can run before visibility binding", () => {
    const [editingEv, emitEditing] = E.create<boolean>();
    const isEditing = E.stepper(editingEv, false);
    const input = new FakeEditInput();

    // Side effect subscribes first.
    R.subscribe(isEditing, (editing) => {
      if (!editing) return;
      input.focus();
      input.select();
    });

    // Binding subscribes later.
    R.subscribe(isEditing, (editing) => {
      input.visible = editing;
    });

    emitEditing(true);

    expect(input.visible).toBe(true);
    expect(input.focused).toBe(false);
    expect(input.selected).toBe(false);
  });

  it("shows why deferring side effects avoids subscription-order dependency", async () => {
    const [editingEv, emitEditing] = E.create<boolean>();
    const isEditing = E.stepper(editingEv, false);
    const input = new FakeEditInput();

    R.subscribe(isEditing, (editing) => {
      if (!editing) return;
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
    });

    R.subscribe(isEditing, (editing) => {
      input.visible = editing;
    });

    emitEditing(true);
    await Promise.resolve();

    expect(input.visible).toBe(true);
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
  });

  it("R.effect is post-flush, so side effects are not dependent on subscribe order", async () => {
    const [editingEv, emitEditing] = E.create<boolean>();
    const isEditing = E.stepper(editingEv, false);
    const input = new FakeEditInput();

    // Register side effect first to mirror the problematic ordering.
    R.effect(isEditing, (editing) => {
      if (!editing) return;
      input.focus();
      input.select();
    });

    // Register binding later.
    R.subscribe(isEditing, (editing) => {
      input.visible = editing;
    });

    emitEditing(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(input.visible).toBe(true);
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
  });
});
