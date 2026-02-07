export type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

export function addTodo(title: string, todos: Todo[]): Todo[] {
  const t = title.trim();
  if (!t) return todos;
  return [{ id: crypto.randomUUID(), title: t, completed: false }, ...todos];
}

export function toggleCompleted(id: string, todos: Todo[]): Todo[] {
  return todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
}

export function setCompleted(id: string, completed: boolean, todos: Todo[]): Todo[] {
  return todos.map((t) => (t.id === id ? { ...t, completed } : t));
}

export function removeTodo(id: string, todos: Todo[]): Todo[] {
  return todos.filter((t) => t.id !== id);
}

export function clearCompleted(todos: Todo[]): Todo[] {
  return todos.filter((t) => !t.completed);
}

export function editTitle(id: string, title: string, todos: Todo[]): Todo[] {
  const t = title.trim();
  return t ? todos.map((x) => (x.id === id ? { ...x, title: t } : x)) : removeTodo(id, todos);
}