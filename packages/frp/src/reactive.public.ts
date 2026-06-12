export type { Reactive } from './reactive';

import * as raw from './reactive';
import { debuggable } from './debug';

// Node-producing combinators wrapped for debug observation (see
// event.public.ts). `get`/`sample`/`subscribe`/`effect` return values or
// disposers, not nodes, so they are not wrapped.
export const map = debuggable('map', raw.map);
export const ap = debuggable('ap', raw.ap);
export const chain = debuggable('chain', raw.chain);
export const mapEachReactive = debuggable('mapEachReactive', raw.mapEachReactive);

export {
  isReactive,
  of,
  get,
  subscribe,
  cleanup,
  onCleanup,
  effect,
  effectPostFlush,
  // New: sample to get current value
  sample,
} from './reactive';
