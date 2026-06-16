// @synx/async — async sources as Reactive state. Two layers, both pure FRP
// (Event + Reactive only): `fromPromise` bridges one promise; `resource`
// auto-fetches from a reactive input. Render with @synx/dom however you like.

export { fromPromise, resource, retry, timeout, fromEvent } from './async';
export type { Async, Resource, ResourceOptions, RetryOptions } from './async';
