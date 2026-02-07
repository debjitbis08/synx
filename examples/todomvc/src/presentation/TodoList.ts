import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { ul } from "@synx/dom/tags";
import { defineComponent, Prop, each } from "@synx/dom/component";
import { Todo } from "../domain/Todo";
import { TodoItem } from "./TodoItem";

function createTodoList(initial: { todos: Todo[] }) {
  const todos = Prop(initial.todos);
  const todoItems = each(todos.prop, {
    key: (todo) => todo.id,
    create: (todo) => TodoItem({ todo }),
  });
  const completed = E.switchR(
    R.map(todoItems.outputs<string>("completed"), (events) => E.mergeAll(events)),
  );
  const deleted = E.switchR(
    R.map(todoItems.outputs<string>("deleted"), (events) => E.mergeAll(events)),
  );

  const el = ul(
    { class: "todo-list" },
    todoItems,
  );

  return {
    el,
    props: { todos },
    outputs: { completed, deleted },
  };
}

export const TodoList = defineComponent(createTodoList);
