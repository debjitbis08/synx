import { bind, bindClass } from "./bind";
import { Reactive, isReactive, effect, get } from "@synx/frp/reactive";
import { RefObject } from "./component";
import type { JSX as SolidJSX } from "solid-js";
import { ComponentFactory } from "./component/define";

type Attrs = Record<string, any>;

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | Reactive<string>
  | ReturnType<ComponentFactory>
  | ((parent: HTMLElement) => void | (() => void));

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
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "ref" && value != null) {
        if (typeof value === "function") {
          value(el);
        } else if (value && typeof value === "object" && "set" in value) {
          value.set(el);
        }
      } else if (key === "style" && value && typeof value === "object") {
        if (isReactive(value)) {
          const styleReactive = value as Reactive<SolidJSX.CSSProperties>;
          Object.assign(el.style, get(styleReactive));
          effect(styleReactive, (nextStyle) => {
            Object.assign(el.style, nextStyle);
          });
        } else {
          Object.assign(el.style, value);
        }
      } else if (key === "on" && value && typeof value === "object") {
        for (const [eventName, emit] of Object.entries(value)) {
          if (typeof emit === "function") {
            el.addEventListener(eventName, emit as unknown as EventListener);
          }
        }
      } else if (key === "class" || key === "className") {
        // Handle various class formats
        if (value == null || value === false) {
          // Do nothing for null/undefined/false values
        } else if (typeof value === "string") {
          // Simple string class
          el.className = value;
        } else if (isReactive(value)) {
          const val = value as Reactive<string>;
          el.className = get(val);
          effect(val, (newClass) => {
            el.className = newClass;
          });
        } else if (typeof value === "object") {
          // Object with conditional classes
          // Handle initial classes
          for (const [className, condition] of Object.entries(value)) {
            if (typeof condition === "boolean") {
              if (condition) {
                const classNames = className.split(/\s+/);
                classNames.forEach((name) => {
                  if (name) el.classList.add(name);
                });
              }
            } else if (isReactive(condition)) {
              bindClass(el, className, condition);
            }
          }
        }
      } else if (key.startsWith("data-") || key.startsWith("aria-")) {
        if (isReactive(value)) {
          bind(el, key as any, value as any);
        } else {
          el.setAttribute(key, String(value));
        }
      } else if (value != null && value !== false) {
        // el.setAttribute(key, String(value));
        if (isReactive(value)) {
          bind(el, key as any, value as any);
        } else {
          if (typeof value === "boolean") {
            if (value) el.setAttribute(key, "");
            else el.removeAttribute(key);
          } else {
            el.setAttribute(key, String(value));
          }
        }
      }
    }
  }
  for (const c of children.flat()) {
    appendChild(el, c);
  }
  return el;
}

function appendChild(parent: HTMLElement, child: Child) {
  if (child == null || child === false) return;

  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else if (typeof child === "object" && isReactive(child)) {
    const reactiveText = child as Reactive<string>;
    const node = document.createTextNode(String(get(reactiveText)));
    parent.appendChild(node);
    effect(reactiveText, (next) => {
      node.textContent = String(next);
    });
  } else if (typeof child === "object" && "el" in child) {
    parent.appendChild((child as { el: Node }).el);
  } else if (child instanceof Node) {
    parent.appendChild(child);
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
