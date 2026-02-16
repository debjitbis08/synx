/** @jsxImportSource @synx/jsx */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { targetValue, Ref } from "@synx/dom";
import { defineComponent } from "@synx/dom/component";
import {
  Todo,
  addTodo,
  toggleCompleted,
  removeTodo,
  clearCompleted,
  editTitle,
} from "../domain/Todo";
import { TodoFilter } from "./TodoFilter";
import { TodoList } from "./TodoList";
import { loadTodos, saveTodos } from "../storage/localStorage";

type Filter = "all" | "active" | "completed";

function filterTodos(todos: Todo[], filter: Filter): Todo[] {
  if (filter === "active") return todos.filter((todo) => !todo.completed);
  if (filter === "completed") return todos.filter((todo) => todo.completed);
  return todos;
}

function toFilter(value: string): Filter {
  if (value === "active" || value === "completed") return value;
  return "all";
}

function getRemainingCount(todos: Todo[]): number {
  return todos.filter((todo) => !todo.completed).length;
}

function formatRemainingLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"} left`;
}

function createTodoApp() {
  const todoFilter = TodoFilter();
  const todoListRef = Ref<ReturnType<typeof TodoList>>();
  const newTodoInputRef = Ref<HTMLInputElement>();
  const clearCompletedButtonRef = Ref<HTMLButtonElement>();

  const newTodoKeydown = newTodoInputRef.outputs.keydown;
  const newTodoTitle = E.stepper(targetValue(newTodoInputRef.outputs.input), "");

  const enterPressed = E.filter(newTodoKeydown, (event) => event.key === "Enter");
  const titleEntered = E.tag(enterPressed, newTodoTitle);
  const validTitleEntered = E.filter(titleEntered, (title) => title.trim().length > 0);

  const addTodoAction = E.map(validTitleEntered, (title) => {
    const inputEl = newTodoInputRef.current();
    if (inputEl) inputEl.value = "";
    return (state: Todo[]) => addTodo(title, state);
  });

  const toggleTodoAction = E.map(todoListRef.outputs.completed, (id) => (state: Todo[]) => toggleCompleted(id, state));

  const deleteTodoAction = E.map(todoListRef.outputs.deleted, (id) => (state: Todo[]) => removeTodo(id, state));

  const editTodoAction = E.map(
    todoListRef.outputs.edited as E.Event<{ id: string; title: string }>,
    ({ id, title }) => (state: Todo[]) => editTitle(id, title, state)
  );

  const clearCompletedAction = E.map(clearCompletedButtonRef.outputs.click, () => (state: Todo[]) => clearCompleted(state));

  const todoActions = E.mergeAll([
    addTodoAction,
    toggleTodoAction,
    deleteTodoAction,
    editTodoAction,
    clearCompletedAction,
  ]);

  const todos = E.fold(todoActions, loadTodos(), (state, action) => action(state));

  R.effect(todos, (currentTodos) => {
    saveTodos(currentTodos);
  });

  const filter = E.stepper(E.map(todoFilter.outputs.filter, toFilter), "all" as Filter);

  const filterFunction = R.map(
    filter,
    (activeFilter) => (allTodos: Todo[]) => filterTodos(allTodos, activeFilter)
  );

  const filteredTodos = R.ap(todos, filterFunction);
  const remainingCount = R.map(todos, getRemainingCount);

  const todoList = TodoList({ ref: todoListRef, todos: filteredTodos });

  const el = (
    <section class="todoapp">
      <header class="header">
        <h1>todos</h1>
        <input
          ref={newTodoInputRef}
          class="new-todo"
          placeholder="What needs to be done?"
          value=""
        />
      </header>
      <section class="main">{todoList.el}</section>
      <footer class="footer">
        <span class="todo-count">{R.map(remainingCount, formatRemainingLabel)}</span>
        {todoFilter.el}
        <button ref={clearCompletedButtonRef} class="clear-completed">Clear completed</button>
      </footer>
    </section>
  );

  return {
    el,
    props: {},
    outputs: {},
  };
}

export const TodoApp = defineComponent(createTodoApp);
