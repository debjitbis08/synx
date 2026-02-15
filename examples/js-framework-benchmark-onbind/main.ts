import { bind, bindClass, on, onDelegated, queryRequired, each } from "@synx/dom";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";

type Row = {
  id: number;
  label: string;
};

const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];

const colors = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
];

const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

const runButton = queryRequired<HTMLButtonElement>("#run");
const runLotsButton = queryRequired<HTMLButtonElement>("#runlots");
const addButton = queryRequired<HTMLButtonElement>("#add");
const updateButton = queryRequired<HTMLButtonElement>("#update");
const clearButton = queryRequired<HTMLButtonElement>("#clear");
const swapRowsButton = queryRequired<HTMLButtonElement>("#swaprows");
const tbodyEl = queryRequired<HTMLTableSectionElement>("#tbody");
const rowTemplate = queryRequired<HTMLTemplateElement>("#row-template");

let nextId = 1;
const next = () => nextId++;

const runClicked = on(runButton, "click");
const runLotsClicked = on(runLotsButton, "click");
const addClicked = on(addButton, "click");
const updateClicked = on(updateButton, "click");
const clearClicked = on(clearButton, "click");
const swapRowsClicked = on(swapRowsButton, "click");

const rowSelected = E.map(
  onDelegated<HTMLAnchorElement, "click">(tbodyEl, "click", '[data-action="select"]'),
  ({ target }) => Number(target.dataset.id)
);

const rowRemoved = E.map(
  onDelegated<HTMLAnchorElement, "click">(tbodyEl, "click", '[data-action="remove"]'),
  ({ target }) => Number(target.dataset.id)
);

const dataUpdates = E.mergeAll([
  E.map(runClicked, () => (_rows: Row[]) => buildData(1000, next)),
  E.map(runLotsClicked, () => (_rows: Row[]) => buildData(10_000, next)),
  E.map(addClicked, () => (rows: Row[]) => appendRows(rows, buildData(1000, next))),
  E.map(updateClicked, () => (rows: Row[]) => {
    const nextRows = rows.slice();
    for (let i = 0; i < nextRows.length; i += 10) {
      const row = nextRows[i];
      nextRows[i] = { ...row, label: `${row.label} !!!` };
    }
    return nextRows;
  }),
  E.map(clearClicked, () => (_rows: Row[]) => []),
  E.map(swapRowsClicked, () => (rows: Row[]) => {
    if (rows.length < 999) return rows;
    const nextRows = rows.slice();
    const item = nextRows[1];
    nextRows[1] = nextRows[998];
    nextRows[998] = item;
    return nextRows;
  }),
  E.map(rowRemoved, (id) => (rows: Row[]) => rows.filter((row) => row.id !== id)),
]);

const rows = E.fold(dataUpdates, [] as Row[], (current, update) => update(current));

const selectedUpdates = E.mergeAll([
  E.map(rowSelected, (id) => (_current: number | null) => id),
  E.map(runClicked, () => (_current: number | null) => null),
  E.map(runLotsClicked, () => (_current: number | null) => null),
  E.map(clearClicked, () => (_current: number | null) => null),
  E.map(rowRemoved, (id) => (current: number | null) => (current === id ? null : current)),
]);

const selectedId = E.fold(selectedUpdates, null as number | null, (current, update) =>
  update(current)
);

const rowNodes = each(rows, {
  key: (row) => row.id,
  create: (row) => {
    const fragment = rowTemplate.content.cloneNode(true) as DocumentFragment;
    const tr = fragment.querySelector("tr") as HTMLTableRowElement;
    const idCell = fragment.querySelector('[data-role="id"]') as HTMLTableCellElement;
    const labelLink = fragment.querySelector('[data-role="label"]') as HTMLAnchorElement;
    const removeLink = fragment.querySelector('[data-action="remove"]') as HTMLAnchorElement;

    const rowValue = R.sample(row);
    const rowId = R.map(row, (item) => item.id);

    tr.dataset.id = String(rowValue.id);
    labelLink.dataset.id = String(rowValue.id);
    removeLink.dataset.id = String(rowValue.id);

    // const unbindId = bind(idCell as any, "text", R.map(rowId, String) as any);
    idCell.textContent = String(rowValue.id);

    const unbindLabel = bind(labelLink as any, "text", R.map(row, (item) => item.label) as any);
    const unbindDanger = bindClass(
      tr,
      "danger",
      R.ap(selectedId, R.map(rowId, (id) => (selected) => selected === id))
    );

    return [
      tr,
      () => {
        // unbindId();
        unbindLabel();
        unbindDanger();
      },
    ] as [Node, () => void];
  },
});

rowNodes(tbodyEl);

function buildData(count: number, nextIdValue: () => number): Row[] {
  const data = new Array<Row>(count);
  for (let i = 0; i < count; i += 1) {
    data[i] = {
      id: nextIdValue(),
      label: `${pick(adjectives)} ${pick(colors)} ${pick(nouns)}`,
    };
  }
  return data;
}

function pick(values: readonly string[]): string {
  return values[Math.floor(Math.random() * values.length)];
}

function appendRows(rows: Row[], added: Row[]): Row[] {
  const left = rows.length;
  const right = added.length;
  const merged = new Array<Row>(left + right);

  for (let i = 0; i < left; i += 1) {
    merged[i] = rows[i];
  }

  for (let i = 0; i < right; i += 1) {
    merged[left + i] = added[i];
  }

  return merged;
}
