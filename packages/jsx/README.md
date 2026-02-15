# @synx/jsx

JSX runtime for Synx DOM.

## TypeScript setup

Use these compiler options:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@synx/jsx"
  }
}
```

## Example

```tsx
import * as E from "@synx/frp/event";
import { defineComponent } from "@synx/dom/component";

const Counter = defineComponent(() => {
  const [clicks, click] = E.create<void>();
  const count = E.fold(clicks, 0, (n) => n + 1);

  return {
    el: <button on={{ click }}>Count: {count}</button>,
    props: {},
    outputs: {},
  };
});
```
