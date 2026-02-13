type QueryRoot = ParentNode;

function asRoot(
  rootOrSelector: QueryRoot | string,
  maybeSelector?: string
): { root: QueryRoot; selector: string } {
  if (typeof rootOrSelector === "string") {
    return { root: document, selector: rootOrSelector };
  }
  if (!maybeSelector) {
    throw new Error("Expected selector when a query root is provided");
  }
  return { root: rootOrSelector, selector: maybeSelector };
}

export function queryRequired<T extends Element>(
  selector: string
): T;
export function queryRequired<T extends Element>(
  root: QueryRoot,
  selector: string
): T;
export function queryRequired<T extends Element>(
  rootOrSelector: QueryRoot | string,
  maybeSelector?: string
): T {
  const { root, selector } = asRoot(rootOrSelector, maybeSelector);
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Expected element matching selector: ${selector}`);
  }
  return element;
}

export function queryAll<T extends Element>(
  selector: string
): T[];
export function queryAll<T extends Element>(
  root: QueryRoot,
  selector: string
): T[];
export function queryAll<T extends Element>(
  rootOrSelector: QueryRoot | string,
  maybeSelector?: string
): T[] {
  const { root, selector } = asRoot(rootOrSelector, maybeSelector);
  return Array.from(root.querySelectorAll<T>(selector));
}

type OneQuery<T extends Element> = {
  selector: string;
  many?: false;
};

type ManyQuery<T extends Element> = {
  selector: string;
  many: true;
};

type QuerySpec<T extends Element> = OneQuery<T> | ManyQuery<T>;
type QuerySchema = Record<string, QuerySpec<Element>>;

type QueryResult<S extends QuerySchema> = {
  [K in keyof S]: S[K] extends ManyQuery<infer T>
    ? T[]
    : S[K] extends OneQuery<infer T>
    ? T
    : never;
};

export function one<T extends Element>(selector: string): OneQuery<T> {
  return { selector };
}

export function many<T extends Element>(selector: string): ManyQuery<T> {
  return { selector, many: true };
}

export function role<T extends Element>(name: string): OneQuery<T> {
  return one<T>(`[data-role='${name}']`);
}

export function roles<T extends Element>(name: string): ManyQuery<T> {
  return many<T>(`[data-role='${name}']`);
}

export function queryElements<S extends QuerySchema>(
  root: QueryRoot,
  schema: S
): QueryResult<S> {
  const entries = Object.entries(schema).map(([key, spec]) => {
    if (spec.many) {
      return [key, queryAll(root, spec.selector)];
    }
    return [key, queryRequired(root, spec.selector)];
  });

  return Object.fromEntries(entries) as QueryResult<S>;
}
