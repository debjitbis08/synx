# `@synx/frp` core review — Event ↔ Reactive

Correctness + performance review of the recursive core: `event.ts`, `reactive.ts`,
`future.ts`, `batch.ts`, `scope.ts`. Every performance claim below is backed by a
measured number; every finding has a matching test in
[`src/core-review.regression.test.ts`](src/core-review.regression.test.ts).

- **[LOCK]** tests guard already-correct behavior (green today).
- **[RED-until-fix]** tests encode desired post-fix behavior (red today → green when fixed).
- **[TRIPWIRE]** tests pin a current cost so a future change is noticed.

Run them: `npx vitest run --config vitest.config.ts packages/frp/src/core-review.regression.test.ts`

Status at review time: **6 passing, 3 failing** (the 3 failures are F1, F2, F3 below).

---

## The recursive model (how the cycle actually works)

Conceptually `Event a = Future (Reactive a)`. `E.create()` wires the knot:

1. `initialEmitValueFuture: Future<A>` — represents the not-yet-emitted first value.
   Subscribers arriving before the first emit are parked in an `onFirstEmit` array;
   subscribers arriving after get `R.get(reactive)` immediately.
2. `future = Future.reactive(initialEmitValueFuture)` = `…map(v => new ReactiveImpl(v))`
   — turns the first value into a `Reactive`.
3. `event = new EventImpl(future.chain(r => … innerFuture = Future.fromReactive(r) …))`
   — the first `r` produced becomes *the* stepper reactive; all subscribers bind to its
   `subscribers` list via `subscribeInternal`.

On the **first** `emit`, the `onFirstEmit` handlers run (each creating a `ReactiveImpl`,
only the first retained), then `reactive.updateValueInternal(value)` dispatches to every
subscriber. The cycle itself is sound; the findings are about *dispatch integrity* and
*allocation/teardown cost* inside it.

---

## Findings

### F1 — Dispatch skips a subscriber when one unsubscribes mid-dispatch  ⟶ **correctness, HIGH**

`ReactiveImpl.updateValueInternal` (`reactive.ts:98`) iterates `subscribers` by index with
a **cached length**:

```ts
const len = subscribers.length;
for (let i = 0; i < len; i++) subscribers[i](newValue);
```

If a handler unsubscribes during dispatch, `subscribeInternal`'s unsub does
`subscribers.splice(idx, 1)` (`reactive.ts:160`), shifting the array under the loop:

- A handler that removes **itself** → the **next** handler is skipped, and the now-stale
  final index reads `undefined` → `TypeError` (swallowed by the per-subscriber try/catch).
- Measured: with subscribers `[A, B, C]` where `A` removes itself, dispatch produces
  `["A", "C"]` — **`B` is silently dropped.**

**Fix:** snapshot the list before dispatch (`const subs = subscribers.slice()` for
`len > 1`, or iterate a copy). Cost is one array copy per multi-subscriber dispatch;
weigh against making removal mark-and-sweep if dispatch is hot.

**Test:** `F1 … must not skip other subscribers [RED-until-fix]` (+ `F1b` lock for the
remove-a-later-handler case, which is already correct).

---

### F2 — A throwaway `ReactiveImpl` is allocated on every subscribe after first emit  ⟶ **performance/GC**

`future = initialEmitValueFuture.map(v => new ReactiveImpl(v))`. After the first emit,
every new subscribe re-runs that handler with the current value, allocating a fresh
`ReactiveImpl` that the `chain` immediately discards (it returns the already-captured
`innerFuture`). Only the first reactive is ever kept.

**Measured:** 1000 subscribes after the first emit → **1000** `ReactiveImpl` allocations
(via `R.__private__.debugStats().created`); 999 are garbage.

**Fix:** once `reactive` is established, short-circuit so late subscribers bind directly to
the existing reactive without constructing a new one (e.g. branch in the `chain`/`map`
step on `reactive !== null`).

**Test:** `F2 … must not allocate O(N) reactives [RED-until-fix]`.

---

### F3 — `onFirstEmit` teardown is O(n²); the array is never cleared after first emit  ⟶ **performance, HIGH**

Subscribers that arrive **before** the first emit are stored in `onFirstEmit`, and each
unsubscribe rebuilds the whole array:

```ts
onFirstEmit = onFirstEmit.filter((h) => h !== handler); // event.ts:146
```

That is O(n) per unsubscribe → **O(n²)** to tear them all down. Additionally `emitNow`
**never clears `onFirstEmit`** after the first emit (`event.ts:179-184`), so those handlers
are retained for the lifetime of the event (minor leak) and still pay the filter cost on
unsubscribe.

**Measured (this machine), pre-emit subscribe then mass unsubscribe:**

| N      | total teardown | per-unsub | ms / N² (flat ⇒ quadratic) |
|--------|---------------:|----------:|---------------------------:|
| 2,000  |       33.8 ms  |  16.9 µs  | 8.45 |
| 4,000  |       82.9 ms  |  20.7 µs  | 5.18 |
| 8,000  |      322.7 ms  |  40.3 µs  | 5.04 |
| 16,000 |    1,419.8 ms  |  88.7 µs  | 5.55 |

`ms/N²` is roughly constant and per-unsub doubles as N doubles → textbook O(n²).
**16k pre-emit subscribers take ~1.4 s to dispose.**

**Fix:** store `onFirstEmit` handlers in a `Set` (O(1) delete), and clear it after the
first emit.

**Test:** `F3 … stays sub-quadratic [RED-until-fix]` (coarse wall-clock guard, 300 ms
threshold; currently ~1.9 s in CI).

---

### F4 — `R.map` has no multicast: map fn re-runs per subscriber per change  ⟶ **performance, design**

`R.map` (`reactive.ts:245`) builds a lazy *fused* derivation: it stores `{source, map}` and
recomputes in `get()` and inside each subscriber wrapper in `subscribeInternal`
(`reactive.ts:138-146`). There is no shared cache, so:

- With **S** subscribers, the map fn runs **S times** per source change (measured: 50
  subscribers → 50 invocations for one change), and `currentValue` is written S times.

This is an intentional trade-off (cheap construction, fused chains, no per-node bookkeeping),
but it surprises on fan-out. **Decision needed:** keep as-is (document it) vs. add opt-in
multicast/caching for shared mapped reactives.

**Test:** `F4 [TRIPWIRE]` pins the current `calls === S` so the behavior change is visible
if multicast is ever added (flip the expectation to `1`).

---

### F6 — `E.stepper` silently creates live duplicate reactives  ⟶ **correctness/leak, MEDIUM**

`stepper` (`event.ts:268-279`) memoizes in a single `_stepper` slot keyed on
`initial ===`. A second call on the same event with a **different** initial silently
builds a second `ReactiveImpl`, subscribes it to the event, and **overwrites `_stepper`**:

```ts
if (impl._stepper && impl._stepper.initial === initial) return impl._stepper.reactive;
const reactive = R.create(initial, ev);   // subscribes to ev
impl._stepper = { reactive, initial };     // orphans the previous one
```

**Measured:**
- Different initial → **2 distinct reactives**; after `emit(7)` the orphaned first one
  still reads `7` — i.e. it remained **subscribed and live**, just unreachable.
- `E.cleanup(ev)` severs only `_stepper.reactive`, so the orphan is never torn down.
- **Object initials** (`{n:0}` twice) → `===` fails every time → a new reactive **per call**.
- 5 calls with distinct initials → 5 live steppers, all updated to `100` on one emit.

All 14 real `stepper` call sites in the repo call it once per event, so nothing relies on
the multi-initial behavior — it is pure hazard.

**Fix:** memoize one stepper per event; bind `initial` on the first call and reuse
thereafter (or dev-warn/throw on a conflicting initial). The single-slot `_stepper` and the
cleanup path already assume one stepper per event.

**Tests:** `F6a` (no orphaned live duplicate, RED), `F6b` (object initials don't multiply,
RED), `F6c` (same primitive initial already memoized, LOCK).

---

### F7 — `R.cleanup` does not cascade to an owned `.changes` event  ⟶ **cleanup contract, MEDIUM-low**

`R.cleanup` (`reactive.ts:226`) runs the reactive's own `cleanupFns` and clears
`subscribers`, but never touches `this.changeEvent`. The `.changes` event comes in two
flavors:

- **Owned** — created lazily by the getter `new EventImpl(Future.fromReactive(this))`
  (`reactive.ts:91-96`) for reactives with no source event (e.g. a `fold`/`R.of` result).
- **Source** — for a `stepper`, the constructor stores the *source* event as `changeEvent`,
  so **`r.changes === ev`** (verified). It is shared upstream, not owned.

**Measured:** for an owned `.changes` event, after `R.cleanup(r)`: its `onCleanup` handlers
**do not run** (ran = 0) and it is **never marked cleaned** (`__debugCleaned` stays false).
So any teardown attached via `E.onCleanup(r.changes, …)` silently leaks. (No hard memory
leak from the r↔event cycle — a cycle-collecting GC reclaims it — but the cleanup *contract*
is broken.)

Note the asymmetry: the **Event→Reactive** direction *does* cascade
(`EventImpl.internalCleanup` calls `R.cleanup(_stepper.reactive)`), but **Reactive→Event**
does not.

**Fix:** track whether `changeEvent` is owned (set a flag only in the `changes` getter) and,
in `R.cleanup`, `E.cleanup(changeEvent)` **only when owned**. Must not clean a stepper's
shared source event. (Safe from recursion: an owned changes event has no `_stepper`, so
`E.cleanup` on it won't re-enter the reactive.)

**Tests:** `F7a` (owned changes event onCleanup fires on R.cleanup, RED), `F7b` (stepper's
shared source is NOT torn down from downstream, LOCK).

---

### F5 — `mapDerivation.teardown` is dead code  ⟶ **cleanup, low**

`teardown` is declared (`reactive.ts:45, 67`) and read (`reactive.ts:163, 184`) but **never
assigned anywhere** in the repo. Two consequences:

- The unsubscribe block `if (subscribers.length === 0 && this.mapDerivation?.teardown)`
  (`reactive.ts:163-165`) is **doubly dead**: `teardown` is always `undefined`, *and* that
  closure lives on the non-`mapDerivation` path (the `if (this.mapDerivation)` branch
  `return`s early at `:145`), so `this.mapDerivation` is always `undefined` there anyway.
- `if (impl.mapDerivation && !impl.mapDerivation.teardown)` (`reactive.ts:184`) reduces to
  `if (impl.mapDerivation)` — misleading as written.

**Fix:** drop the `teardown?` field, delete the `:163-165` block, simplify `:184`.

---

## Secondary observations (not yet tested)

- **`initialValue` is write-only** (`event.ts:178`) — assigned, never read. Dead variable.
- **`ap`/`chain` (`reactive.ts:327-368`)** notify via `result.subscribers.forEach(fn => fn(v))`
  instead of `updateValueInternal`, bypassing the per-subscriber try/catch and sharing F1's
  mutate-during-iteration hazard (here `forEach` snapshots length differently but a removal
  still shifts).
- **`debounce`/`throttle` use `window.setTimeout`** (`event.ts:701, 742`) — breaks under
  non-DOM (Node/worker) hosts; `delay` correctly uses bare `setTimeout`.
- **`batch` context restore is microtask-ordered** (`batch.ts:117-122`) — worth a dedicated
  correctness pass for nested/interleaved batches (out of scope for this round).

---

## TODO — tracked work

### Fixes (each has a red test that turns green)
- [ ] **F1** Snapshot subscriber list in `updateValueInternal` before dispatch (HIGH, correctness).
- [ ] **F3** Back `onFirstEmit` with a `Set` and clear it after first emit (HIGH, perf + leak).
- [ ] **F2** Skip throwaway `ReactiveImpl` allocation for post-first-emit subscribers (perf/GC).
- [ ] **F6** Memoize one stepper per event (bind `initial` on first call); stop silently
  orphaning live duplicate reactives (MEDIUM, correctness/leak).
- [ ] **F7** `R.cleanup` cascades to an *owned* `.changes` event only (flag ownership in the
  getter); never tear down a stepper's shared source (MEDIUM-low, cleanup contract).
- [ ] **F5** Remove dead `mapDerivation.teardown` field + its two read sites (cleanup).

### Decision
- [ ] **F4** Decide whether `R.map` should multicast/cache, or document the per-subscriber
  recompute cost as intended. Flip the F4 tripwire expectation if multicast lands.

### Secondary (write tests, then fix)
- [ ] Remove write-only `initialValue` in `E.create`.
- [ ] Route `ap`/`chain` notifications through `updateValueInternal` (error guard + F1 fix).
- [ ] Replace `window.setTimeout` with `setTimeout` in `debounce`/`throttle` (non-DOM hosts).
- [ ] Dedicated correctness pass on `batch` nesting / microtask-ordered context restore.

### Verification
- [ ] After each fix: re-run `core-review.regression.test.ts` (RED → green) and the full
  suite (`pnpm test`) for regressions; re-run `pnpm bench` to confirm the F3 scaling table
  flattens to linear.
