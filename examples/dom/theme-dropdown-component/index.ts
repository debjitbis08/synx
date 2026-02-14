import { ThemeDropdownApp } from "./src/App";

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("Could not find #app mount node");
}

const app = ThemeDropdownApp();
appRoot.appendChild(app.el);
