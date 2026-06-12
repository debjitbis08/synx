import type { Event } from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";
import { isReactive } from "@synx/frp/reactive";
import { registry } from "./registry";

/**
 * Label a derived FRP node for use with trace sessions.
 * Registers in the global registry so sessions with `useRegistry: true` can find it.
 * Returns the target unchanged (passthrough).
 */
export function label<A>(name: string, target: Event<A>): Event<A>;
export function label<A>(name: string, target: Reactive<A>): Reactive<A>;
export function label<A>(
  name: string,
  target: Event<A> | Reactive<A>,
): Event<A> | Reactive<A> {
  registry.register({
    name,
    kind: "derived",
    target,
  });
  return target;
}

/**
 * Label a source event (created with E.create) along with its emitter.
 * This enables session.inject() to push values into the source.
 * Returns the event unchanged (passthrough).
 */
export function labelSource<A>(
  name: string,
  event: Event<A>,
  emit: (value: A) => void,
): Event<A> {
  registry.register({
    name,
    kind: "source",
    target: event,
    emit: emit as (value: unknown) => void,
  });
  return event;
}
