import { describe, expect, it, vi } from "vitest";
import * as E from "@synx/frp/event";
import { Ref } from "./component/ref";
import {
  type LazyElement,
  getBindingId,
  getBuildCounter,
  h,
  isLazyElement,
  resetBuildCounter,
  setBuildCounter,
  setBuildMode,
  withDelegationRoot,
} from "./tags";

describe("h() - Basic Element Creation", () => {
  it("should create element in normal mode", () => {
    const el = h("div", { id: "root" });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect((el as HTMLDivElement).id).toBe("root");
  });

  it("should create lazy element in structure/bind mode", () => {
    setBuildMode("structure");
    const structured = h("div");
    expect(isLazyElement(structured)).toBe(true);

    setBuildMode("bind");
    const bound = h("div");
    expect(isLazyElement(bound)).toBe(true);
  });

  it("should assign unique binding IDs", () => {
    setBuildMode("structure");
    const first = h("div") as LazyElement<HTMLDivElement>;
    const second = h("span") as LazyElement<HTMLSpanElement>;

    const firstEl = first.build("structure");
    const secondEl = second.build("structure");

    expect(getBindingId(firstEl)).toBe(0);
    expect(getBindingId(secondEl)).toBe(1);
    expect(getBuildCounter()).toBe(2);
  });

  it("should handle empty children", () => {
    const el = h("div", {});
    expect((el as HTMLDivElement).childNodes.length).toBe(0);
  });

  it("should handle text children", () => {
    const el = h("div", {}, "hello");
    expect((el as HTMLDivElement).textContent).toBe("hello");
  });

  it("should handle number children", () => {
    const el = h("div", {}, 42);
    expect((el as HTMLDivElement).textContent).toBe("42");
  });
});

describe("h() - Props Binding", () => {
  it("should set static attributes", () => {
    const el = h("input", {
      id: "name",
      title: "Name input",
      disabled: true,
    }) as HTMLInputElement;

    expect(el.id).toBe("name");
    expect(el.title).toBe("Name input");
    expect(el.hasAttribute("disabled")).toBe(true);
  });

  it("should bind reactive attributes", () => {
    const [titleEv, emitTitle] = E.create<string>();
    const title = E.stepper(titleEv, "first");
    const el = h("div", { title }) as HTMLDivElement;

    expect(el.title).toBe("first");
    emitTitle("second");
    expect(el.title).toBe("second");
  });

  it("should handle refs", () => {
    const refFn = vi.fn<(el: HTMLDivElement) => void>();
    const refObj = Ref<HTMLDivElement>();
    const el = h("div", { ref: refFn }) as HTMLDivElement;
    h("div", { ref: refObj });

    expect(refFn).toHaveBeenCalledWith(el);
    expect(refObj.current()).toBeInstanceOf(HTMLDivElement);
  });

  it("should handle static classes", () => {
    const el = h("div", { class: "a b" }) as HTMLDivElement;
    expect(el.className).toBe("a b");
  });

  it("should handle reactive classes", () => {
    const [ev, emit] = E.create<string>();
    const cls = E.stepper(ev, "one");
    const el = h("div", { class: cls }) as HTMLDivElement;
    expect(el.className).toBe("one");
    emit("two");
    expect(el.className).toBe("two");
  });

  it("should handle conditional classes", () => {
    const [activeEv, emitActive] = E.create<boolean>();
    const active = E.stepper(activeEv, false);
    const el = h("div", { class: { done: true, active } }) as HTMLDivElement;

    expect(el.classList.contains("done")).toBe(true);
    expect(el.classList.contains("active")).toBe(false);

    emitActive(true);
    expect(el.classList.contains("active")).toBe(true);
  });

  it("should handle static styles", () => {
    const el = h("div", {
      style: { color: "red", backgroundColor: "black" },
    }) as HTMLDivElement;
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundColor).toBe("black");
  });

  it("should handle reactive styles", () => {
    const [styleEv, emitStyle] = E.create<{ color: string }>();
    const style = E.stepper(styleEv, { color: "red" });
    const el = h("div", { style }) as HTMLDivElement;

    expect(el.style.color).toBe("red");
    emitStyle({ color: "blue" });
    expect(el.style.color).toBe("blue");
  });

  it("should handle data-* attributes", () => {
    const [ev, emit] = E.create<string>();
    const dataValue = E.stepper(ev, "a");
    const el = h("div", { "data-testid": dataValue }) as HTMLDivElement;

    expect(el.getAttribute("data-testid")).toBe("a");
    emit("b");
    expect(el.getAttribute("data-testid")).toBe("b");
  });

  it("should handle aria-* attributes", () => {
    const [ev, emit] = E.create<string>();
    const aria = E.stepper(ev, "false");
    const el = h("button", { "aria-pressed": aria }) as HTMLButtonElement;

    expect(el.getAttribute("aria-pressed")).toBe("false");
    emit("true");
    expect(el.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("h() - Event Handling", () => {
  it("should attach event listeners in normal mode", () => {
    const onClick = vi.fn();
    const el = h("button", { on: { click: onClick } }) as HTMLButtonElement;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should attach event listeners in bind mode", () => {
    resetBuildCounter();
    setBuildMode("structure");
    const structured = h("button", {}) as LazyElement<HTMLButtonElement>;
    const template = structured.build("structure");
    const id = Number(template.getAttribute("data-binding-id"));

    const onClick = vi.fn();
    setBuildCounter(id);
    setBuildMode("bind");
    const bound = h("button", { on: { click: onClick } }) as LazyElement<HTMLButtonElement>;
    const cloned = template.cloneNode(true) as HTMLButtonElement;
    const map = new Map<number, HTMLElement>([[id, cloned]]);
    const el = bound.build("bind", map);

    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should use event delegation when available", () => {
    const root = document.createElement("div");
    const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const onClick = vi.fn();

    const el = withDelegationRoot(root, () =>
      h("button", { on: { click: onClick } }) as HTMLButtonElement
    );
    root.appendChild(el);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const clickContexts = addSpy.mock.contexts.filter(
      (ctx, idx) => addSpy.mock.calls[idx]?.[0] === "click"
    );

    expect(clickContexts.includes(root)).toBe(true);
    expect(clickContexts.includes(el)).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it("should handle non-bubbling events directly", () => {
    const root = document.createElement("div");
    const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const onFocus = vi.fn();

    const el = withDelegationRoot(root, () =>
      h("input", { on: { focus: onFocus } }) as HTMLInputElement
    );
    root.appendChild(el);
    el.dispatchEvent(new FocusEvent("focus"));

    const focusContexts = addSpy.mock.contexts.filter(
      (ctx, idx) => addSpy.mock.calls[idx]?.[0] === "focus"
    );

    expect(focusContexts.includes(el)).toBe(true);
    expect(focusContexts.includes(root)).toBe(false);
    expect(onFocus).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });
});

describe("h() - Children Processing", () => {
  it("should handle LazyElement children", () => {
    setBuildMode("structure");
    const child = h("span", {}, "child") as LazyElement<HTMLSpanElement>;
    setBuildMode("normal");
    const parent = h("div", {}, child) as HTMLDivElement;

    expect(parent.firstElementChild).toBeInstanceOf(HTMLSpanElement);
    expect(parent.textContent).toBe("child");
  });

  it("should handle component children", () => {
    const child = document.createElement("em");
    child.textContent = "component";
    const parent = h("div", {}, { el: child } as any) as HTMLDivElement;
    expect(parent.firstChild).toBe(child);
    expect(parent.textContent).toBe("component");
  });

  it("should handle reactive text children", () => {
    const [ev, emit] = E.create<string>();
    const text = E.stepper(ev, "first");
    const parent = h("div", {}, text) as HTMLDivElement;
    expect(parent.textContent).toBe("first");

    emit("second");
    expect(parent.textContent).toBe("second");
  });

  it("should handle function children (each)", () => {
    const mount = vi.fn((parent: HTMLElement) => {
      parent.appendChild(document.createTextNode("mounted"));
      return () => {};
    });
    const parent = h("div", {}, mount) as HTMLDivElement;
    expect(mount).toHaveBeenCalledTimes(1);
    expect(parent.textContent).toBe("mounted");
  });

  it("should create placeholders for components in structure mode", () => {
    setBuildMode("structure");
    const lazy = h("div", {}, { el: document.createElement("span") } as any) as LazyElement<HTMLDivElement>;
    const built = lazy.build("structure");

    expect(built.childNodes.length).toBe(1);
    expect(built.childNodes[0].nodeType).toBe(Node.COMMENT_NODE);
  });

  it("should replace placeholders in bind mode", () => {
    resetBuildCounter();
    setBuildMode("structure");
    const structured = h("div", {}, { el: document.createElement("span") } as any) as LazyElement<HTMLDivElement>;
    const template = structured.build("structure");
    const id = Number(template.getAttribute("data-binding-id"));

    const componentEl = document.createElement("strong");
    componentEl.textContent = "bound-component";
    setBuildCounter(id);
    setBuildMode("bind");
    const bound = h("div", {}, { el: componentEl } as any) as LazyElement<HTMLDivElement>;
    const clone = template.cloneNode(true) as HTMLDivElement;
    const map = new Map<number, HTMLElement>([[id, clone]]);
    const el = bound.build("bind", map);

    expect(el.firstChild).toBe(componentEl);
    expect(el.textContent).toBe("bound-component");
  });

  it("should maintain childIndex correctly", () => {
    resetBuildCounter();
    setBuildMode("structure");
    const structured = h(
      "div",
      {},
      "before",
      { el: document.createElement("span") } as any,
      "after"
    ) as LazyElement<HTMLDivElement>;
    const template = structured.build("structure");
    const id = Number(template.getAttribute("data-binding-id"));

    const componentEl = document.createElement("b");
    componentEl.textContent = "middle";
    setBuildCounter(id);
    setBuildMode("bind");
    const bound = h("div", {}, "before", { el: componentEl } as any, "after") as LazyElement<HTMLDivElement>;
    const clone = template.cloneNode(true) as HTMLDivElement;
    const map = new Map<number, HTMLElement>([[id, clone]]);
    const el = bound.build("bind", map);

    expect(el.childNodes[0].textContent).toBe("before");
    expect(el.childNodes[1]).toBe(componentEl);
    expect(el.childNodes[2].textContent).toBe("after");
  });
});

describe("h() - Build Modes", () => {
  it("should build immediately in normal mode", () => {
    const el = h("div", { id: "immediate" });
    expect(isLazyElement(el)).toBe(false);
    expect((el as HTMLDivElement).id).toBe("immediate");
  });

  describe.each([
    ["structure", "structure"],
    ["bind", "bind"],
  ] as const)("in %s mode", (_modeName, mode) => {
    it("should return LazyElement", () => {
      setBuildMode(mode);
      const el = h("div");
      expect(isLazyElement(el)).toBe(true);
    });
  });

  it("should register binding ID in WeakMap in structure mode", () => {
    setBuildMode("structure");
    const lazy = h("div") as LazyElement<HTMLDivElement>;
    const built = lazy.build("structure");
    expect(getBindingId(built)).toBeDefined();
  });

  it("should retrieve from bindingMap in bind mode", () => {
    resetBuildCounter();
    setBuildMode("structure");
    const structured = h("div", { title: "from-structure" }) as LazyElement<HTMLDivElement>;
    const template = structured.build("structure");
    const id = Number(template.getAttribute("data-binding-id"));

    setBuildCounter(id);
    setBuildMode("bind");
    const bound = h("div", { title: "from-bind" }) as LazyElement<HTMLDivElement>;
    const clone = template.cloneNode(true) as HTMLDivElement;
    const map = new Map<number, HTMLElement>([[id, clone]]);
    const el = bound.build("bind", map);

    expect(el).toBe(clone);
    expect(el.title).toBe("from-structure");
  });

  it("should throw error if binding ID not found", () => {
    resetBuildCounter();
    setBuildMode("bind");
    const lazy = h("div") as LazyElement<HTMLDivElement>;
    expect(() => lazy.build("bind", new Map())).toThrow(/not found/i);
  });
});
