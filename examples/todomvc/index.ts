import { TodoApp } from "./src/presentation/TodoApp";

// Mount the TodoApp component
const app = document.getElementById("app");
if (app) {
  const todoApp = TodoApp();
  app.appendChild(todoApp.el);
} else {
  console.error("Could not find #app element");
}
