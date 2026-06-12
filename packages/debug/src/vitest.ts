import { expect } from "vitest";
import type { TraceSession } from "./session";

// Minimal shape of the matcher context vitest binds as `this`.
interface MatcherCtx {
  isNot: boolean;
  equals(a: unknown, b: unknown): boolean;
  utils: {
    printExpected(value: unknown): string;
    printReceived(value: unknown): string;
  };
}

function emitted(session: TraceSession, nodeName: string): unknown[] {
  return session
    .trace()
    .filter((e) => e.nodeName === nodeName && e.kind !== "inject")
    .map((e) => e.nextValue);
}

expect.extend({
  toHaveEmitted(
    this: MatcherCtx,
    received: TraceSession,
    nodeName: string,
    value: unknown,
  ) {
    const values = emitted(received, nodeName);
    const pass = values.some((v) => this.equals(v, value));
    return {
      pass,
      message: () =>
        `expected "${nodeName}" ${this.isNot ? "not " : ""}to have emitted ` +
        `${this.utils.printExpected(value)}` +
        (this.isNot
          ? ""
          : `\nemissions: ${this.utils.printReceived(values)}`),
    };
  },

  toNotHaveEmitted(
    this: MatcherCtx,
    received: TraceSession,
    nodeName: string,
  ) {
    const values = emitted(received, nodeName);
    const pass = values.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected "${nodeName}" to have emitted, but it did not`
          : `expected "${nodeName}" not to have emitted, but it emitted ` +
            `${this.utils.printReceived(values)}`,
    };
  },

  toHaveHistory(
    this: MatcherCtx,
    received: TraceSession,
    nodeName: string,
    expectedValues: unknown[],
  ) {
    const values = emitted(received, nodeName);
    const pass = this.equals(values, expectedValues);
    return {
      pass,
      message: () =>
        `expected "${nodeName}" history ${this.isNot ? "not " : ""}to equal ` +
        `${this.utils.printExpected(expectedValues)}` +
        (this.isNot
          ? ""
          : `\nreceived: ${this.utils.printReceived(values)}`),
    };
  },

  toHaveLastEmitted(
    this: MatcherCtx,
    received: TraceSession,
    nodeName: string,
    value: unknown,
  ) {
    const values = emitted(received, nodeName);
    const last = values.length > 0 ? values[values.length - 1] : undefined;
    const pass = this.equals(last, value);
    return {
      pass,
      message: () =>
        `expected "${nodeName}" last emission ${this.isNot ? "not " : ""}to equal ` +
        `${this.utils.printExpected(value)}` +
        (this.isNot ? "" : `\nreceived: ${this.utils.printReceived(last)}`),
    };
  },
});

interface SynxMatchers<R = unknown> {
  toHaveEmitted(nodeName: string, value: unknown): R;
  toNotHaveEmitted(nodeName: string): R;
  toHaveHistory(nodeName: string, values: unknown[]): R;
  toHaveLastEmitted(nodeName: string, value: unknown): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends SynxMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends SynxMatchers {}
}
