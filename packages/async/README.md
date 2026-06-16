# @synx/async

> An async operation is not something you orchestrate on the side — it's a
> **source you transform**. A `fetch` becomes a `Reactive<Async<T>>`; loading,
> success, and error are just values it moves through.

Pure FRP — depends only on `@synx/frp` (`Event` + `Reactive`, nothing else),
no DOM, no validation library, no cache framework. Two layers, each usable on
its own.

## `Async<T>` — the state

A plain discriminated union, so it narrows cleanly and carries no machinery:

```ts
type Async<T> =
  | { status: 'loading'; data?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown; data?: T };
```

`success.data` is always present. `loading`/`error` carry the previous `data`
only when `keepPreviousData` is on (see below); otherwise it's absent.

There is **no validation built in** — by design. Parse inside your fetcher with
whatever library you like; a throw or rejection becomes the `error` state:

```ts
import { z } from 'zod';
const User = z.object({ id: z.number(), name: z.string() });

resource(id, async (id, signal) => {
  const res = await fetch(`/api/users/${id}`, { signal });
  return User.parse(await res.json()); // invalid data → error state
});
```

## Layer 1 — `fromPromise`: one promise as a reactive

The irreducible primitive. Starts `loading`, settles to `success` / `error`.
The callback gets an `AbortSignal` (the browser's own cancellation unit); when
the reactive is cleaned up, the request is aborted — cancellation is tied to the
graph's lifecycle, not a handle you have to remember.

```ts
import { fromPromise } from '@synx/async';
import * as R from '@synx/frp/reactive';

const config = fromPromise((signal) =>
  fetch('/api/config', { signal }).then((r) => r.json()),
);

R.subscribe(config, (s) => {
  if (s.status === 'success') console.log(s.data);
});
```

## Layer 2 — `resource`: auto-fetch from a reactive input

`input` is a node in the graph. Subscribing to it fires immediately (the
initial fetch) and again on every change (auto-refetch) — so **fetching is part
of the reactive chain itself**, not an effect wired up alongside it. The result
is a `Reactive`, so you keep composing.

```ts
import { resource } from '@synx/async';
import { matchPath } from '@synx/router';
import * as R from '@synx/frp/reactive';

const id = R.map(loc.url, (u) => matchPath('/users/:id', u.pathname)?.id);

const user = resource(id, (id, signal) =>
  fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
);
// → { data: Reactive<Async<T>>, refetch(), dispose() }
```

**Cancellation is automatic.** A new input value aborts the in-flight request;
a stale response (one resolving after a newer request started) is dropped
because its `AbortSignal` is already aborted. You never see an `AbortError`.

### Options

```ts
resource(input, fetcher, { keepPreviousData: true });
```

`keepPreviousData` is the only option, and the one most felt day-to-day: typing
in a search box keeps the old results on screen while the next request runs,
instead of flashing back to `loading`. **There is no refetch option of any
kind** — every refetch is composition (below).

### Refetching on an event is composition, not a feature

`resource` refetches whenever `input` emits — so to refetch on focus, reconnect,
a websocket ping, or a button click, **re-emit the input**. There's no
`refetchOn` option, because `Event` + `Reactive` already express it:

```ts
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// `tag` stamps each trigger with the current request; `mergeAll` combines
// many triggers into one; `stepper` turns it back into the input reactive.
function refetchOn<T>(req: Reactive<T>, ...triggers: E.Event<unknown>[]): Reactive<T> {
  return E.stepper(
    E.mergeAll([req.changes, E.tag(E.mergeAll(triggers), req)]),
    R.get(req),
  );
}

const online = fromEvent(window, 'online');
const visible = E.filter(
  fromEvent(document, 'visibilitychange'),
  () => document.visibilityState === 'visible',
);

const user = resource(refetchOn(id, online, visible), load);
```

That `refetchOn` is ~5 lines of pure frp you write once (or lift into
`@synx/frp`) — not something this package needs to bake in. `fromEvent(target,
type)` is the one small bridge provided here: a DOM event as an frp `Event`,
listener removed on cleanup.

#### Polling is the same idea — a feedback loop

Completion-relative polling ("refetch N ms *after* each request settles", so
slow requests never overlap) is just refetch-on-event where the event is the
resource's own settle, time-shifted by `E.delay`. It's a feedback loop —
`input → resource → settle → delay → input` — so you tie the knot with a
trigger event (the TS-awkward bit you flagged: the value flows in a circle):

```ts
function poll<Req, T>(base: Reactive<Req>, fetcher, ms: number): Resource<T> {
  const [tick, fireTick] = E.create<void>();           // the knot
  const input = E.stepper(
    E.mergeAll([base.changes, E.tag(tick, base)]),
    R.get(base),
  );
  const res = resource<Req, T>(input, fetcher);
  const settled = E.filter(res.data.changes, (s) => s.status !== 'loading');
  const pokes = E.delay(settled, ms);                  // N ms after each settle
  const stop = E.subscribe(pokes, () => fireTick());   // …re-emit the input
  R.onCleanup(res.data, () => {
    stop();
    E.cleanup(pokes);
    E.cleanup(tick);
  });
  return res;
}
```

`E.delay(ev, ms)` is the one new primitive this needed — a generic time-shift
combinator, now in `@synx/frp`. Polling itself stays out of `resource`.

### Resilience — `retry` and `timeout` (compose around the fetcher)

These transform the *request*, so they wrap the fetcher rather than living
inside `resource` — stack them however you like:

```ts
import { resource, retry, timeout } from '@synx/async';

const load = (id, signal) =>
  fetch(`/api/users/${id}`, { signal }).then((r) => r.json());

resource(id, retry(timeout(load, 5_000), { times: 3 }));
```

- **`timeout(fetcher, ms)`** — aborts after `ms`, built from the platform's own
  `AbortSignal.any([signal, AbortSignal.timeout(ms)])`. A timeout becomes an
  `error` state (a `TimeoutError`); upstream cancellation still works.
- **`retry(fetcher, { times?, delay?, shouldRetry? })`** — retries failures with
  backoff (default: exponential, capped at 30s). Stops immediately once the
  request is aborted, so a superseded request never keeps retrying.

### Rendering — it's just a reactive

Fine-grained, bind a single attribute/text node:

```ts
import { span } from '@synx/dom/tags';

span({
  text: R.map(user.data, (s) =>
    s.status === 'loading' ? 'Loading…'
    : s.status === 'error' ? 'Failed'
    : s.data.name,
  ),
});
```

Or swap a whole node with `@synx/router/view`'s `view`:

```ts
view(R.map(user.data, (s) =>
  s.status === 'loading' ? spinner()
  : s.status === 'error' ? errorView(s.error)
  : userView(s.data),
));
```

## API summary

| Layer | Piece | Shape |
| --- | --- | --- |
| 1 | `fromPromise(run)` | `(signal) => Promise<T>` → `Reactive<Async<T>>` |
| 2 | `resource(input, fetcher, options?)` | `Reactive<Req>` + `(req, signal) => Promise<T>` → `{ data, refetch, dispose }` |
| — | `retry(fetcher, options?)` | fetcher → fetcher (retry with backoff) |
| — | `timeout(fetcher, ms)` | fetcher → fetcher (abort after `ms`) |
| — | `fromEvent(target, type)` | `EventTarget` + type → frp `Event` (compose into `input`) |

## How this honors Pattern #1 ("rely on existing DOM/browser patterns")

| Piece | Platform API it mirrors |
| --- | --- |
| `fetcher(req, signal)` | `fetch(input, { signal })` — you pass the real signal |
| cancellation | `AbortController` / `AbortSignal`, 1:1 |
| settling | the `Promise` itself — resolve → `success`, reject → `error` |
| validation | none — your schema library, in your fetcher |

The only thing added over the platform is the **`loading → success/error`
reactive** and the rule that a fresh input supersedes the previous request —
because a bare `Promise` has no notion of "still pending" or "replaced."

## Lifetime

`resource` subscribes to its input, so dispose it when done — `res.dispose()`
(or `R.cleanup(res.data)`) aborts any in-flight request and unsubscribes. In a
DOM context, hand `res.dispose` to the current scope so it's torn down with the
view. `fromPromise` aborts when its reactive is cleaned up.

## What's here vs. what's a layer above

Shipped as primitives: stale-while-revalidate (`keepPreviousData`), retries
(`retry`), timeouts (`timeout`), a DOM-event bridge (`fromEvent`), and a
time-shift combinator (`E.delay`, in `@synx/frp`). Refetch-on-anything and
polling are *recipes* composed from these — not options baked into `resource`.

Intentionally **not** here — these are server-state *management*, a job for a
cache layer built on top (keyed by request), not for this primitive:

- **dedup / shared cache** — two callers of the same key sharing one request
- **mutations** — writes with optimistic updates + rollback
- **invalidation** — refetching affected queries after a write

Keeping `resource` a per-input fetch (not a global cache) is what lets that
layer sit cleanly on top instead of being baked in.
