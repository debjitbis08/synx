# @synx/icon

Synx icon package with a lightweight registry and SVG component.

## Install icon data

Use any Iconify JSON package (example: `@iconify-json/mdi`).

## Register icons

```ts
import { defineIconifyCollection } from "@synx/icon";
import mdi from "@iconify-json/mdi/icons.json";

defineIconifyCollection("mdi", mdi);
```

## Render

```ts
import { Icon } from "@synx/icon/components";

const account = Icon({ name: "mdi:account", size: 20, title: "Account" });
```

## Component props

```ts
interface Props extends HTMLAttributes<"svg"> {
  name: string;
  title?: string;
  desc?: string;
  size?: number | string;
  width?: number | string;
  height?: number | string;
}
```
