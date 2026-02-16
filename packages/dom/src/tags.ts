import { bind, bindClass } from "./bind";
import { Reactive, isReactive, get } from "@synx/frp/reactive";
import { RefObject } from "./component";
import type { JSX as SolidJSX } from "solid-js";
import { ComponentFactory } from "./component/define";
import { subscribe } from "../../frp/src/event";

type Attrs = Record<string, any>;

// Simple template cache by tag name
const templateCache = new Map<string, HTMLElement>();

// Lazy element builder using tagless final / interpreter pattern
export type BuildMode = "structure" | "bind" | "normal";
export type LazyElement<T extends HTMLElement = HTMLElement> = {
  _lazyType: "element";
  build: (mode: BuildMode, bindingMap?: Map<number, HTMLElement>) => T;
};

let buildCounter = 0;
let currentBuildMode: BuildMode = "normal";
let delegationRoot: HTMLElement | null = null;

const delegatedElementHandlers = new WeakMap<
  HTMLElement,
  Map<string, Array<(e: Event) => void>>
>();
const delegatedRootListeners = new WeakMap<
  HTMLElement,
  Map<string, EventListener>
>();

const nonBubblingEvents = new Set([
  "focus",
  "blur",
  "mouseenter",
  "mouseleave",
  "load",
  "unload",
]);

export function isLazyElement(val: any): val is LazyElement {
  return val != null && typeof val === "object" && val._lazyType === "element";
}

export function resetBuildCounter() {
  buildCounter = 0;
}

export function getBuildCounter(): number {
  return buildCounter;
}

export function setBuildCounter(counter: number) {
  buildCounter = counter;
}

export function setBuildMode(mode: BuildMode) {
  currentBuildMode = mode;
}

export function getBuildMode(): BuildMode {
  return currentBuildMode;
}

export function withDelegationRoot<T>(root: HTMLElement, fn: () => T): T {
  const previous = delegationRoot;
  delegationRoot = root;
  try {
    return fn();
  } finally {
    delegationRoot = previous;
  }
}

export type Child =
  | string
  | number
  | boolean
  | null
  | undefined
  | Reactive<string>
  | LazyElement
  | ReturnType<ComponentFactory>
  | ((parent: HTMLElement) => void | (() => void));
  // Note: Raw DOM Nodes are NOT allowed as children!
  // Use component instances directly (e.g., {myComponent} not {myComponent.el})

export type Children = Child | Child[];

export type ClassValue =
  | string
  | Reactive<string>
  | Record<string, boolean | Reactive<boolean>>;

type ElementType<K extends keyof SolidJSX.IntrinsicElements> =
  K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : never;

export type SynxProps<K extends keyof SolidJSX.IntrinsicElements> = {
  [P in keyof Omit<
    SolidJSX.IntrinsicElements[K],
    "class" | "className" | "ref" | "style" | "on"
  >]?: SolidJSX.IntrinsicElements[K][P] | Reactive<SolidJSX.IntrinsicElements[K][P]>;
} & {
  [dataAttr: `data-${string}`]: string | number | boolean | Reactive<string | number | boolean> | undefined;
  [ariaAttr: `aria-${string}`]: string | number | boolean | Reactive<string | number | boolean> | undefined;
  ref?: ((el: ElementType<K>) => void) | RefObject<ElementType<K>>;
  on?: {
    [E in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[E]) => void;
  };
  class?: ClassValue;
  className?: ClassValue;
  style?: SolidJSX.CSSProperties | Reactive<SolidJSX.CSSProperties>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: SynxProps<K> = {},
  ...children: Children[]
): HTMLElementTagNameMap[K] | LazyElement<HTMLElementTagNameMap[K]> {
  // CRITICAL FIX: Immediately capture children with Array.from() to create a completely new array
  // This ensures we get a unique array instance that can never be shared
  const capturedChildren = Array.from(children);

  // Capture binding ID and props/children for this element
  const myBindingId = buildCounter++;

  const lazyBuilder = {
    _lazyType: "element" as const,
    build: (mode: BuildMode, bindingMap?: Map<number, HTMLElement>) => {
      const childrenToProcess = capturedChildren;
      let el: HTMLElementTagNameMap[K];

      if (mode === "structure") {
        // Structure mode: create element and assign binding ID
        let template = templateCache.get(tag);
        if (!template) {
          template = document.createElement(tag);
          templateCache.set(tag, template);
        }
        el = template.cloneNode(false) as HTMLElementTagNameMap[K];
        el.setAttribute("data-binding-id", String(myBindingId));
      } else if (mode === "bind") {
        // Bind mode: retrieve element from binding map
        if (!bindingMap) {
          throw new Error("Bind mode requires binding map");
        }
        el = bindingMap.get(myBindingId) as HTMLElementTagNameMap[K];
        if (!el) {
          throw new Error(`Binding ID ${myBindingId} not found in template`);
        }
      } else {
        // Normal mode: create element normally
        let template = templateCache.get(tag);
        if (!template) {
          template = document.createElement(tag);
          templateCache.set(tag, template);
        }
        el = template.cloneNode(false) as HTMLElementTagNameMap[K];
      }

      const isStructureMode = mode === "structure";
      const isBindMode = mode === "bind";
      const isNormalMode = mode === "normal";

      if (props) {
    for (const [key, value] of Object.entries(props)) {
        if (key === "ref" && value != null) {
          // Refs in bind or normal mode
          if (isBindMode || isNormalMode) {
            if (typeof value === "function") {
              value(el);
            } else if (value && typeof value === "object" && "set" in value) {
              value.set(el);
            }
          }
        } else if (key === "style" && value && typeof value === "object") {
          if (isReactive(value)) {
            // Reactive bindings in bind or normal mode
            if (isBindMode || isNormalMode) {
              const styleReactive = value as Reactive<SolidJSX.CSSProperties>;
              Object.assign(el.style, get(styleReactive));
              subscribe(styleReactive.changes, (nextStyle) => {
                Object.assign(el.style, nextStyle);
              });
            }
          } else {
            // Static styles in structure or normal mode
            if (isStructureMode || isNormalMode) {
              Object.assign(el.style, value);
            }
          }
        } else if (key === "on" && value && typeof value === "object") {
          // Event handlers in bind or normal mode
          if (isBindMode || isNormalMode) {
            for (const [eventName, emit] of Object.entries(value)) {
              if (typeof emit === "function") {
                const delegated =
                  delegationRoot &&
                  !nonBubblingEvents.has(eventName) &&
                  registerDelegatedHandler(
                    delegationRoot,
                    el as unknown as HTMLElement,
                    eventName,
                    emit as (e: Event) => void
                  );

                if (!delegated) {
                  el.addEventListener(eventName, emit as unknown as EventListener);
                }
              }
            }
          }
        } else if (key === "class" || key === "className") {
          // Handle various class formats
          if (value == null || value === false) {
            // Do nothing for null/undefined/false values
          } else if (typeof value === "string") {
            // Static classes in structure or normal mode
            if (isStructureMode || isNormalMode) {
              el.className = value;
            }
          } else if (isReactive(value)) {
            // Reactive classes in bind or normal mode
            if (isBindMode || isNormalMode) {
              const val = value as Reactive<string>;
              el.className = get(val);
              subscribe(val.changes, (newClass) => {
                el.className = newClass;
              });
            }
          } else if (typeof value === "object") {
            // Object with conditional classes
            for (const [className, condition] of Object.entries(value)) {
              if (typeof condition === "boolean") {
                // Static conditional classes in structure or normal mode
                if ((isStructureMode || isNormalMode) && condition) {
                  const classNames = className.split(/\s+/);
                  classNames.forEach((name) => {
                    if (name) el.classList.add(name);
                  });
                }
              } else if (isReactive(condition)) {
                // Reactive classes in bind or normal mode
                if (isBindMode || isNormalMode) {
                  bindClass(el, className, condition);
                }
              }
            }
          }
        } else if (key.startsWith("data-") && key !== "data-binding-id") {
          if (isReactive(value)) {
            // Reactive bindings in bind or normal mode
            if (isBindMode || isNormalMode) {
              bind(el, key as any, value as any);
            }
          } else {
            // Static attributes in structure or normal mode
            if (isStructureMode || isNormalMode) {
              el.setAttribute(key, String(value));
            }
          }
        } else if (key.startsWith("aria-")) {
          if (isReactive(value)) {
            // Reactive bindings in bind or normal mode
            if (isBindMode || isNormalMode) {
              bind(el, key as any, value as any);
            }
          } else {
            // Static attributes in structure or normal mode
            if (isStructureMode || isNormalMode) {
              el.setAttribute(key, String(value));
            }
          }
        } else if (value != null && value !== false) {
          if (isReactive(value)) {
            // Reactive bindings in bind or normal mode
            if (isBindMode || isNormalMode) {
              bind(el, key as any, value as any);
            }
          } else {
            // Static properties/attributes in structure or normal mode
            if (isStructureMode || isNormalMode) {
              if (key === "id") {
                (el as any).id = String(value);
              } else if (key === "title") {
                (el as any).title = String(value);
              } else if (key === "type" && (el instanceof HTMLInputElement || el instanceof HTMLButtonElement)) {
                el.type = String(value);
              } else if (typeof value === "boolean") {
                if (value) el.setAttribute(key, "");
                else el.removeAttribute(key);
              } else {
                el.setAttribute(key, String(value));
              }
            }
          }
        }
      }
    }

      // Children handling depends on mode
      if (isStructureMode) {
        // Structure mode: append all children to build structure
        let childIdx = 0;
        for (const c of childrenToProcess.flat()) {
          if (isLazyElement(c)) {
            el.appendChild(c.build(mode, bindingMap));
          } else if (typeof c === "string" || typeof c === "number") {
            el.appendChild(document.createTextNode(String(c)));
          } else if (c != null && typeof c === "object" && isReactive(c)) {
            const reactiveText = c as Reactive<string>;
            const node = document.createTextNode(String(get(reactiveText)));
            el.appendChild(node);
          } else if (typeof c === "object" && c != null && "el" in c) {
            // Component children: use placeholder to avoid embedding their binding IDs
            const componentName = (c.el as any)?.tagName || (c.el as any)?.className || 'component';
            const placeholderText = `component-placeholder:${componentName}:${childIdx}`;
            el.appendChild(document.createComment(placeholderText));
          } else if (c instanceof Node) {
            throw new Error(
              `Raw DOM nodes are not allowed as JSX children. ` +
              `Did you mean to use a component instance instead of '.el'? ` +
              `Use {myComponent} instead of {myComponent.el}`
            );
          }
          childIdx++;
          // Skip functions in structure mode (dynamic content)
        }
      } else if (isBindMode) {
        // Bind mode: children already in cloned tree, only setup reactive bindings
        let childIndex = 0;
        const flatChildren = childrenToProcess.flat();
        for (let i = 0; i < flatChildren.length; i++) {
          const c = flatChildren[i];

          if (isLazyElement(c)) {
            c.build(mode, bindingMap);
            childIndex++;
          } else if (c != null && typeof c === "object" && isReactive(c)) {
            // Apply reactive text binding
            const reactiveText = c as Reactive<string>;
            // Find the text node at this child position
            const node = el.childNodes[childIndex] as Text;
            if (node && node.nodeType === Node.TEXT_NODE) {
              node.textContent = String(get(reactiveText));
              subscribe(reactiveText.changes, (next) => {
                node.textContent = String(next);
              });
            }
            childIndex++;
          } else if (typeof c === "object" && c != null && "el" in c) {
            // Component children: replace placeholder with actual component instance
            const placeholder = el.childNodes[childIndex];
            if (placeholder && placeholder.nodeType === Node.COMMENT_NODE) {
              el.replaceChild((c as { el: Node }).el, placeholder);
            }
            childIndex++;
          } else if (typeof c === "function") {
            // Functions (like each()) are called in bind mode to mount dynamic content
            c(el as HTMLElement);
          } else {
            childIndex++;
          }
        }
      } else if (isNormalMode) {
        // Normal mode: append children AND set up reactive bindings
        for (const c of childrenToProcess.flat()) {
          if (isLazyElement(c)) {
            el.appendChild(c.build(mode, bindingMap));
          } else if (typeof c === "string" || typeof c === "number") {
            el.appendChild(document.createTextNode(String(c)));
          } else if (c != null && typeof c === "object" && isReactive(c)) {
            const reactiveText = c as Reactive<string>;
            const node = document.createTextNode(String(get(reactiveText)));
            el.appendChild(node);
            subscribe(reactiveText.changes, (next) => {
              node.textContent = String(next);
            });
          } else if (typeof c === "object" && c != null && "el" in c) {
            el.appendChild((c as { el: Node }).el);
          } else if (c instanceof Node) {
            throw new Error(
              `Raw DOM nodes are not allowed as JSX children. ` +
              `Did you mean to use a component instance instead of '.el'? ` +
              `Use {myComponent} instead of {myComponent.el}`
            );
          } else if (typeof c === "function") {
            // Functions (like each()) are called to mount dynamic content
            c(el as HTMLElement);
          }
        }
      }

      return el;
    },
  };

  // If in normal mode, build immediately and return HTMLElement
  if (currentBuildMode === "normal") {
    return lazyBuilder.build("normal");
  }

  // Otherwise return lazy builder for deferred execution
  return lazyBuilder;
}

function registerDelegatedHandler(
  root: HTMLElement,
  element: HTMLElement,
  eventName: string,
  handler: (e: Event) => void
): boolean {
  let elementHandlers = delegatedElementHandlers.get(element);
  if (!elementHandlers) {
    elementHandlers = new Map<string, Array<(e: Event) => void>>();
    delegatedElementHandlers.set(element, elementHandlers);
  }

  let handlers = elementHandlers.get(eventName);
  if (!handlers) {
    handlers = [];
    elementHandlers.set(eventName, handlers);
  }
  handlers.push(handler);

  let rootListeners = delegatedRootListeners.get(root);
  if (!rootListeners) {
    rootListeners = new Map<string, EventListener>();
    delegatedRootListeners.set(root, rootListeners);
  }

  if (!rootListeners.has(eventName)) {
    const listener: EventListener = (event) => {
      const path = typeof event.composedPath === "function"
        ? event.composedPath()
        : [];

      if (path.length > 0) {
        for (const node of path) {
          if (!(node instanceof HTMLElement)) continue;
          const map = delegatedElementHandlers.get(node);
          const nodeHandlers = map?.get(eventName);
          if (nodeHandlers) {
            for (let i = 0; i < nodeHandlers.length; i += 1) {
              nodeHandlers[i](event);
              if (event.cancelBubble) return;
            }
          }
          if (node === root) return;
        }
        return;
      }

      let node: Node | null = event.target as Node | null;
      while (node && node !== root) {
        if (node instanceof HTMLElement) {
          const map = delegatedElementHandlers.get(node);
          const nodeHandlers = map?.get(eventName);
          if (nodeHandlers) {
            for (let i = 0; i < nodeHandlers.length; i += 1) {
              nodeHandlers[i](event);
              if (event.cancelBubble) return;
            }
          }
        }
        node = node.parentNode;
      }

      const rootMap = delegatedElementHandlers.get(root);
      const rootHandlers = rootMap?.get(eventName);
      if (rootHandlers) {
        for (let i = 0; i < rootHandlers.length; i += 1) {
          rootHandlers[i](event);
          if (event.cancelBubble) return;
        }
      }
    };

    root.addEventListener(eventName, listener);
    rootListeners.set(eventName, listener);
  }

  return true;
}

function appendChild(parent: HTMLElement, child: Child) {
  if (child == null || child === false) return;

  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else if (typeof child === "object" && isReactive(child)) {
    const reactiveText = child as Reactive<string>;
    const node = document.createTextNode(String(get(reactiveText)));
    parent.appendChild(node);
    subscribe(reactiveText.changes, (next) => {
      node.textContent = String(next);
    });
  } else if (typeof child === "object" && "el" in child) {
    const node = (child as { el: Node }).el;
    // Don't append if already a child (to avoid reordering in bind mode)
    if (node.parentNode !== parent) {
      parent.appendChild(node);
    }
  } else if (child instanceof Node) {
    throw new Error(
      `Raw DOM nodes are not allowed as JSX children. ` +
      `Did you mean to use a component instance instead of '.el'? ` +
      `Use {myComponent} instead of {myComponent.el}`
    );
  } else if (typeof child === "function") {
    const dispose = child(parent);
    // TODO Store disposer if needed
  }
}


const createTag = <K extends keyof HTMLElementTagNameMap>(tag: K) => {
  return (props: SynxProps<K> = {}, ...children: Children[]) =>
    h(tag, props, ...children);
};

export const div = createTag("div");
export const span = createTag("span");
export const p = createTag("p");
export const a = createTag("a");
export const ul = createTag("ul");
export const ol = createTag("ol");
export const li = createTag("li");
export const button = createTag("button");
export const input = createTag("input");
export const textarea = createTag("textarea");
export const label = createTag("label");
export const form = createTag("form");
export const select = createTag("select");
export const option = createTag("option");
export const img = createTag("img");
export const table = createTag("table");
export const thead = createTag("thead");
export const tbody = createTag("tbody");
export const tr = createTag("tr");
export const th = createTag("th");
export const td = createTag("td");
export const h1 = createTag("h1");
export const h2 = createTag("h2");
export const h3 = createTag("h3");
export const h4 = createTag("h4");
export const h5 = createTag("h5");
export const h6 = createTag("h6");
export const section = createTag("section");
export const header = createTag("header");
export const footer = createTag("footer");
export const nav = createTag("nav");
export const main = createTag("main");
export const article = createTag("article");
export const aside = createTag("aside");
export const video = createTag("video");
export const audio = createTag("audio");
export const canvas = createTag("canvas");
