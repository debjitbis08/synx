# Synx

> [!WARNING]
> **Research Preview** Synx is a personal laboratory for exploring novel reactive patterns in frontend architecture. It is a vehicle for experimentation, not a stable framework for production applications (yet).

## Philosophy

For more than a decade, I have had the idea that in frontend application the data flows in a
certain way, from users who trigger events, which goes through a transformation chain, finally
ending up as changes in the DOM. Recently, I have realized that this transformation is a
fold. Then the applications job is a run a fold over a stream of events that cause changes
in the DOM.

**User/World → Events → Fold → DOM**

## Patterns

Other than the core philosophy, there are certain programming and frontend patterns I
believe are important to keep the application logic simple (not neccessarily easy).

1. Rely on exiting DOM and browser patterns rather than adding unneccary abstractions over them.
2. Fine-grained reactivity to modify the DOM in a minimal way.
3. Ability to choose abstraction level when working with a framework. You can choose just a small core, or the whole
component system.
4. No special syntax and less reliance on tooling. Just include the library and write code inside a `<script>` tag.
5. If are embraching reactive values, make them the only way to do data flow. Both inputs and outputs from components become
reactive values. There are no event handlers or callbacks.
6. State is an optimization. UI is a not a function of state. UI is a fold over the stream of events.

## 🚀 Example

```ts
import { div, button, span } from '@synx/dom/tags';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// Create event sources
const decrementClicks = E.create<MouseEvent>();
const incrementClicks = E.create<MouseEvent>();

// Transform and compose events
const deltas = E.mergeAll([
  E.map(incrementClicks, () => 1),
  E.map(decrementClicks, () => -1),
]);

// Fold events into state
const count = E.fold(deltas, 0, (total, change) => total + change);

// Transform state into UI representation
const countLabel = R.map(count, (value) => `Count: ${value}`);

// Create DOM with reactive bindings
const counter = div({ class: 'counter' }, [
  button({ on: { click: decrementClicks } }, '-'),
  span({}, countLabel),  // Reactive value updates automatically
  button({ on: { click: incrementClicks } }, '+'),
]);

// Mount to page
document.body.appendChild(counter);
````

## 🧩 Component System Example

```ts
import { div, button, span } from '@synx/dom/tags';
import { on } from '@synx/dom';
import { defineComponent, Prop } from '@synx/dom/component';
import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';

// Define a Counter component with props and outputs
function createCounter(initial: { label: string; initialCount: number }) {
  // Create reactive props
  const label = Prop(initial.label);
  const initialCount = Prop(initial.initialCount);

  // Create DOM elements
  const incrementBtn = button({}, '+');
  const decrementBtn = button({}, '−');

  // Wire up events
  const increment = on(incrementBtn, 'click');
  const decrement = on(decrementBtn, 'click');

  // Build state from events
  const deltas = E.mergeAll([
    E.map(increment, () => 1),
    E.map(decrement, () => -1),
  ]);

  const count = E.fold(
    deltas,
    R.get(initialCount.prop),  // Get initial value
    (total, delta) => total + delta
  );

  // Build UI
  const el = div({ class: 'counter' },
    span({}, label.prop),
    decrementBtn,
    span({}, R.map(count, c => String(c))),
    incrementBtn,
  );

  return {
    el,
    props: { label, initialCount },
    outputs: { countChanged: count },
  };
}

const Counter = defineComponent(createCounter);

// Create a parent component that uses Counter
function createApp() {
  const applesCounter = Counter({ label: 'Apples: ', initialCount: 5 });
  const orangesCounter = Counter({ label: 'Oranges: ', initialCount: 3 });

  // Calculate total from both counters
  const total = R.ap2(
    (apples, oranges) => apples + oranges,
    applesCounter.outputs.countChanged,
    orangesCounter.outputs.countChanged
  );

  const el = div({ class: 'app' },
    div({ class: 'title' }, 'Multi-Counter App'),
    applesCounter.el,
    orangesCounter.el,
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

// Instantiate and mount to DOM
const app = App();
document.body.appendChild(app.el);
```

This example demonstrates:
- **Component definition** with `defineComponent(createFunction)`
- **Props** created with `Prop()` and accessed via `.prop`
- **Outputs** as event streams returned in the outputs object
- **Component composition** by calling components as functions
- **DOM mounting** by appending `.el` to the DOM

## Choose Your Abstraction level

Synx is layered by design. Use as much or as little as you need:

| Layer                 | What it gives you                                                              | Opt-in?  |
| --------------------- | ------------------------------------------------------------------------------ | -------- |
| `@synx/frp`           | Core FRP primitives (`Event`, `Reactive`, `subscribe`, `fold`, etc.)           | ✅       |
| `@synx/dom`           | DOM helpers: `bind`, `on`, `text`, `children`, etc.                            | ✅       |
| `@synx/dom/component` | Component system: `defineComponent`, `child`, `refOutputs`, `props`, `outputs` | Optional |
| `@synx/dsl`           | JSX-like tag functions: `div(...)`, `button(...)`, etc.                        | Optional |



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

## Examples

The workspace includes small runnable examples:

```bash
pnpm examples:counter  # reactive fold example
pnpm examples:zip      # pair two event streams
pnpm examples:todomvc  # Classic TodoMVC example
```

## 📜 License

MIT
