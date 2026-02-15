/** @jsxImportSource @synx/jsx */
import { Prop, defineComponent, each } from "@synx/dom";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";

type LabelUpdate = (current: string) => string;

type RowModel = {
  id: number;
  label: R.Reactive<string>;
  setLabel: (update: LabelUpdate) => void;
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

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max;
}

function createRowModel(id: number): RowModel {
  const initialLabel = `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`;
  const [labelUpdates, emitLabelUpdate] = E.create<LabelUpdate>();
  const label = E.fold(labelUpdates, initialLabel, (current, update) => update(current));

  return {
    id,
    label,
    setLabel: emitLabelUpdate,
  };
}

function buildData(count: number, nextId: () => number): RowModel[] {
  const data = new Array<RowModel>(count);
  for (let i = 0; i < count; i += 1) {
    data[i] = createRowModel(nextId());
  }
  return data;
}

function createBenchmarkRow(initial: {
  row: RowModel;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const row = Prop(initial.row);
  const isSelected = Prop(initial.isSelected);
  const onSelect = Prop(initial.onSelect);
  const onRemove = Prop(initial.onRemove);

  const rowClass = R.map(isSelected.prop, (selected) => (selected ? "danger" : ""));
  const label = R.chain(row.prop, (item) => item.label);

  const el = (
    <tr data-id={R.map(row.prop, (item) => String(item.id))} class={rowClass}>
      <td class="col-md-1">{R.map(row.prop, (item) => String(item.id))}</td>
      <td class="col-md-4">
        <a
          class="lbl"
          on={{
            click: () => R.sample(onSelect.prop)(R.sample(row.prop).id),
          }}
        >
          {label}
        </a>
      </td>
      <td class="col-md-1">
        <a
          class="remove"
          on={{
            click: () => R.sample(onRemove.prop)(R.sample(row.prop).id),
          }}
        >
          <span class="glyphicon glyphicon-remove" aria-hidden="true" />
        </a>
      </td>
      <td class="col-md-6" />
    </tr>
  );

  return {
    el,
    props: { row, isSelected, onSelect, onRemove },
    outputs: {},
  };
}

const BenchmarkRow = defineComponent(createBenchmarkRow);

function createBenchmarkApp() {
  let nextId = 1;
  const next = () => nextId++;

  const [rowsChanged, emitRows] = E.create<RowModel[]>();
  const rows = E.stepper(rowsChanged, [] as RowModel[]);

  const [selectedChanged, emitSelected] = E.create<number | null>();
  const selectedId = E.stepper(selectedChanged, null as number | null);

  const run = () => {
    emitRows(buildData(1000, next));
    emitSelected(null);
  };

  const runLots = () => {
    emitRows(buildData(10_000, next));
    emitSelected(null);
  };

  const add = () => {
    emitRows(R.sample(rows).concat(buildData(1000, next)));
  };

  const update = () => {
    const current = R.sample(rows);
    for (let i = 0; i < current.length; i += 10) {
      current[i].setLabel((labelValue) => `${labelValue} !!!`);
    }
  };

  const clear = () => {
    emitRows([]);
    emitSelected(null);
  };

  const swapRows = () => {
    const current = R.sample(rows);
    if (current.length < 999) return;

    const nextRows = current.slice();
    const item = nextRows[1];
    nextRows[1] = nextRows[998];
    nextRows[998] = item;
    emitRows(nextRows);
  };

  const select = (id: number) => {
    emitSelected(id);
  };

  const remove = (id: number) => {
    emitRows(R.sample(rows).filter((row) => row.id !== id));
    if (R.sample(selectedId) === id) {
      emitSelected(null);
    }
  };

  const rowItems = each(rows, {
    key: (item) => item.id,
    create: (row) => {
      const isSelected = R.ap(
        selectedId,
        R.map(row, (item) => (activeId: number | null) => item.id === activeId)
      );

      return <BenchmarkRow row={row} isSelected={isSelected} onSelect={select} onRemove={remove} />;
    },
  });

  const el = (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Synx JSX</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button id="run" class="btn btn-primary btn-block" type="button" on={{ click: run }}>
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="runlots" class="btn btn-primary btn-block" type="button" on={{ click: runLots }}>
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="add" class="btn btn-primary btn-block" type="button" on={{ click: add }}>
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="update" class="btn btn-primary btn-block" type="button" on={{ click: update }}>
                  Update every 10th row
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="clear" class="btn btn-primary btn-block" type="button" on={{ click: clear }}>
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="swaprows" class="btn btn-primary btn-block" type="button" on={{ click: swapRows }}>
                  Swap Rows
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody id="tbody">{rowItems}</tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );

  return {
    el,
    props: {},
    outputs: {},
  };
}

const BenchmarkApp = defineComponent(createBenchmarkApp);

const mountPoint = document.getElementById("app");
if (!mountPoint) {
  throw new Error("Missing #app mount point");
}

const app = BenchmarkApp();
mountPoint.appendChild(app.el);
