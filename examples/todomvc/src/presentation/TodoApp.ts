import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { model, on } from "@synx/dom";
import {
  section,
  header,
  h1,
  input,
  footer,
  span,
  button,
} from "@synx/dom/tags";
import { defineComponent, Ref, refOutput } from "@synx/dom/component";
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

// === Helper Functions ===

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

// === Component ===

function createTodoApp() {
  // Child components
  const todoFilter = TodoFilter();
  const todoListRef = Ref<ReturnType<typeof TodoList>>();

  // Create input element
  const newTodoInput = input({
    class: "new-todo",
    placeholder: "What needs to be done?",
    value: "",
  });

  const newTodoKeydown = on(newTodoInput, "keydown");
  const newTodoTitle = E.stepper(model(newTodoInput), "");

  // Add todo flow
  const enterPressed = E.filter(newTodoKeydown, (event) => event.key === "Enter");
  const titleEntered = E.tag(enterPressed, newTodoTitle);
  const validTitleEntered = E.filter(
    titleEntered,
    (title) => {
      const isValid = title.trim().length > 0;
      console.log("validTitleEntered check:", title, "isValid:", isValid);
      return isValid;
    }
  );

  const addTodoAction = E.map(
    validTitleEntered,
    (title) => {
      console.log("addTodoAction triggered with title:", title);
      newTodoInput.value = "";
      return (state: Todo[]) => addTodo(title, state);
    }
  );

  const clearCompletedButton = button(
    { class: "clear-completed" },
    "Clear completed"
  );

  // Event sources
  const clearCompletedClick = on(clearCompletedButton, "click");

  // Todo CRUD actions
  const toggleTodoAction = E.map(
    refOutput<string>(todoListRef as any, "completed"),
    (id) => (state: Todo[]) => toggleCompleted(id, state)
  );

  const deleteTodoAction = E.map(
    refOutput<string>(todoListRef as any, "deleted"),
    (id) => (state: Todo[]) => removeTodo(id, state)
  );

  const editTodoAction = E.map(
    refOutput<{ id: string; title: string }>(todoListRef as any, "edited"),
    ({ id, title }) => (state: Todo[]) => editTitle(id, title, state)
  );

  const clearCompletedAction = E.map(
    clearCompletedClick,
    () => (state: Todo[]) => clearCompleted(state)
  );

  // State management
  const todoActions = E.mergeAll([
    addTodoAction,
    toggleTodoAction,
    deleteTodoAction,
    editTodoAction,
    clearCompletedAction,
  ]);

  // Load initial todos from localStorage
  const initialTodos = loadTodos();
  console.log("Initial todos from localStorage:", initialTodos);
  const todos = E.fold(todoActions, initialTodos, (state, action) => {
    console.log("E.fold: current state:", state, "applying action");
    const newState = action(state);
    console.log("E.fold: new state:", newState);
    return newState;
  });

  // Persist todos to localStorage whenever they change
  R.effect(todos, (currentTodos) => {
    saveTodos(currentTodos);
  });

  // Derived state
  const filter = E.stepper(
    E.map(todoFilter.outputs.filter, toFilter),
    "all" as Filter
  );

  const filterFunction = R.map(
    filter,
    (activeFilter) => (allTodos: Todo[]) => filterTodos(allTodos, activeFilter)
  );

  const filteredTodos = R.ap(todos, filterFunction);

  const remainingCount = R.map(todos, getRemainingCount);

  const remainingLabel = span(
    { class: "todo-count" },
    R.map(remainingCount, formatRemainingLabel)
  );

  // Todo list component
  const todoList = TodoList({ ref: todoListRef, todos: filteredTodos });

  // Layout
  const todoApp = section(
    { class: "todoapp" },
    header(
      { class: "header" },
      h1({}, "todos"),
      newTodoInput
    ),
    section({ class: "main" }, todoList.el),
    footer(
      { class: "footer" },
      remainingLabel,
      todoFilter.el,
      clearCompletedButton
    )
  );

  return {
    el: todoApp,
    props: {},
    outputs: {},
  };
}

export const TodoApp = defineComponent(createTodoApp);
