import { get, isReactive, Reactive } from "@synx/frp/reactive";
import { Event, create, stepper } from "@synx/frp/event";
import {
  RefMap,
  refMapOutputs,
  type RefMapObject,
  type RefObject,
} from "./ref";
import type { Child, LazyElement } from "../tags";
import {
  getBuildCounter,
  getBuildMode,
  getBindingId,
  isLazyElement,
  resetBuildCounter,
  setBuildCounter,
  setBuildMode,
} from "../tags";
import { applyChildren } from "./children";
import { createScope } from "../lifecycle";

/**
 * Collect paths to all binding elements using WeakMap registry.
 * Paths are represented as arrays of child indices (e.g., [0, 2, 1] means root.children[0].children[2].children[1]).
 * This eliminates the need for DOM queries during bind phase and avoids DOM attribute pollution.
 */
function collectBindingPaths(root: HTMLElement): number[][] {
  const paths: number[][] = [];
  const bindingIdToPath = new Map<number, number[]>();

  // Optimize: Reuse path array during traversal to reduce GC pressure
  function traverse(element: HTMLElement, currentPath: number[], depth: number) {
    const bindingId = getBindingId(element);
    if (bindingId !== undefined) {
      // Clone only when storing (not on every recursion)
      bindingIdToPath.set(bindingId, currentPath.slice(0, depth));
    }

    // Traverse element children only (Element.children skips text nodes)
    for (let i = 0; i < element.children.length; i++) {
      currentPath[depth] = i;
      traverse(element.children[i] as HTMLElement, currentPath, depth + 1);
    }
  }

  // Check root element first
  const rootBindingId = getBindingId(root);
  if (rootBindingId !== undefined) {
    bindingIdToPath.set(rootBindingId, []);
  }

  // Traverse root's children with preallocated path array
  const pathBuffer = new Array(10); // Reasonable max depth
  for (let i = 0; i < root.children.length; i++) {
    pathBuffer[0] = i;
    traverse(root.children[i] as HTMLElement, pathBuffer, 1);
  }

  // Convert map to array indexed by binding ID
  const maxBindingId = Math.max(...bindingIdToPath.keys());
  for (let id = 0; id <= maxBindingId; id++) {
    const path = bindingIdToPath.get(id);
    if (path !== undefined) {
      paths[id] = path;
    }
  }

  return paths;
}

/**
 * Build binding map from cached paths using direct traversal.
 * Pre-computes all bindings upfront for predictable O(1) access performance.
 */
function buildBindingMapFromPaths(
  root: HTMLElement,
  paths: number[][]
): Map<number, HTMLElement> {
  // Pre-size map to avoid rehashing during construction
  const bindingMap = new Map<number, HTMLElement>();

  // Inline followPath for better performance in hot path
  for (let bindingId = 0; bindingId < paths.length; bindingId++) {
    const path = paths[bindingId];
    if (!path) continue;

    // Inline path following (avoids function call overhead)
    let current: Element = root;
    if (path.length > 0) {
      for (let j = 0; j < path.length; j++) {
        const child = current.children[path[j]];
        if (!child || !(child instanceof HTMLElement)) {
          throw new Error(
            `Path traversal failed for binding ID ${bindingId}, path: [${path.join(', ')}]`
          );
        }
        current = child;
      }
    }

    bindingMap.set(bindingId, current as HTMLElement);
  }

  return bindingMap;
}

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
  let bindingPaths: number[][] | null = null;
  let templateStartCounter: number = 0;

  return (props = {} as any, ...children) => {
    const { ref, ...rest } = props;
    const scope = createScope();

    const instance = scope.run(() => {
      const previousBuildMode = getBuildMode();
      const previousBuildCounter = getBuildCounter();

      try {
        // Phase 1: Create template if not cached
        if (!template) {
          // Only reset counter if we're NOT already in structure mode
          // (i.e., we're a top-level component, not nested)
          // Nested components should continue the parent's ID sequence
          const isNestedComponent = previousBuildMode === "structure";
          if (!isNestedComponent) {
            resetBuildCounter();
          }
          // CRITICAL: Save starting counter BEFORE any h() calls
          // This is the value we'll reset to in bind mode to ensure
          // binding IDs match between structure and bind modes
          templateStartCounter = getBuildCounter();
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

          // Cache binding paths from template (do this once)
          if (template) {
            bindingPaths = collectBindingPaths(template);
          }
        }

        // Phase 2: Clone template and bind
        if (!template || !bindingPaths) {
          throw new Error("Template should have been created in phase 1");
        }
        const cloned = template.cloneNode(true) as HTMLElement;

        // Build binding map using cached paths (pre-computed for predictable performance)
        const bindingMap = buildBindingMapFromPaths(cloned, bindingPaths);

        // Restore counter to same value as structure mode to ensure matching IDs
        setBuildCounter(templateStartCounter);
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
      } finally {
        setBuildMode(previousBuildMode);
        // Don't restore build counter in either mode - binding IDs must be globally unique
        // across nested components and must follow the same sequence in both structure and bind modes
      }
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
    const hasOwnOutputs = (
      instance: { outputs?: Record<string, Event<any>> } | null
    ): instance is { outputs: Record<string, Event<any>> } =>
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
