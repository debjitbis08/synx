# Synx

> A minimal, reactive UI framework for the DOM — no virtual DOM, no compiler, no magic.

Synx is a tiny yet expressive reactive library that brings **clarity, predictability, and purity** to UI development.

It is built on a composable FRP core, but you can choose your own abstraction level:
- Use just the **core primitives** (`Event`, `Reactive`, `subscribe`, etc.)
- Add **DOM helpers** (`div`, `input`, `bind.text`, `on.click`, etc.)
- Or build UIs with the **full component model** (`defineComponent`, `props`, `outputs`, `child()`)

Synx follows a consistent dataflow:
### → **Events → Fold → DOM → Events → ...**

No runtime illusions. No reactive spaghetti. Just **observable state -> UI -> new events**.

---

## 🧠 Core Principles

- **Static DOM Tree**
  All DOM structure is defined **once**, up front. Reactivity only applies to:
  - Attributes (`bind.value`, `bind.checked`)
  - Text content (`bind.text`)
  - Events (`on.click`, `on.input`, etc.)

  Dynamic child nodes (`children()`) are also defined as *reactive bindings to content*, but the **container** node remains fixed.

- **Real DOM, Not Virtual**
  Synx operates directly on the DOM. No diffing, patching, or reconciliation engines.
  It uses efficient, minimal updates based on fine-grained reactivity.

- **Composable, Algebraic Reactivity**
  `Event<A>` and `Reactive<A>` form functors, applicatives, and monads.
  You can build complex behaviors by combining tiny, testable expressions.

- **Reactive Children with Minimal DOM Mutation**
  Synx provides a `children()` helper that updates child nodes with:
  - Optional `key()` diffing
  - `create` and `update` functions
  - Efficient DOM reuse instead of full re-renders

- **Unidirectional Dataflow**
  Every component expresses:
  - Inputs as **reactive events** (`props`)
  - Outputs as **event streams**
  - DOM as a **function of state**, never the source of truth

---

## 🚀 Example

```ts
import { defineComponent, ref, child, bind, text, div, input, E, R } from "synx";

function createHelloInput() {
  const name = E.create<string>();

  const value = R.stepper("World", E.map(name, (e) => (e.target as HTMLInputElement).value));

  return {
    el: div({ class: "space-y-2" }, [
      input({ on: { input: name } }),
      div({}, text(R.map(value, (v) => `Hello, ${v}!`))),
    ]),
    props: {},
    outputs: {},
  };
}

export const HelloInput = defineComponent(createHelloInput);
````

---

## 🛠 Features

* ✅ Push-pull FRP with explicit semantics
* ✅ `Event` and `Reactive` primitives
* ✅ Real DOM bindings (not virtual)
* ✅ Static DOM tree with dynamic content
* ✅ Reactive `children()` with keyed updates
* ✅ Props as **input events**, not static values
* ✅ Modular: choose low-level or DSL-level APIs
* ✅ No compiler, no Babel, no JSX
* ✅ Type-safe and tree-shakable

---

## 🔧 Use Synx at Your Level

Synx is layered by design. Use as much or as little as you need:

| Layer             | What it gives you                                                              | Opt-in?  |
| ----------------- | ------------------------------------------------------------------------------ | -------- |
| `@synx/frp`       | Core FRP primitives (`Event`, `Reactive`, `subscribe`, `fold`, etc.)           | ✅        |
| `@synx/dom`       | DOM helpers: `bind`, `on`, `text`, `children`, etc.                            | ✅        |
| `@synx/component` | Component system: `defineComponent`, `child`, `refOutputs`, `props`, `outputs` | Optional |
| `@synx/dsl` (WIP) | JSX-like tag functions: `div(...)`, `button(...)`, etc.                        | Optional |

No opinionated bundling. No black boxes. Just **clean, composable building blocks**.

---

## 🌀 The Cycle: Events → Fold → DOM → Events

Synx models UI as a pure dataflow cycle:

```
User Interaction
       ↓
    Event<A>
       ↓
Fold / stepper / reducer
       ↓
Reactive<A>
       ↓
DOM Update (text, attr, class)
       ↓
New Events triggered
       ↓
(repeat)
```

This makes everything **traceable and debuggable**. No side effects hidden in render trees or lifecycle hooks.

---

## 📜 License

MIT — handcrafted with clarity and care.
