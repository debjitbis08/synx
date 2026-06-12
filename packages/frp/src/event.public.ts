export type { Event } from './event';

import * as raw from './event';
import { debuggable } from './debug';

// Node-producing combinators wrapped so the debug hook can observe construction
// (operation name + input nodes). `debuggable` is the identity function in
// production, so these are zero-cost there. Source/leaf constructors
// (create/of/never/empty) and terminals (subscribe/effect/cleanup) are not
// wrapped — they form no edges.
export const map = debuggable('map', raw.map);
export const fold = debuggable('fold', raw.fold);
export const concat = debuggable('concat', raw.concat);
export const mergeWith = debuggable('mergeWith', raw.mergeWith);
export const mergeAll = debuggable('mergeAll', raw.mergeAll);
export const apply = debuggable('apply', raw.apply);
export const tag = debuggable('tag', raw.tag);
export const filter = debuggable('filter', raw.filter);
export const filterApply = debuggable('filterApply', raw.filterApply);
export const when = debuggable('when', raw.when);
export const whenR = debuggable('whenR', raw.whenR);
export const zip = debuggable('zip', raw.zip);
export const snapshot = debuggable('snapshot', raw.snapshot);
export const sample = debuggable('sample', raw.sample);
export const stepper = debuggable('stepper', raw.stepper);
export const switchE = debuggable('switchE', raw.switchE);
export const switchR = debuggable('switchR', raw.switchR);

export {
  create,
  never,
  empty,
  of,
  cleanup,
  onCleanup,
  subscribe,
  isEvent,
  // New FRP primitives
  effect,
} from './event';
