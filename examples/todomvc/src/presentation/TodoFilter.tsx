/** @jsxImportSource @synx/jsx */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { defineComponent } from "@synx/dom/component";

function createTodoFilter() {
  const [filterSelected, emitFilterChanged] = E.create<string>();

  const selectedFilter = E.stepper(filterSelected, "all");

  const emitAll = () => emitFilterChanged("all");
  const emitActive = () => emitFilterChanged("active");
  const emitCompleted = () => emitFilterChanged("completed");

  const el = (
    <ul class="filters">
      <li class={{ active: R.map(selectedFilter, (value) => value === "all") }}>
        <button on={{ click: emitAll }}>All</button>
      </li>
      <li class={{ active: R.map(selectedFilter, (value) => value === "active") }}>
        <button on={{ click: emitActive }}>Active</button>
      </li>
      <li class={{ active: R.map(selectedFilter, (value) => value === "completed") }}>
        <button on={{ click: emitCompleted }}>Completed</button>
      </li>
    </ul>
  );

  return {
    el,
    props: {},
    outputs: { filter: filterSelected },
  };
}

export const TodoFilter = defineComponent(createTodoFilter);
