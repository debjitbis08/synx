import { describe, it, expect } from 'vitest';
import { fix, fixWith } from './fix';
import * as E from './event';
import { subscribe, get } from './reactive';

describe('fix', () => {
  it('should create a recursive reactive value', () => {
    const values: string[] = [];

    // Create an emitter to trigger updates
    const [updateEvent, emitUpdate] = E.create<string>();

    // Use fix to create a reactive that depends on itself
    const reactive = fix("initial", (self) => {
      // The event that updates the reactive can reference the reactive itself
      return updateEvent;
    });

    // Subscribe to track values
    subscribe(reactive, (value: string) => {
      values.push(value);
    });

    expect(values).toEqual(["initial"]);

    emitUpdate("first");
    expect(values).toEqual(["initial", "first"]);

    emitUpdate("second");
    expect(values).toEqual(["initial", "first", "second"]);
  });

  it('should allow wiring event streams that reference the reactive', () => {
    const values: string[] = [];
    const [clearEvent, emitClear] = E.create<void>();

    // Create a reactive input value that clears on demand
    const inputValue = fix("initial", (self) => {
      // The event stream can reference self for wiring,
      // but shouldn't immediately evaluate it
      return E.map(clearEvent, () => "");
    });

    subscribe(inputValue, (value: string) => {
      values.push(value);
    });

    expect(values).toEqual(["initial"]);

    emitClear();
    expect(values).toEqual(["initial", ""]);

    emitClear();
    expect(values).toEqual(["initial", "", ""]);
  });

  it('fixWith should handle circular dependencies with result', () => {
    const values: string[] = [];

    // Simulate input field pattern
    const {
      reactive: inputValue,
      result: { element, trigger },
    } = fixWith<string, { element: string; trigger: () => void }>("initial", (value) => {
      // Simulate creating an element with the reactive value
      // Don't immediately evaluate value - just use it for wiring
      const element = "input-element";

      // Create a trigger that simulates user action
      const [actionEvent, emitAction] = E.create<void>();

      // Update event clears the input
      const update = E.map(actionEvent, () => "cleared");

      return {
        result: {
          element,
          trigger: emitAction,
        },
        update,
      };
    });

    subscribe(inputValue, (value: string) => {
      values.push(value);
    });

    expect(values).toEqual(["initial"]);

    // Trigger the action
    trigger();
    expect(values).toEqual(["initial", "cleared"]);
  });
});
