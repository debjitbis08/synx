import { Reactive, get, effect } from "@synx/frp/reactive";
import type { JSX as SolidJSX } from "solid-js";

type RawJSXMap = SolidJSX.IntrinsicElements;
type StripEvents<T> = {
  [K in keyof T as K extends `on${string}` ? never : K]: T[K];
};
type ElementAttributeMap = {
  [K in keyof RawJSXMap]: StripEvents<RawJSXMap[K]>;
};

const booleanAttrs = new Set([
  "disabled",
  "checked",
  "readonly",
  "required",
  "autofocus",
  "hidden",
  "multiple",
  "selected",
  "open",
  "contenteditable",
]);

function isBooleanAttr(attr: string, tagName?: string): boolean {
  return booleanAttrs.has(attr);
}

export function bind<
  K extends keyof ElementAttributeMap,
  A extends keyof ElementAttributeMap[K]
>(
  el: HTMLElement,
  attr: A,
  reactive: Reactive<NonNullable<ElementAttributeMap[K][A]>>
): () => void {
  const value = get(reactive);

  // Special case: "text" means textContent
  if (attr === "text") {
    el.textContent = String(value);
    return effect(reactive, (v) => {
      el.textContent = String(v);
    });
  }

  const attrKey = attr as string;

  // Boolean attributes
  if (typeof value === "boolean" || isBooleanAttr(attrKey)) {
    if (value) el.setAttribute(attrKey, "");
    else el.removeAttribute(attrKey);
    return effect(reactive, (v) => {
      if (v) el.setAttribute(attrKey, "");
      else el.removeAttribute(attrKey);
    });
  }

  // Everything else = string attribute
  el.setAttribute(attrKey, String(value));
  return effect(reactive, (v) => {
    el.setAttribute(attrKey, String(v));
  });
}

export function bindClass(
  el: HTMLElement,
  className: string,
  reactive: Reactive<boolean>
): () => void {
  el.classList.toggle(className, get(reactive));

  return effect(reactive, (value) => {
    el.classList.toggle(className, value);
  });
}

export function bindClasses(
  el: HTMLElement,
  classes: Record<string, Reactive<boolean>>
): () => void {
  const unsubscribers: (() => void)[] = [];

  for (const className in classes) {
    const reactive = classes[className];
    const unsubscribe = bindClass(el, className, reactive);
    unsubscribers.push(unsubscribe);
  }

  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}

function toKebabCase(style: string): string {
  return style.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase());
}

type StyleName = keyof SolidJSX.CSSProperties;

export function bindStyle(
  el: HTMLElement,
  styleName: StyleName,
  reactive: Reactive<string>
): () => void {
  const kebab = toKebabCase(styleName); // always safe here

  el.style.setProperty(kebab, get(reactive));

  return effect(reactive, (value) => {
    el.style.setProperty(kebab, value);
  });
}
