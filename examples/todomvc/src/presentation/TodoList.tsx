/** @jsxImportSource @synx/jsx */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { defineComponent, Prop, each } from "@synx/dom/component";
import { Todo } from "../domain/Todo";
import { TodoItem } from "./TodoItem";

function createTodoList(initial: { todos: Todo[] }) {
  const todos = Prop(initial.todos);
  const todoItems = each(todos.prop, {
    key: (todo) => todo.id,
    create: (todo) => <TodoItem todo={todo} />,
  });

  const completed = E.switchR(
    R.map(todoItems.outputs<string>("completed"), (events) => E.mergeAll(events))
  );
  const deleted = E.switchR(
    R.map(todoItems.outputs<string>("deleted"), (events) => E.mergeAll(events))
  );
  const edited = E.switchR(
    R.map(todoItems.outputs<{ id: string; title: string }>("edited"), (events) => E.mergeAll(events))
  );

  const el = <ul class="todo-list">{todoItems}</ul>;

  return {
    el,
    props: { todos },
    outputs: { completed, deleted, edited },
  };
}

export const TodoList = defineComponent(createTodoList);
