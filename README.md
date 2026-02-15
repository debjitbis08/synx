# Synx

> [!WARNING]
> Synx is a personal laboratory for exploring novel reactive patterns in frontend architecture. It is a vehicle for experimentation, not a stable framework for production applications (yet).

## Philosophy

For more than a decade, I have had the idea that in frontend application the data flows in a
certain way, from users who trigger events, which goes through a transformation chain, finally
ending up as changes in the DOM. Recently, I have realized that this transformation is a
fold. Then the application's job is a run a fold over a stream of events that cause changes
in the DOM.

**User/World → Events → Fold → DOM**

## Patterns

Other than the core philosophy, there are certain programming and frontend patterns I
believe are important to keep the application logic simple (not neccessarily easy).

1. Rely on exiting DOM and browser patterns rather than adding unnecessary abstractions over them.
2. Fine-grained reactivity to modify the DOM in a minimal way.
3. Ability to choose abstraction level when working with a framework. You can choose just a small core, or the whole
component system.
4. No special syntax and less reliance on tooling. Just include the library and write code inside a `<script>` tag.
5. If embraching reactive values, make them the only way to do data flow. Both inputs and outputs from components become
reactive values. There are no event handlers or callbacks.
6. State is an optimization. UI is a not a function of state. UI is a fold over the stream of events.

## 🚀 Example

```ts
import { Ref } from "@synx/dom/component";
import { div, button, span } from '@synx/dom/tags';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

const decrementRef = Ref<HTMLButtonElement>();
const incrementRef = Ref<HTMLButtonElement>();

const decrementClicks = decrementRef.outputs.click;
const incrementClicks = incrementRef.outputs.click;

const deltas = E.mergeAll([
  E.map(incrementClicks, () => 1),
  E.map(decrementClicks, () => -1),
]);

const count = E.fold(deltas, 0, (total, change) => total + change);
const countLabel = R.map(count, (value) => `Count: ${value}`);

const counter = div({ class: 'counter' },
  button({ ref: decrementRef }, '-'),
  span({}, countLabel),
  button({ ref: incrementRef }, '+'),
);

document.body.appendChild(counter);
```

## 🧩 Component System Example

```ts
import { Ref, defineComponent, Prop } from '@synx/dom/component';
import { div, button, span } from '@synx/dom/tags';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';
import { map2 } from '@synx/frp/utils/reactive';

function createCounter(initial: { label: string; initialCount: number }) {
  const label = Prop(initial.label);
  const initialCount = Prop(initial.initialCount);

  const incrementRef = Ref<HTMLButtonElement>();
  const decrementRef = Ref<HTMLButtonElement>();
  const increment = incrementRef.outputs.click;
  const decrement = decrementRef.outputs.click;

  const deltas = E.mergeAll([
    E.map(increment, () => 1),
    E.map(decrement, () => -1),
  ]);

  const count = E.fold(deltas, R.sample(initialCount.prop), (total, delta) => total + delta);

  const el = div({ class: 'counter' },
    span({}, label.prop),
    button({ ref: decrementRef }, '−'),
    span({}, R.map(count, c => String(c))),
    button({ ref: incrementRef }, '+'),
  );

  return {
    el,
    props: { label, initialCount },
    outputs: { changed: count.changes },
  };
}

const Counter = defineComponent(createCounter);

function createApp() {
  const applesRef = Ref<ReturnType<typeof Counter>>();
  const orangesRef = Ref<ReturnType<typeof Counter>>();

  const apples = E.stepper(applesRef.outputs.changed, 5);
  const oranges = E.stepper(orangesRef.outputs.changed, 3);
  const total = map2(
    apples,
    oranges,
    (a, o) => a + o
  );

  const el = div({ class: 'app' },
    div({ class: 'title' }, 'Multi-Counter App'),
    Counter({ ref: applesRef, label: 'Apples: ', initialCount: 5 }),
    Counter({ ref: orangesRef, label: 'Oranges: ', initialCount: 3 }),
    div({ class: 'total' },
      span({}, 'Total: '),
      span({}, R.map(total, t => String(t))),
    ),
  );

  return {
    el,
    props: {},
    outputs: {},
  };
}

const App = defineComponent(createApp);

const app = App();
document.body.appendChild(app.el);
```

This example demonstrates:
- **Component definition** with `defineComponent(createFunction)`
- **Props** created with `Prop()` and accessed via `.prop`
- **Outputs** read as streams via `ref.outputs.*`
- **Component composition** directly inside tag trees (no child `.el`)
- **DOM refs as event outputs** (`buttonRef.outputs.click`)

## Choose Your Abstraction level

Synx is layered by design. Use as much or as little as you need:

| Layer                 | What it gives you                                                              | Opt-in?  |
| --------------------- | ------------------------------------------------------------------------------ | -------- |
| `@synx/frp`           | Core FRP primitives (`Event`, `Reactive`, `subscribe`, `fold`, etc.)           | No       |
| `@synx/dom`           | DOM helpers + tag builders (`bind`, `show`, `query`, `on`, `div(...)`, etc.)   | Optional but low-level |
| `@synx/dom/component` | Component system (`defineComponent`, `Ref`, `Prop`, `outputs`, scoped cleanup) | Optional |
| `@synx/icon`          | Icon registry + SVG `Icon` component (`mdi:*`, Iconify JSON collections)        | Optional |
| `@synx/dsl`           | Utility list/stream helpers used by higher-level APIs                           | Optional |


## Running Tests

Install dependencies once with `pnpm install`. Then:

```bash
pnpm test
```

- `pnpm test:watch` keeps Vitest in watch mode.
- `pnpm test:frp` runs only the FRP package tests.

## Benchmarks

Run them with:

```bash
pnpm bench
```

Use this to compare different implementations before adopting them in the runtime code.

For memory/leak checks (create/destroy graph loops + forced GC stabilization), run:

```bash
pnpm bench:memory
```

For a diagnostics table (heap drift + outstanding event/reactive objects per probe), run:

```bash
pnpm bench:memory:diag
```

## Examples

The workspace includes small runnable examples:

```bash
pnpm examples:counter  # reactive fold example
pnpm examples:zip      # pair two event streams
pnpm examples:theme-dropdown
pnpm examples:theme-dropdown-component
pnpm examples:todomvc  # Classic TodoMVC example
pnpm examples:js-framework-benchmark
pnpm examples:js-framework-benchmark:onbind
```

## 📜 License

MIT
