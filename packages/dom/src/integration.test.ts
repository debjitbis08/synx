import { describe, expect, it } from "vitest";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { defineComponent, each, Prop } from "./component/define";
import { h } from "./tags";

describe("Integration - Complex Hierarchies", () => {
  it("should render TodoApp-like structure with multiple nested components", () => {
    type Todo = { id: string; title: string; completed: boolean };
    const [todosEv] = E.create<Todo[]>();
    const todos = E.stepper(todosEv, [
      { id: "1", title: "Write tests", completed: false },
      { id: "2", title: "Review PR", completed: true },
    ]);

    const TodoItem = defineComponent<{ todo: Todo }, any>((initial) => {
      const todo = Prop(initial.todo);
      return {
        el: h(
          "li",
          { class: { completed: R.map(todo.prop, (t) => t.completed) } },
          R.map(todo.prop, (t) => t.title)
        ) as HTMLElement,
        props: { todo },
        outputs: {},
      };
    });

    const TodoList = defineComponent<{ todos: Todo[] }, any>((initial) => {
      const list = Prop(initial.todos);
      return {
        el: h(
          "ul",
          { class: "todo-list" },
          each(list.prop, {
            key: (todo) => todo.id,
            create: (todo) => TodoItem({ todo }),
          })
        ) as HTMLElement,
        props: { todos: list },
        outputs: {},
      };
    });

    const TodoApp = defineComponent(() => ({
      el: h(
        "section",
        { class: "todoapp" },
        h("header", { class: "header" }, h("h1", {}, "todos")),
        h("section", { class: "main" }, TodoList({ todos })),
        h("footer", { class: "footer" }, h("span", { class: "todo-count" }, "2 items left"))
      ) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const app = TodoApp();
    const root = app.el as HTMLElement;

    expect(root.classList.contains("todoapp")).toBe(true);
    expect(root.querySelectorAll(".todo-list li").length).toBe(2);
    expect(root.querySelector(".header h1")?.textContent).toBe("todos");
  });

  it("should handle 10+ level deep nesting", () => {
    const levels = 12;
    const Nested = Array.from({ length: levels }).reduce((Inner, _, idx) => {
      return defineComponent(() => ({
        el: h("div", { [`data-level` as const]: String(idx + 1) }, Inner()) as HTMLElement,
        props: {},
        outputs: {},
      }));
    }, defineComponent(() => ({
      el: h("span", { "data-level": "leaf" }, "leaf") as HTMLElement,
      props: {},
      outputs: {},
    })));

    const tree = Nested();
    const root = tree.el as HTMLElement;
    expect(root.querySelector('[data-level="leaf"]')?.textContent).toBe("leaf");
    expect(root.querySelectorAll("div").length).toBe(levels - 1);
  });

  it("should handle siblings with different nesting depths", () => {
    const Leaf = defineComponent(() => ({
      el: h("span", {}, "leaf") as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Deep = defineComponent(() => ({
      el: h("div", {}, h("div", {}, h("div", {}, Leaf()))) as HTMLElement,
      props: {},
      outputs: {},
    }));
    const Shallow = defineComponent(() => ({
      el: h("div", {}, Leaf()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const App = defineComponent(() => ({
      el: h("main", {}, Deep(), Shallow()) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const app = App();
    const root = app.el as HTMLElement;
    expect(root.querySelectorAll("span").length).toBe(2);
    expect(root.querySelectorAll("div").length).toBe(4);
  });

  it("should handle very large component (1000+ elements) - stress test", () => {
    const Large = defineComponent(() => ({
      el: h(
        "section",
        {},
        ...Array.from({ length: 1200 }, (_, i) => h("div", { "data-i": i }, String(i)))
      ) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = Large();
    const root = instance.el as HTMLElement;
    expect(root.querySelectorAll("div").length).toBe(1200);
    expect(root.querySelector('[data-i="1199"]')?.textContent).toBe("1199");
  });
});

describe("Integration - Dynamic Content", () => {
  it("should work with each() for lists", () => {
    const [listEv, emitList] = E.create<string[]>();
    const list = E.stepper(listEv, ["a", "b"]);
    const Item = defineComponent<{ value: string }, any>((initial) => {
      const value = Prop(initial.value);
      return {
        el: h("li", {}, value.prop) as HTMLElement,
        props: { value },
        outputs: {},
      };
    });

    const List = defineComponent<{ items: string[] }, any>((initial) => {
      const items = Prop(initial.items);
      return {
        el: h(
          "ul",
          {},
          each(items.prop, (item) => Item({ value: item }))
        ) as HTMLElement,
        props: { items },
        outputs: {},
      };
    });

    const instance = List({ items: list });
    const root = instance.el as HTMLElement;
    expect(root.querySelectorAll("li").length).toBe(2);
    expect(root.textContent).toBe("ab");

    emitList(["x", "y", "z"]);
    expect(root.querySelectorAll("li").length).toBe(3);
    expect(root.textContent).toBe("xyz");
  });

  it("should handle reactive children updates", () => {
    const [textEv, emitText] = E.create<string>();
    const text = E.stepper(textEv, "initial");
    const el = h("p", {}, text) as HTMLParagraphElement;

    expect(el.textContent).toBe("initial");
    emitText("updated");
    expect(el.textContent).toBe("updated");
  });

  it("should handle component updates", () => {
    const [valueEv, emitValue] = E.create<string>();
    const value = E.stepper(valueEv, "A");

    const Label = defineComponent<{ value: string }, any>((initial) => {
      const label = Prop(initial.value);
      return {
        el: h("span", {}, label.prop) as HTMLElement,
        props: { value: label },
        outputs: {},
      };
    });

    const instance = Label({ value });
    expect((instance.el as HTMLElement).textContent).toBe("A");

    emitValue("B");
    expect((instance.el as HTMLElement).textContent).toBe("B");
  });
});

describe("Integration - Real World Scenarios", () => {
  it("should render TodoMVC app structure", () => {
    const TodoAppShell = defineComponent(() => ({
      el: h(
        "section",
        { class: "todoapp" },
        h("header", { class: "header" }, h("h1", {}, "todos"), h("input", { class: "new-todo" })),
        h("section", { class: "main" }, h("ul", { class: "todo-list" })),
        h("footer", { class: "footer" }, h("span", { class: "todo-count" }, "0 items left"))
      ) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const app = TodoAppShell();
    const root = app.el as HTMLElement;
    expect(root.querySelector(".new-todo")).toBeTruthy();
    expect(root.querySelector(".todo-list")).toBeTruthy();
    expect(root.querySelector(".todo-count")?.textContent).toContain("items left");
    expect(root.outerHTML).toMatchSnapshot();
  });

  it("should handle form with multiple inputs", () => {
    const [nameEv, emitName] = E.create<string>();
    const [emailEv, emitEmail] = E.create<string>();
    const name = E.stepper(nameEv, "Debjit");
    const email = E.stepper(emailEv, "debjit@example.com");

    const Form = defineComponent(() => ({
      el: h(
        "form",
        {},
        h("input", { id: "name", value: name }),
        h("input", { id: "email", value: email }),
        h("button", { type: "submit" }, "Save")
      ) as HTMLElement,
      props: {},
      outputs: {},
    }));
    const form = Form().el as HTMLFormElement;

    const nameInput = form.querySelector("#name") as HTMLInputElement;
    const emailInput = form.querySelector("#email") as HTMLInputElement;
    expect(nameInput.value).toBe("Debjit");
    expect(emailInput.value).toBe("debjit@example.com");

    emitName("Sam");
    emitEmail("sam@example.com");
    expect(nameInput.value).toBe("Sam");
    expect(emailInput.value).toBe("sam@example.com");
  });

  it("should handle conditional rendering", () => {
    const [visibleEv, emitVisible] = E.create<string[]>();
    const visible = E.stepper(visibleEv, ["Visible"]);
    const Item = defineComponent<{ value: string }, any>((initial) => {
      const value = Prop(initial.value);
      return {
        el: h("span", {}, value.prop) as HTMLElement,
        props: { value },
        outputs: {},
      };
    });

    const ConditionalList = defineComponent(() => ({
      el: h("div", {}, each(visible, (item) => Item({ value: item }))) as HTMLElement,
      props: {},
      outputs: {},
    }));

    const instance = ConditionalList();
    const root = instance.el as HTMLElement;
    expect(root.querySelectorAll("span").length).toBe(1);

    emitVisible([]);
    expect(root.querySelectorAll("span").length).toBe(0);

    emitVisible(["Visible Again"]);
    expect(root.querySelectorAll("span").length).toBe(1);
    expect(root.textContent).toBe("Visible Again");
  });
});
