import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';
import type { Reactive } from '@synx/frp/reactive';
import type { Event as FrpEvent } from '@synx/frp/event';

/**
 * The state of an async computation, as a plain discriminated union: it narrows
 * cleanly (`if (s.status === 'success') s.data`) and carries no framework
 * machinery, so it serializes and composes like any other value.
 *
 * `loading` and `error` may carry `data` — the last successful value — but only
 * when {@link ResourceOptions.keepPreviousData} is on; otherwise it's absent.
 * `success.data` is always present.
 *
 * There is deliberately **no validation** here. If you want a parsed/typed
 * result, parse inside your fetcher — e.g. `UserSchema.parse(await res.json())`
 * with Zod/Valibot/ArkType. A throw (or rejection) becomes the `error` state,
 * so validation failures flow through the same channel as network failures.
 */
export type Async<T> =
  | { readonly status: 'loading'; readonly data?: T }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown; readonly data?: T };

/**
 * Layer 1 — bridge a single promise into a `Reactive<Async<T>>`. This is the
 * irreducible primitive: the reactive starts `loading`, then settles to
 * `success` / `error`.
 *
 * `run` receives an `AbortSignal` (the browser's own cancellation primitive);
 * pass it straight to `fetch`. Cancellation is tied to the graph's lifecycle —
 * when the reactive is cleaned up the request is aborted, so there is no
 * separate handle you must remember to call.
 *
 *   const config = fromPromise((signal) =>
 *     fetch('/api/config', { signal }).then((r) => r.json()),
 *   );
 *   R.subscribe(config, (s) => { ... });
 */
export function fromPromise<T>(
  run: (signal: AbortSignal) => Promise<T> | T,
): Reactive<Async<T>> {
  const controller = new AbortController();
  const [changed, emit] = E.create<Async<T>>();
  const state = E.stepper<Async<T>>(changed, { status: 'loading' });

  settle(() => run(controller.signal), controller.signal, emit);
  R.onCleanup(state, () => controller.abort());

  return state;
}

export interface ResourceOptions {
  /**
   * Keep the previous successful `data` visible on `loading` and `error` while
   * a new request is in flight, instead of dropping back to a bare `loading`.
   * Avoids the spinner flash on every keystroke / route change.
   */
  keepPreviousData?: boolean;
}

// There is no refetch option at all. `resource` refetches whenever `input`
// emits, so every trigger is just an event you fold into `input`:
//   - focus / reconnect / a click → `E.tag(trigger, req)` (re-emit the request)
//   - several triggers           → combine with `E.mergeAll`
//   - polling (N ms after settle) → a feedback loop: delay the settle events
//     and feed them back in — `E.delay(res.data.changes, ms)` → re-emit input.
// See the README for the polling recipe.

export interface Resource<T> {
  /** The async state as a reactive — map / fold / subscribe like any other. */
  readonly data: Reactive<Async<T>>;
  /** Re-run the fetcher against the input's current value (manual reload). */
  refetch(): void;
  /** Abort any in-flight request and tear down listeners + subscription. */
  dispose(): void;
}

/**
 * Layer 2 — auto-fetching driven by a reactive input. `input` is a node in the
 * graph; subscribing to it fires immediately (the initial fetch) and again on
 * every change (auto-refetch) — so fetching is part of the reactive chain
 * itself, not an effect wired up alongside it. The result is a `Reactive`, so
 * you keep composing.
 *
 *   const id = R.map(loc.url, (u) => matchPath('/users/:id', u.pathname)?.id);
 *   const user = resource(
 *     id,
 *     (id, signal) => fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
 *     { keepPreviousData: true },
 *   );
 *
 * Cancellation is automatic: a fresh input value aborts the in-flight request,
 * and a stale response (one resolving after a newer request started) is dropped
 * because its `AbortSignal` is already aborted.
 *
 * Compose `retry` / `timeout` around the fetcher for resilience; they transform
 * the request and leave `resource` itself lean.
 */
export function resource<Req, T>(
  input: Reactive<Req>,
  fetcher: (req: Req, signal: AbortSignal) => Promise<T> | T,
  options: ResourceOptions = {},
): Resource<T> {
  const keepPrev = options.keepPreviousData ?? false;
  const [changed, emit] = E.create<Async<T>>();
  const state = E.stepper<Async<T>>(changed, { status: 'loading' });

  let controller: AbortController | null = null;
  let lastData: T | undefined;
  let hasData = false;

  const load = (req: Req) => {
    controller?.abort(); // cancel whatever is in flight
    controller = new AbortController();
    const signal = controller.signal;
    emit(
      keepPrev && hasData
        ? { status: 'loading', data: lastData }
        : { status: 'loading' },
    );
    settle(
      () => fetcher(req, signal),
      signal,
      (next) => {
        if (next.status === 'success') {
          lastData = next.data;
          hasData = true;
          emit(next);
        } else if (next.status === 'error') {
          emit(
            keepPrev && hasData
              ? { status: 'error', error: next.error, data: lastData }
              : next,
          );
        } else {
          emit(next); // settle never emits loading, but stay total
        }
      },
    );
  };

  const reload = () => load(R.get(input));

  // Subscribing fires once with the current value (initial fetch) and again on
  // every change (auto-refetch). The fetch is therefore a derived node, not a
  // side effect bolted onto the chain.
  const unsub = R.subscribe(input, load);

  R.onCleanup(state, () => {
    controller?.abort();
    unsub();
    E.cleanup(changed);
  });

  return {
    data: state,
    refetch: reload,
    dispose: () => R.cleanup(state),
  };
}

export interface RetryOptions {
  /** Number of retries after the first attempt (default 3). */
  times?: number;
  /**
   * Delay before each retry in ms — a fixed number, or a function of the
   * zero-based attempt index. Default: exponential backoff capped at 30s.
   */
  delay?: number | ((attempt: number) => number);
  /** Decide per-error whether to retry (default: always, until `times`). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Wrap a fetcher so failed attempts are retried with backoff. Composes around
 * any fetcher and returns one with the same shape:
 *
 *   resource(id, retry(load, { times: 3 }));
 *
 * Retries stop the moment the request's `AbortSignal` aborts (input changed or
 * disposed), so a superseded request never keeps retrying in the background.
 */
export function retry<Req, T>(
  fetcher: (req: Req, signal: AbortSignal) => Promise<T> | T,
  options: RetryOptions = {},
): (req: Req, signal: AbortSignal) => Promise<T> {
  const times = options.times ?? 3;
  const delayOpt = options.delay;
  const delayFor =
    typeof delayOpt === 'function'
      ? delayOpt
      : (attempt: number) => delayOpt ?? Math.min(1000 * 2 ** attempt, 30_000);

  return async (req, signal) => {
    let attempt = 0;
    for (;;) {
      try {
        return await fetcher(req, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        if (attempt >= times) throw error;
        if (options.shouldRetry && !options.shouldRetry(error, attempt)) {
          throw error;
        }
        await sleep(delayFor(attempt), signal);
        attempt += 1;
      }
    }
  };
}

/**
 * Wrap a fetcher so it aborts after `ms` — built from the platform's own
 * `AbortSignal.any` + `AbortSignal.timeout`. The composed signal fires when
 * EITHER the resource's signal or the timeout does, so a timeout surfaces as an
 * `error` state (a `TimeoutError`) while still respecting upstream cancellation.
 *
 *   resource(id, timeout(load, 5000));
 */
export function timeout<Req, T>(
  fetcher: (req: Req, signal: AbortSignal) => Promise<T> | T,
  ms: number,
): (req: Req, signal: AbortSignal) => Promise<T> {
  return async (req, signal) => {
    const composed = AbortSignal.any([signal, AbortSignal.timeout(ms)]);
    return await fetcher(req, composed);
  };
}

/**
 * Bridge a DOM event into an frp `Event` — the building block for refetch
 * triggers (and useful well beyond this package). A trigger is just an event,
 * so `refetchOn: fromEvent(window, 'online')` replaces any bespoke "refetch on
 * reconnect" flag. The listener is removed when the event is cleaned up.
 *
 *   resource(id, load, { refetchOn: fromEvent(window, 'online') });
 *
 *   // refetch only when the tab becomes visible (filter the raw event):
 *   const visible = E.filter(
 *     fromEvent(document, 'visibilitychange'),
 *     () => document.visibilityState === 'visible',
 *   );
 */
export function fromEvent<T extends globalThis.Event = globalThis.Event>(
  target: EventTarget,
  type: string,
): FrpEvent<T> {
  const [event, emit] = E.create<T>();
  const handler = (e: globalThis.Event) => emit(e as T);
  target.addEventListener(type, handler);
  E.onCleanup(event, () => target.removeEventListener(type, handler));
  return event;
}

/**
 * Run `work`, mapping its resolution, rejection, or synchronous throw to an
 * `Async` emit. Nothing is emitted once `signal` is aborted, so a superseded or
 * disposed request stays silent (including the `AbortError` from `fetch`).
 */
function settle<T>(
  work: () => Promise<T> | T,
  signal: AbortSignal,
  emit: (state: Async<T>) => void,
): void {
  let pending: Promise<T> | T;
  try {
    pending = work();
  } catch (error) {
    if (!signal.aborted) emit({ status: 'error', error });
    return;
  }
  Promise.resolve(pending).then(
    (data) => {
      if (!signal.aborted) emit({ status: 'success', data });
    },
    (error) => {
      if (!signal.aborted) emit({ status: 'error', error });
    },
  );
}

/** A cancellable delay: rejects with the signal's reason if aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(signal.reason);
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
