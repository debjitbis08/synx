import { get, isReactive, Reactive } from "@synx/frp/reactive";
import { Event, create, stepper } from "@synx/frp/event";
import {
  RefMap,
  refMapOutputs,
  type RefMapObject,
  type RefObject,
} from "./ref";
import type { Child, LazyElement } from "../tags";
import { isLazyElement, resetBuildCounter, setBuildMode } from "../tags";
import { applyChildren } from "./children";
import { createScope } from "../lifecycle";

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

export const Prop = <A>(initial: A | Reactive<A>) => {
  if (isReactive(initial)) {
    return {
      prop: initial as Reactive<A>,
      emit: (_value: A) => {
        // Passthrough props are owned by upstream reactive source.
      },
    };
  }

  const [ev, emit] = create<A>();
  const prop = stepper(ev, initial as A);
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
  // Template cache for this component
  let template: HTMLElement | null = null;
  let bindingIds: number[] | null = null;

  return (props = {} as any, ...children) => {
    const { ref, ...rest } = props;
    const scope = createScope();

    const instance = scope.run(() => {
      // Phase 1: Create template if not cached
      if (!template) {
        resetBuildCounter();
        setBuildMode("structure");
        const templateInstance = create({
          ...(Object.fromEntries(
            Object.entries(rest).map(([k, v]) => [k, isReactive(v) ? get(v) : v])
          ) as InitialProps),
          children,
        });

        // Build structure from lazy element
        if (isLazyElement(templateInstance.el)) {
          template = (templateInstance.el as any).build("structure");
        } else {
          template = templateInstance.el as HTMLElement;
        }

        // Cache binding IDs from template (do this once)
        if (template) {
          bindingIds = [];
          const rootHasBinding = template.hasAttribute("data-binding-id");
          if (rootHasBinding) {
            bindingIds.push(parseInt(template.getAttribute("data-binding-id")!, 10));
          }
          const elements = template.querySelectorAll('[data-binding-id]');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            bindingIds.push(parseInt(el.getAttribute("data-binding-id")!, 10));
          }
        }

        setBuildMode("normal");
      }

      // Phase 2: Clone template and bind
      if (!template || !bindingIds) {
        throw new Error("Template should have been created in phase 1");
      }
      const cloned = template.cloneNode(true) as HTMLElement;

      // Build binding map using cached IDs (avoid parseInt on every clone)
      const bindingMap = new Map<number, HTMLElement>();
      const rootHasBinding = cloned.hasAttribute("data-binding-id");

      if (rootHasBinding) {
        bindingMap.set(bindingIds[0], cloned);
      }

      // Query descendants and map using cached IDs
      const elements = cloned.querySelectorAll('[data-binding-id]');
      const offset = rootHasBinding ? 1 : 0;
      for (let i = 0; i < elements.length; i++) {
        bindingMap.set(bindingIds[i + offset], elements[i] as HTMLElement);
      }

      resetBuildCounter();
      setBuildMode("bind");

      // Pass children to component factory (in bind mode)
      const created = create({
        ...(Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [k, v])
        ) as InitialProps),
        children,
      });

      // Apply bindings to cloned element
      if (isLazyElement(created.el)) {
        (created.el as any).build("bind", bindingMap);
      }

      // Use cloned element
      created.el = cloned;

      setBuildMode("normal");

      // Wire reactive props to emitters
      for (const [key, value] of Object.entries(rest)) {
        const target = created.props[key];
        if (target && typeof target === "object" && "emit" in target) {
          if (!isReactive(value)) {
            target.emit(value);
          }
        }
      }

      return created;
    });

    scope.attachRoot(instance.el);

    const returnValue = {
      ...instance,
      cleanup: () => {
        if (typeof (instance as any).cleanup === "function") {
          (instance as any).cleanup();
        }
        scope.dispose();
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
    const hasOwnOutputs = (instance: { outputs?: Record<string, Event<any>> } | null) =>
      !!instance && !!instance.outputs && Object.keys(instance.outputs).length > 0;

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
        if (hasOwnOutputs(instance)) {
          itemKeyByNode.set(node, itemKey);
          refs.set(itemKey, instance);
        }
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
