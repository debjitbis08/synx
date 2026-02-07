import { effect, get, isReactive, Reactive } from "@synx/frp/reactive";
import { Event, create, stepper } from "@synx/frp/event";
import {
  RefMap,
  refMapOutputs,
  type RefMapObject,
  type RefObject,
} from "./ref";
import type { Child } from "../tags";
import { applyChildren } from "./children";

export type ComponentFactory = () => {
  el: Node;
  props: Record<string, { prop: Reactive<any>; emit: (value: any) => void }>;
  outputs: Record<string, Event<any>>;
};

type ExtractPropType<P> = P extends { prop: Reactive<infer A> } ? A : never;

type PropInput<P> = ExtractPropType<P> | Reactive<ExtractPropType<P>>;

type ComponentInputProps<T extends { props: Record<string, any> }> = {
  [K in keyof T["props"]]?: PropInput<T["props"][K]>;
};

export const Prop = <A>(initial: A) => {
  const [ev, emit] = create<A>();
  const prop = stepper(ev, initial);
  return { prop, emit };
};

type Propify<T> = {
  [K in keyof T]: { prop: Reactive<T[K]>; emit: (value: T[K]) => void };
};

export function defineComponent<
  InitialProps extends Record<string, unknown>,
  T extends {
    el: HTMLElement;
    props: Propify<InitialProps>;
    outputs: any;
  }
>(
  create: (initialProps: InitialProps & { children?: Child[] }) => T
): (
  props?: {
    ref?: RefObject<T & { cleanup: () => void }>;
  } & {
    [K in keyof InitialProps]?: InitialProps[K] | Reactive<InitialProps[K]>;
  },
  ...children: Child[]
) => T & { cleanup: () => void } {
  return (props = {} as any, ...children) => {
    const { ref, ...rest } = props;

    // Pass children to component factory
    const instance = create({
      ...(Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, isReactive(v) ? get(v) : v])
      ) as InitialProps),
      children,
    });

    const unsubscribers: (() => void)[] = [];

    // Wire reactive props to emitters
    for (const [key, value] of Object.entries(rest)) {
      const target = instance.props[key];
      if (target && typeof target === "object" && "emit" in target) {
        if (isReactive(value)) {
          unsubscribers.push(effect(value, target.emit));
        } else {
          target.emit(value);
        }
      }
    }

    const returnValue = {
      ...instance,
      cleanup: () => {
        for (const unsub of unsubscribers) unsub();
      },
    };

    if (ref) ref.set(returnValue);

    return returnValue;
  };
}

export function each<T>(
  list: Reactive<T[]>,
  arg:
    | ((
        item: Reactive<T>,
        index: number
      ) =>
        | Node
        | [Node, () => void]
        | { el: Node; cleanup?: () => void; outputs?: Record<string, Event<any>> })
    | {
        create: (
          item: Reactive<T>,
          key: string | number
        ) =>
          | Node
          | [Node, () => void]
          | { el: Node; cleanup?: () => void; outputs?: Record<string, Event<any>> };
        update?: (node: Node, item: T, index: number) => void;
        shouldUpdate?: (prev: T, next: T) => boolean;
        key?: (item: T) => string | number;
      },
): ((parent: HTMLElement) => () => void) & {
  refs: RefMapObject<
    string | number,
    {
      outputs?: Record<string, Event<any>>;
    }
  >;
  outputs: <O = any>(name: string, defaultValue?: O) => Reactive<Event<O>[]>;
} {
  const refs = RefMap<
    string | number,
    {
      outputs?: Record<string, Event<any>>;
    }
  >();

  const mount = (parent: HTMLElement) => {
    const isConfigObject = typeof arg !== "function";
    const keyFn = isConfigObject ? arg.key : undefined;
    const update = isConfigObject ? arg.update : undefined;
    const shouldUpdate = isConfigObject ? arg.shouldUpdate : undefined;

    const itemEmitByNode = new WeakMap<Node, (value: T) => void>();
    const itemKeyByNode = new WeakMap<Node, string | number>();

    const toNode = (
      rendered:
        | Node
        | [Node, () => void]
        | { el: Node; cleanup?: () => void; outputs?: Record<string, Event<any>> }
    ): [
      Node,
      () => void,
      { outputs?: Record<string, Event<any>> } | null,
    ] => {
      if (Array.isArray(rendered)) return [rendered[0], rendered[1], null];
      if ("el" in rendered) {
        return [rendered.el, rendered.cleanup ?? (() => {}), rendered];
      }
      return [rendered, () => {}, null];
    };

    const mount = applyChildren(parent, {
      each: list,
      create: (item, index) => {
        const itemKey = keyFn ? keyFn(item) : index;
        const itemProp = Prop(item);
        const rendered = isConfigObject
          ? arg.create(itemProp.prop, itemKey)
          : arg(itemProp.prop, index);
        const [node, renderedCleanup, instance] = toNode(rendered);
        itemEmitByNode.set(node, itemProp.emit);
        itemKeyByNode.set(node, itemKey);
        if (instance) refs.set(itemKey, instance);
        return [
          node,
          () => {
            itemEmitByNode.delete(node);
            const key = itemKeyByNode.get(node);
            if (key !== undefined) {
              refs.delete(key);
              itemKeyByNode.delete(node);
            }
            renderedCleanup();
          },
        ];
      },
      update: (node, item, index) => {
        itemEmitByNode.get(node)?.(item);
        update?.(node, item, index);
      },
      shouldUpdate,
      key: keyFn,
    });

    return () => {
      mount();
      refs.clear();
    };
  };

  return Object.assign(mount, {
    refs,
    outputs: <O = any>(name: string, defaultValue?: O) =>
      refMapOutputs<
        string | number,
        { outputs?: Record<string, Event<any>> },
        O
      >(refs, name, defaultValue),
  });
}

export type { Propify };
