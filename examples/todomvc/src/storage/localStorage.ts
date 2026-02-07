import { Todo } from "../domain/Todo";

const STORAGE_KEY = "todos-synx";

export function loadTodos(): Todo[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    // Validate structure
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is Todo => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.completed === "boolean"
      );
    });
  } catch (error) {
    console.error("Failed to load todos from localStorage:", error);
    return [];
  }
}

export function saveTodos(todos: Todo[]): void {
  try {
    const toStore = todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: todo.completed,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.error("Failed to save todos to localStorage:", error);
  }
}
