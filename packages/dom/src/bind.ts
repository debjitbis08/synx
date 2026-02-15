import { Reactive, get } from "@synx/frp/reactive";
import type { JSX as SolidJSX } from "solid-js";
import {
  trackDisposerInCurrentScope,
  trackReactiveInCurrentScope,
} from "./lifecycle";
import { subscribe } from "../../frp/src/event";

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
  attr: A | "text",
  reactive: Reactive<NonNullable<ElementAttributeMap[K][A]>>
): () => void {
  trackReactiveInCurrentScope(reactive);
  const value = get(reactive);

  // Special case: "text" means textContent
  if (attr === "text") {
    el.textContent = String(value);
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      el.textContent = String(v);
    }));
  }

  const attrKey = attr as string;

  // Special case: data-* attributes
  if (attrKey.startsWith("data-")) {
    el.setAttribute(attrKey, String(value));
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      el.setAttribute(attrKey, String(v));
    }));
  }

  // Special case: input/textarea/select "value" property
  if (attrKey === "value" && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    el.value = String(value);
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      el.value = String(v);
    }));
  }

  // Boolean attributes
  if (typeof value === "boolean" || isBooleanAttr(attrKey)) {
    if (value) el.setAttribute(attrKey, "");
    else el.removeAttribute(attrKey);
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      if (v) el.setAttribute(attrKey, "");
      else el.removeAttribute(attrKey);
    }));
  }

  // Everything else = use property assignment for known properties (faster than setAttribute)
  if (attrKey === "id") {
    (el as any).id = String(value);
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      (el as any).id = String(v);
    }));
  } else if (attrKey === "title") {
    (el as any).title = String(value);
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      (el as any).title = String(v);
    }));
  } else {
    // Default: use setAttribute
    el.setAttribute(attrKey, String(value));
    return trackDisposerInCurrentScope(subscribe(reactive.changes, (v) => {
      el.setAttribute(attrKey, String(v));
    }));
  }
}

export function bindClass(
  el: HTMLElement,
  className: string,
  reactive: Reactive<boolean>
): () => void {
  trackReactiveInCurrentScope(reactive);
  el.classList.toggle(className, get(reactive));

  return trackDisposerInCurrentScope(subscribe(reactive.changes, (value) => {
    el.classList.toggle(className, value);
  }));
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

  return trackDisposerInCurrentScope(() => {
    for (const unsub of unsubscribers) unsub();
  });
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
  trackReactiveInCurrentScope(reactive);
  const kebab = toKebabCase(styleName); // always safe here

  el.style.setProperty(kebab, get(reactive));

  return trackDisposerInCurrentScope(subscribe(reactive.changes, (value) => {
    el.style.setProperty(kebab, value);
  }));
}
