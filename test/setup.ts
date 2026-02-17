import { afterEach, beforeEach } from "vitest";
import { resetBuildCounter, setBuildMode } from "../packages/dom/src/tags";

beforeEach(() => {
  setBuildMode("normal");
  resetBuildCounter();
});

afterEach(() => {
  document.body.innerHTML = "";
  setBuildMode("normal");
  resetBuildCounter();
});
