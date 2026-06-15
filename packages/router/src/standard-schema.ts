/**
 * Param parsing/validation support.
 *
 * A route param can be coerced/validated by either:
 *   - a plain function `(raw: string) => T` (throw to reject), or
 *   - a Standard Schema object (the `~standard` interface implemented by
 *     Zod 3.24+, Valibot, ArkType, …).
 *
 * The router has no dependency on any validation library — it only speaks the
 * Standard Schema protocol (https://standardschema.dev). Validation is run
 * synchronously during matching; a parser/schema that rejects causes the route
 * to *not match* (the matcher backtracks to the next candidate).
 */

/** Minimal slice of the Standard Schema v1 spec the router relies on. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

/** A parser for a single route param. */
export type ParamParser<T = unknown> =
  | ((raw: string) => T)
  | StandardSchemaV1<string, T>;

/** Map of param name -> parser. Params not listed stay as `string`. */
export type ParamParsers = Record<string, ParamParser>;

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~standard' in value &&
    typeof (value as StandardSchemaV1)['~standard']?.validate === 'function'
  );
}

/** Thrown when a Standard Schema rejects a param during matching. */
export class ParamValidationError extends Error {
  constructor(
    public readonly param: string,
    public readonly issues: ReadonlyArray<{ message: string }>,
  ) {
    super(
      `Invalid value for route param ":${param}": ` +
        issues.map((i) => i.message).join('; '),
    );
    this.name = 'ParamValidationError';
  }
}

/**
 * Run a single parser against a raw string segment.
 * Returns the parsed value, or throws (function parsers may throw directly;
 * schema rejections throw {@link ParamValidationError}; async schemas throw).
 */
export function runParser(name: string, parser: ParamParser, raw: string): unknown {
  if (isStandardSchema(parser)) {
    const result = parser['~standard'].validate(raw);
    if (result instanceof Promise) {
      throw new Error(
        `Route param ":${name}" uses an async Standard Schema; ` +
          `synchronous validation is required during routing.`,
      );
    }
    if (result.issues) {
      throw new ParamValidationError(name, result.issues);
    }
    return result.value;
  }
  return parser(raw);
}

/**
 * Apply a parser map to a set of raw string params.
 * Returns the parsed params, or `null` if any parser rejected (signalling the
 * route should not match). Params without a parser pass through unchanged.
 */
export function parseParams(
  raw: Record<string, string>,
  parsers: ParamParsers | undefined,
): Record<string, unknown> | null {
  if (!parsers) return { ...raw };
  const out: Record<string, unknown> = { ...raw };
  for (const name in parsers) {
    if (!(name in raw)) continue;
    try {
      out[name] = runParser(name, parsers[name], raw[name]);
    } catch {
      return null;
    }
  }
  return out;
}
