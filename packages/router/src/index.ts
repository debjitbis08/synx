// @synx/router — routing built from the bottom up. Each layer is usable on its
// own and composes into the next. DOM helpers live in `@synx/router/view`.

// Layer 1 — the URL as a source + navigation as the sink (depends on @synx/frp).
export { location } from './location';
export type { Location } from './location';

// Layer 2 — pure pattern matching (no side effects).
export { matchPath, toSegments } from './match';

// Layer 4 — pure nested route tables (built on Layer 2 + typed params).
export { matchRoutes } from './match';

// Layer 3 — typed/validated params (opt-in; Standard Schema or plain functions).
export {
  ParamValidationError,
  parseParams,
  runParser,
} from './standard-schema';
export type {
  ParamParser,
  ParamParsers,
  StandardSchemaV1,
} from './standard-schema';

// Shared data types.
export type {
  MatchedRoute,
  NavigateOptions,
  NavigateTo,
  Params,
  Query,
  Route,
  RouteMatch,
  RouterLocation,
  RouterMode,
  RouterOptions,
} from './types';
