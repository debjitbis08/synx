import { describe, expect, it, vi } from "vitest";
import * as E from "@synx/frp/event";
import { get } from "@synx/frp/reactive";
import { h, resetBuildCounter, setBuildMode } from "../tags";
import { defineComponent, Prop } from "./define";
import { Ref, RefMap } from "./ref";

describe("defineComponent - Basic Creation", () => {
  it("should create component function", () => {
    const Comp = defineComponent(() => ({
      el: h("div", {}, "ok") as HTMLElement,
      props: {},
      outputs: {},
    }));
    expect(typeof Comp).toBe("function");
  });

  it("should return instance with el, props, outputs", () => {
    const Comp = defineComponent(() => ({
      el: h("div", {}, "ok") as HTMLElement,
      props: {},
      outputs: { ready: E.of(true) },
    }));

    const instance = Comp();
    expect(instance.el).toBeInstanceOf(HTMLElement);
    expect(instance.props).toBeTypeOf("object");
    expect(instance.outputs).toBeTypeOf("object");
    expect(instance.cleanup).toBeTypeOf("function");
  });

  it("should cache template after first creation", () => {
    const createSpy = vi.fn(() => ({
      el: h("div", {}, h("span", {}, "child")) as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Comp = defineComponent(createSpy);

    Comp();
    Comp();
    Comp();

    // First call = structure + bind, subsequent calls = bind only
    expect(createSpy).toHaveBeenCalledTimes(4);
  });

  it("should clone template for subsequent instances", () => {
    const Comp = defineComponent(() => ({
      el: h("div", { class: "item" }, h("span", {}, "x")) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const a = Comp();
    const b = Comp();

    expect(a.el).not.toBe(b.el);
    expect((a.el as HTMLElement).outerHTML).toBe((b.el as HTMLElement).outerHTML);
  });

  it("should handle empty component (no children, no props)", () => {
    const Empty = defineComponent(() => ({
      el: h("div") as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Empty();
    expect(instance.el).toBeInstanceOf(HTMLElement);
    expect((instance.el as HTMLElement).childNodes.length).toBe(0);
  });
});

describe("defineComponent - Props", () => {
  it("should accept initial props", () => {
    const Comp = defineComponent<{ label: string }, any>((initial) => {
      const label = Prop(initial.label ?? "");
      return {
        el: h("div", {}, label.prop) as HTMLElement,
        props: { label },
        outputs: {},
      };
    });

    const instance = Comp({ label: "hello" });
    expect((instance.el as HTMLElement).textContent).toBe("hello");
  });

  it("should handle reactive props", () => {
    const [ev, emit] = E.create<string>();
    const labelR = E.stepper(ev, "a");

    const Comp = defineComponent<{ label: string }, any>((initial) => {
      const label = Prop(initial.label ?? "");
      return {
        el: h("div", {}, label.prop) as HTMLElement,
        props: { label },
        outputs: {},
      };
    });

    const instance = Comp({ label: labelR });
    expect((instance.el as HTMLElement).textContent).toBe("a");

    emit("b");
    expect((instance.el as HTMLElement).textContent).toBe("b");
  });

  it("should handle component with only reactive props", () => {
    const [countEv, emitCount] = E.create<number>();
    const count = E.stepper(countEv, 1);

    const ReactiveOnly = defineComponent<{ count: number }, any>((initial) => {
      const c = Prop(initial.count);
      return {
        el: h("span", {}, c.prop) as HTMLElement,
        props: { count: c },
        outputs: {},
      };
    });

    const instance = ReactiveOnly({ count });
    expect((instance.el as HTMLElement).textContent).toBe("1");
    emitCount(2);
    expect((instance.el as HTMLElement).textContent).toBe("2");
  });

  it("should wire prop emitters", () => {
    const emitSpy = vi.fn();
    const propR = E.stepper(E.never<string>(), "");

    const Comp = defineComponent<{ value: string }, any>(() => ({
      el: h("div") as HTMLElement,
      props: {
        value: {
          prop: propR,
          emit: emitSpy,
        },
      },
      outputs: {},
    }));

    Comp({ value: "x" });
    expect(emitSpy).toHaveBeenCalledWith("x");
  });

  it("should handle children prop", () => {
    const seenChildren = vi.fn();
    const Comp = defineComponent<{ id: string }, any>((initial) => {
      seenChildren(initial.children);
      return {
        el: h("div", { "data-id": initial.id }, ...(initial.children ?? [])) as HTMLElement,
        props: { id: Prop(initial.id ?? "") },
        outputs: {},
      };
    });

    const instance = Comp({ id: "1" }, "a", "b");
    expect(seenChildren).toHaveBeenCalled();
    expect((instance.el as HTMLElement).textContent).toBe("ab");
  });
});

describe("defineComponent - Binding IDs", () => {
  it("should assign consistent IDs between structure and bind modes", () => {
    const Comp = defineComponent(() => ({
      el: h("div", {}, h("span", {}, "x"), h("button", {}, "y")) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const a = Comp();
    const b = Comp();
    const idsA = Array.from(
      (a.el as HTMLElement).querySelectorAll("[data-binding-id]")
    ).map((el) => el.getAttribute("data-binding-id"));
    const idsB = Array.from(
      (b.el as HTMLElement).querySelectorAll("[data-binding-id]")
    ).map((el) => el.getAttribute("data-binding-id"));

    expect((a.el as HTMLElement).getAttribute("data-binding-id")).toBe(
      (b.el as HTMLElement).getAttribute("data-binding-id")
    );
    expect(idsA).toEqual(idsB);
  });

  it("should handle nested components correctly", () => {
    const Child = defineComponent(() => ({
      el: h("span", {}, "child") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Parent = defineComponent(() => ({
      el: h("div", {}, Child()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Parent();
    expect((instance.el as HTMLElement).querySelector("span")?.textContent).toBe("child");
  });

  it("should not reset counter for nested components", () => {
    resetBuildCounter();
    setBuildMode("normal");

    const Child = defineComponent(() => ({
      el: h("span", {}, "child") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Parent = defineComponent(() => ({
      el: h("div", {}, Child(), Child()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    Parent();
    const afterFirst = (document.body.querySelectorAll("[data-binding-id]").length);
    expect(afterFirst).toBe(0);
  });

  it("should restore counter correctly in bind mode", () => {
    resetBuildCounter();
    const Comp = defineComponent(() => ({
      el: h("section", {}, h("div"), h("div")) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const a = Comp();
    const b = Comp();

    const idsA = [
      (a.el as HTMLElement).getAttribute("data-binding-id"),
      ...(Array.from((a.el as HTMLElement).querySelectorAll("[data-binding-id]")).map((x) =>
        x.getAttribute("data-binding-id")
      )),
    ];
    const idsB = [
      (b.el as HTMLElement).getAttribute("data-binding-id"),
      ...(Array.from((b.el as HTMLElement).querySelectorAll("[data-binding-id]")).map((x) =>
        x.getAttribute("data-binding-id")
      )),
    ];
    expect(idsA).toEqual(idsB);
  });
});

describe("defineComponent - Template Caching", () => {
  it("should build template only once", () => {
    const modeLog: string[] = [];
    const Comp = defineComponent(() => {
      modeLog.push(String((h("div") as any)._lazyType ? "lazy" : "normal"));
      return {
        el: h("div", {}, h("span", {}, "x")) as HTMLElement,
        props: {},
        outputs: {},
      };
    });

    Comp();
    Comp();
    Comp();

    expect(modeLog.length).toBe(4);
  });

  it("should reuse template for all instances", () => {
    const Comp = defineComponent(() => ({
      el: h("article", {}, h("h1", {}, "title"), h("p", {}, "body")) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const nodes = Array.from({ length: 5 }, () => Comp().el as HTMLElement);
    const html = nodes.map((n) => n.outerHTML);
    expect(new Set(html).size).toBe(1);
  });
});

describe("defineComponent - Nested Components", () => {
  it("should handle multiple nested components", () => {
    const Leaf = defineComponent(() => ({
      el: h("i", {}, "leaf") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Branch = defineComponent(() => ({
      el: h("div", {}, Leaf(), Leaf()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Branch();
    expect((instance.el as HTMLElement).querySelectorAll("i").length).toBe(2);
  });

  it("should handle deeply nested components (3+ levels)", () => {
    const L3 = defineComponent(() => ({
      el: h("span", {}, "3") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const L2 = defineComponent(() => ({
      el: h("div", {}, L3()) as HTMLElement,
      props: {},
      outputs: {},
    }));
    const L1 = defineComponent(() => ({
      el: h("section", {}, L2()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = L1();
    expect((instance.el as HTMLElement).querySelector("span")?.textContent).toBe("3");
  });

  it("should preserve binding ID sequence across nesting", () => {
    const Child = defineComponent(() => ({
      el: h("span", {}, "x") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Parent = defineComponent(() => ({
      el: h("div", {}, h("p", {}, "a"), Child(), h("p", {}, "b")) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const a = Parent();
    const b = Parent();
    const idsA = [
      (a.el as HTMLElement).getAttribute("data-binding-id"),
      ...Array.from((a.el as HTMLElement).querySelectorAll("[data-binding-id]")).map((x) =>
        x.getAttribute("data-binding-id")
      ),
    ];
    const idsB = [
      (b.el as HTMLElement).getAttribute("data-binding-id"),
      ...Array.from((b.el as HTMLElement).querySelectorAll("[data-binding-id]")).map((x) =>
        x.getAttribute("data-binding-id")
      ),
    ];
    expect(idsA).toEqual(idsB);
  });
});

describe("defineComponent - Lifecycle", () => {
  it("should cleanup on dispose", () => {
    const [ev, emit] = E.create<string>();
    const r = E.stepper(ev, "a");
    const Comp = defineComponent(() => ({
      el: h("div", {}, r) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Comp();
    expect((instance.el as HTMLElement).textContent).toBe("a");
    instance.cleanup();
    emit("b");
    expect((instance.el as HTMLElement).textContent).toBe("a");
  });

  it("should call instance cleanup if exists", () => {
    const cleanupSpy = vi.fn();
    const Comp = defineComponent(() => ({
      el: h("div") as HTMLElement,
      props: {},
      outputs: {},
      cleanup: cleanupSpy,
    }));

    const instance = Comp();
    instance.cleanup();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });
});

describe("defineComponent - Refs", () => {
  it("should set ref after creation", () => {
    const Comp = defineComponent(() => ({
      el: h("div", {}, "x") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const ref = Ref<ReturnType<typeof Comp>>();
    const instance = Comp({ ref } as any);

    expect(ref.current()).toBe(instance);
  });

  it("should track component in refs", () => {
    const refs = RefMap<number, { outputs?: Record<string, any> }>();
    const Comp = defineComponent(() => ({
      el: h("div") as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Comp();
    refs.set(1, instance);
    expect(get(refs.size)).toBe(1);
    expect(refs.get(1).current()).toBe(instance);
  });
});
