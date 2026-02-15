import { h, type Child, type SynxProps } from "@synx/dom/tags";

export const Fragment = Symbol.for("synx.jsx.fragment");

type Component<P = Record<string, unknown>> = (
  props?: P,
  ...children: Child[]
) => unknown;

type ElementType = keyof HTMLElementTagNameMap | Component | typeof Fragment;

type RuntimeProps = Record<string, unknown> & {
  children?: unknown;
};

function normalizeChildren(children: RuntimeProps["children"]): Child[] {
  if (children === undefined || children === null || children === false) {
    return [];
  }

  if (Array.isArray(children)) {
    return children as Child[];
  }

  return [children as Child];
}

function createElement(type: ElementType, props: RuntimeProps | null): unknown {
  const input = props ?? {};
  const { children, ...rest } = input;
  const normalizedChildren = normalizeChildren(children);

  if (type === Fragment) {
    if (normalizedChildren.length === 0) return null;
    if (normalizedChildren.length === 1) return normalizedChildren[0];
    return normalizedChildren;
  }

  if (typeof type === "function") {
    return type(rest, ...normalizedChildren);
  }

  return h(type, rest as SynxProps<any>, ...normalizedChildren);
}

export function jsx(type: ElementType, props: RuntimeProps | null, _key?: unknown): unknown {
  return createElement(type, props);
}

export function jsxs(type: ElementType, props: RuntimeProps | null, _key?: unknown): unknown {
  return createElement(type, props);
}

export function jsxDEV(
  type: ElementType,
  props: RuntimeProps | null,
  _key?: unknown,
  _isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown
): unknown {
  return createElement(type, props);
}

export namespace JSX {
  export type Element = any;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  export type IntrinsicElements = {
    [elemName: string]: {
      children?: any;
      [key: string]: any;
    };
  };
}

export type { Child, SynxProps };
