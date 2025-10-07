import { bind } from "./bind";
import { Reactive, isReactive } from "@synx/frp/reactive";

type Child = Node | string | Reactive<string | number | boolean>;
type Attrs = Record<string, any>;

/**
 * Create a DOM element from a tag name, attributes, and children.
 */
function createTag<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return function (
    attrs: Attrs = {},
    ...children: Child[]
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);

    // handle attributes
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "ref" && typeof value === "function") {
        // ref(el)
        value(el);
      } else if (key.startsWith("on") && typeof value === "function") {
        // events like onClick, onInput
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value && typeof value === "object" && "subscribe" in value) {
        // reactive attribute binding
        bind(el, key as any, value as Reactive<any>);
      } else {
        // normal attributes
        el.setAttribute(key, value);
      }
    }

    // handle children
    for (const child of children) {
      if (child == null) continue;
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      } else if (isReactive(child)) {
        // reactive text node
        const textNode = document.createTextNode("");
        el.appendChild(textNode);
        bind(textNode, "text", child as Reactive<any>);
      }
    }

    return el;
  };
}

// Common tags
export const div = createTag("div");
export const span = createTag("span");
export const input = createTag("input");
export const button = createTag("button");
export const ul = createTag("ul");
export const li = createTag("li");
export const p = createTag("p");
export const h1 = createTag("h1");
export const h2 = createTag("h2");
export const h3 = createTag("h3");
export const form = createTag("form");
export const label = createTag("label");
export const section = createTag("section");
export const header = createTag("header");
export const footer = createTag("footer");
export const main = createTag("main");
export const article = createTag("article");
export const nav = createTag("nav");

// Generic export for flexibility
export const tag = createTag;
