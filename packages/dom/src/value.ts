import { Event, of, map, never } from "@synx/frp/event";
import { on } from "./on";

export type ModelOptions = {
  type?: "string" | "number" | "boolean";
  lazy?: boolean;
};

export type ModelElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | NodeListOf<HTMLInputElement>
  | HTMLInputElement[];

type ModelReturn<T> = T extends HTMLTextAreaElement
  ? Event<string>
  : T extends HTMLSelectElement
  ? T["multiple"] extends true
    ? Event<string[]>
    : Event<string>
  : T extends HTMLInputElement
  ? T["type"] extends "checkbox"
    ? Event<boolean>
    : T["type"] extends "number"
    ? Event<number>
    : T["type"] extends "radio"
    ? Event<string | undefined>
    : Event<string>
  : T extends NodeListOf<HTMLInputElement>
  ? T extends NodeListOf<infer I>
    ? I extends { type: "checkbox" }
      ? Event<string[]>
      : I extends { type: "radio" }
      ? Event<string | undefined>
      : Event<any>
    : Event<any>
  : T extends HTMLInputElement[]
  ? Event<string[]>
  : Event<any>;

export function model<T extends ModelElement>(
  el: T,
  options: ModelOptions = {}
): ModelReturn<T> {
  const eventName = options.lazy ? "change" : "input";

  // Normalize arrays
  if (Array.isArray(el)) {
    if (el.length === 0) return of([]) as ModelReturn<T>;

    const nodeList = document.querySelectorAll<HTMLInputElement>(
      `[name="${el[0].name}"]`
    );

    return model(nodeList, options) as ModelReturn<T>;
  }

  // Handle NodeList (checkbox[] or radio[])
  if (el instanceof NodeList) {
    const first = el[0] as HTMLInputElement | undefined;
    if (!first) return never() as ModelReturn<T>;

    const type = first.type;

    if (type === "checkbox") {
      return map(on(first, "change"), () => {
        return Array.from(el)
          .filter((e): e is HTMLInputElement => (e as HTMLInputElement).checked)
          .map((e) =>
            options.type === "boolean" ? true : (e as HTMLInputElement).value
          );
      }) as ModelReturn<T>;
    }

    if (type === "radio") {
      return map(on(first, "change"), () => {
        const selected = Array.from(el).find(
          (e) => (e as HTMLInputElement).checked
        );
        return (selected as HTMLInputElement)?.value ?? undefined;
      }) as ModelReturn<T>;
    }

    throw new Error(`model() does not support NodeList of input type: ${type}`);
  }

  // Handle <select multiple>
  if (el instanceof HTMLSelectElement) {
    if (el.multiple) {
      return map(on(el, "change"), () => {
        return Array.from(el.selectedOptions).map((o) => o.value);
      }) as ModelReturn<T>;
    }

    return map(on(el, "change"), () => el.value) as ModelReturn<T>;
  }

  // Handle <textarea>
  if (el instanceof HTMLTextAreaElement) {
     return map(on(el, "change"), () => el.value) as ModelReturn<T>;
  }

  // Handle <input>
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case "checkbox":
        return map(on(el, "change"), () => {
          return options.type === "string"
            ? String(el.checked)
            : options.type === "number"
            ? +el.checked
            : el.checked;
        }) as ModelReturn<T>;

      case "radio":
        return map(on(el, "change"), () => (el.checked ? el.value : undefined)) as ModelReturn<T>;

      case "number":
        return map(on(el, eventName), () =>
          options.type === "string" ? el.value : parseFloat(el.value)
        ) as ModelReturn<T>;

      default:
        return map(on(el, eventName), () => el.value) as ModelReturn<T>;
    }
  }


  throw new Error("Unsupported element type passed to model()");
}
