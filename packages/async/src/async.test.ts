import { describe, it, expect, vi } from 'vitest';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';
import { fromPromise, resource, retry, timeout, fromEvent } from './async';
import type { Async } from './async';

/** A promise you resolve/reject by hand, for deterministic ordering. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush microtasks (and the macrotask queue) so settled promises propagate. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('fromPromise (Layer 1 — one promise as a reactive)', () => {
  it('starts loading, then resolves to success', async () => {
    const d = deferred<number>();
    const state = fromPromise(() => d.promise);

    expect(R.get(state)).toEqual({ status: 'loading' });

    d.resolve(42);
    await tick();
    expect(R.get(state)).toEqual({ status: 'success', data: 42 });
  });

  it('settles to error on rejection', async () => {
    const d = deferred<number>();
    const state = fromPromise(() => d.promise);

    d.reject(new Error('boom'));
    await tick();
    const s = R.get(state) as Extract<Async<number>, { status: 'error' }>;
    expect(s.status).toBe('error');
    expect((s.error as Error).message).toBe('boom');
  });

  it('settles to error on a synchronous throw', async () => {
    const state = fromPromise<number>(() => {
      throw new Error('sync');
    });
    await tick();
    expect((R.get(state) as { status: string }).status).toBe('error');
  });

  it('aborts the signal and ignores a late result when disposed', async () => {
    const d = deferred<number>();
    let signal: AbortSignal | undefined;
    const state = fromPromise((s) => {
      signal = s;
      return d.promise;
    });

    R.cleanup(state); // dispose
    expect(signal!.aborted).toBe(true);

    d.resolve(7); // resolves after disposal
    await tick();
    expect(R.get(state)).toEqual({ status: 'loading' }); // never updated
  });
});

describe('resource (Layer 2 — auto-fetch from a reactive input)', () => {
  it('fetches the initial input value immediately', async () => {
    const res = resource(R.of('a'), (id) => Promise.resolve(`got:${id}`));

    expect(R.get(res.data)).toEqual({ status: 'loading' });
    await tick();
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'got:a' });
  });

  it('refetches when the input changes, dropping the stale response', async () => {
    const [setReq, set] = makeSource('a');
    const calls: Record<string, ReturnType<typeof deferred<string>>> = {};

    const res = resource(setReq, (id, signal) => {
      const d = deferred<string>();
      calls[id] = d;
      signal.addEventListener('abort', () =>
        d.reject(new DOMException('aborted', 'AbortError')),
      );
      return d.promise;
    });

    set('b'); // aborts 'a', starts 'b'

    // 'a' resolves late — it must be ignored (its signal was aborted).
    calls['a'].resolve('A');
    calls['b'].resolve('B');
    await tick();

    expect(R.get(res.data)).toEqual({ status: 'success', data: 'B' });
  });

  it('works with a mapped (derived) input — proves the fetch is a graph node', async () => {
    const [loc, setLoc] = makeSource({ path: '/users/1' });
    const id = R.map(loc, (u) => u.path.split('/')[2]);
    const res = resource(id, (uid) => Promise.resolve(`user:${uid}`));

    await tick();
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'user:1' });

    setLoc({ path: '/users/2' });
    await tick();
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'user:2' });
  });

  it('refetch() re-runs against the current input', async () => {
    const fetcher = vi.fn((id: string) => Promise.resolve(`v:${id}`));
    const res = resource(R.of('x'), fetcher);

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    res.refetch();
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'v:x' });
  });

  it('surfaces a validation throw inside the fetcher as error (zod-style)', async () => {
    const parse = (raw: unknown) => {
      if (typeof raw !== 'number') throw new Error('expected number');
      return raw;
    };
    const res = resource(R.of('/n'), async () => parse('not-a-number'));

    await tick();
    expect((R.get(res.data) as { status: string }).status).toBe('error');
  });

  it('dispose aborts in-flight work and stops reacting to the input', async () => {
    const fetcher = vi.fn((id: string, signal: AbortSignal) => {
      const d = deferred<string>();
      signal.addEventListener('abort', () => d.reject(new Error('aborted')));
      return d.promise;
    });
    const [input, set] = makeSource('a');
    const res = resource(input, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    res.dispose();

    set('b'); // no fetch after disposal
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('resource — keepPreviousData', () => {
  it('keeps the last data visible while a new request is in flight', async () => {
    const [input, set] = makeSource('a');
    const calls: Record<string, ReturnType<typeof deferred<string>>> = {};
    const res = resource(
      input,
      (id, signal) => {
        const d = deferred<string>();
        calls[id] = d;
        signal.addEventListener('abort', () =>
          d.reject(new DOMException('aborted', 'AbortError')),
        );
        return d.promise;
      },
      { keepPreviousData: true },
    );

    calls['a'].resolve('A');
    await tick();
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'A' });

    set('b'); // reloading — previous data 'A' stays visible
    expect(R.get(res.data)).toEqual({ status: 'loading', data: 'A' });

    calls['b'].resolve('B');
    await tick();
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'B' });
  });

  it('omits previous data by default (bare loading)', async () => {
    const [input, set] = makeSource('a');
    const calls: Record<string, ReturnType<typeof deferred<string>>> = {};
    const res = resource(input, (id, signal) => {
      const d = deferred<string>();
      calls[id] = d;
      signal.addEventListener('abort', () => d.reject(new Error('aborted')));
      return d.promise;
    });

    calls['a'].resolve('A');
    await tick();
    set('b');
    expect(R.get(res.data)).toEqual({ status: 'loading' });
  });
});

describe('resource — refetch is composition, not a feature', () => {
  it('refetches when a trigger event is folded into the input', async () => {
    // The trigger re-emits the current request — `resource` just fetches on
    // every input emit, so no refetch parameter is needed.
    const fetcher = vi.fn((id: string) => Promise.resolve(`v:${id}`));
    const base = R.of('a');
    const [poke, fire] = E.create<void>();
    const input = E.stepper(
      E.mergeAll([base.changes, E.tag(poke, base)]),
      R.get(base),
    );

    const res = resource(input, fetcher);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    fire();
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2); // refetched the same value
    expect(R.get(res.data)).toEqual({ status: 'success', data: 'v:a' });
    res.dispose();
  });

  it('combines multiple triggers with mergeAll into one refetch source', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    const base = R.of('a');
    const [a, fireA] = E.create<void>();
    const [b, fireB] = E.create<void>();
    const triggers = E.mergeAll<void>([a, b]); // the combinator
    const input = E.stepper(
      E.mergeAll([base.changes, E.tag(triggers, base)]),
      R.get(base),
    );

    const res = resource(input, fetcher);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    fireA();
    await tick();
    fireB();
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(3);
    res.dispose();
  });

  it('polls by feeding delayed settle events back into the input (no built-in interval)', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    const base = R.of('a');

    // Feedback loop: N ms after each settle, re-emit the input → refetch.
    const [tick, fireTick] = E.create<void>();
    const input = E.stepper(
      E.mergeAll([base.changes, E.tag(tick, base)]),
      R.get(base),
    );
    const res = resource(input, fetcher);
    const settled = E.filter(res.data.changes, (s) => s.status !== 'loading');
    const pokes = E.delay(settled, 10);
    const stop = E.subscribe(pokes, () => fireTick());

    await vi.waitFor(() =>
      expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3),
    );

    stop();
    E.cleanup(pokes);
    res.dispose();
    const after = fetcher.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(fetcher.mock.calls.length).toBe(after); // loop stopped
  });
});

describe('fromEvent (DOM event → frp Event bridge)', () => {
  it('emits on the DOM event and removes the listener on cleanup', () => {
    const target = new EventTarget();
    const ev = fromEvent(target, 'ping');
    const seen: string[] = [];
    const unsub = E.subscribe(ev, (e) => seen.push(e.type));

    target.dispatchEvent(new Event('ping'));
    expect(seen).toEqual(['ping']);

    unsub();
    E.cleanup(ev);
    target.dispatchEvent(new Event('ping'));
    expect(seen).toEqual(['ping']); // listener gone
  });

  it('feeds a DOM event into a resource refetch via the input', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    const base = R.of('a');
    const online = fromEvent(window, 'online');
    const input = E.stepper(
      E.mergeAll([base.changes, E.tag(online, base)]),
      R.get(base),
    );

    const res = resource(input, fetcher);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('online'));
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    res.dispose();
  });
});

describe('retry (fetcher combinator)', () => {
  it('retries failures up to `times`, then succeeds', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n <= 2) throw new Error('fail');
      return 'ok';
    });
    const wrapped = retry(fn, { times: 3, delay: 0 });

    const result = await wrapped('x', new AbortController().signal);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('stops retrying once the signal is aborted', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fail');
    });
    const wrapped = retry(fn, { times: 5, delay: 50 });
    const ctrl = new AbortController();

    const p = wrapped('x', ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1); // never retried after abort
  });

  it('honors shouldRetry', async () => {
    const fn = vi.fn(async () => {
      throw new Error('nope');
    });
    const wrapped = retry(fn, { times: 5, delay: 0, shouldRetry: () => false });
    await expect(wrapped('x', new AbortController().signal)).rejects.toThrow(
      'nope',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('timeout (fetcher combinator)', () => {
  it('passes through a fast result untouched', async () => {
    const fast = () => Promise.resolve('ok');
    expect(await timeout(fast, 1000)('x', new AbortController().signal)).toBe(
      'ok',
    );
  });

  it('aborts a slow request with a TimeoutError', async () => {
    const slow = (_req: string, signal: AbortSignal) =>
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    await expect(
      timeout(slow, 10)('x', new AbortController().signal),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('composes inside a resource and surfaces timeout as error state', async () => {
    const slow = (_req: string, signal: AbortSignal) =>
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    const res = resource(R.of('a'), timeout(slow, 10));
    await vi.waitFor(() =>
      expect((R.get(res.data) as { status: string }).status).toBe('error'),
    );
    res.dispose();
  });
});

/** A writable reactive source: returns [reactive, setValue]. */
function makeSource<T>(initial: T): [R.Reactive<T>, (v: T) => void] {
  const [ev, emit] = E.create<T>();
  const reactive = E.stepper(ev, initial);
  return [reactive, emit];
}
