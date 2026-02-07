import * as E from "@synx/frp/event";
import { ul, li, button } from "@synx/dom/tags";
import { defineComponent } from "@synx/dom/component";

function createTodoFilter() {
  const [filterSelected, emitFilterChanged] = E.create<string>();

  const emitAll = () => emitFilterChanged("all");
  const emitActive = () => emitFilterChanged("active");
  const emitCompleted = () => emitFilterChanged("completed");

  const el = ul({},
    li({}, button({ on: { click: emitAll } }, "All")),
    li({}, button({ on: { click: emitActive } }, "Active")),
    li({}, button({ on: { click: emitCompleted } }, "Completed")),
  );

  return {
    el,
    props: {},
    outputs: { filter: filterSelected },
  };
}

export const TodoFilter = defineComponent(createTodoFilter);