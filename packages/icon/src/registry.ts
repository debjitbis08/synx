import type {
  IconBody,
  IconCollection,
  IconCollectionLoader,
  IconifyCollectionJSON,
  IconName,
} from "./types";

type StoreEntry =
  | { state: "ready"; icons: IconCollection }
  | { state: "loader"; load: IconCollectionLoader }
  | { state: "loading"; promise: Promise<IconCollection> };

const collections = new Map<string, StoreEntry>();
const builtInLoaders: Record<string, IconCollectionLoader> = {
  mdi: async () => {
    const mod = await import("@iconify-json/mdi/icons.json");
    const json = ((mod as any).default ?? mod) as IconifyCollectionJSON;
    return (json.icons ?? {}) as IconCollection;
  },
};

function ensureBuiltInLoader(prefix: string): void {
  if (collections.has(prefix)) return;
  const loader = builtInLoaders[prefix];
  if (loader) {
    defineIconLoader(prefix, loader);
  }
}

export function parseIconName(name: string): {
  collection: string;
  icon: string;
} {
  const idx = name.indexOf(":");
  if (idx <= 0 || idx >= name.length - 1) {
    throw new Error(
      `Invalid icon name \"${name}\". Expected format \"collection:icon\".`
    );
  }

  return {
    collection: name.slice(0, idx),
    icon: name.slice(idx + 1),
  };
}

export function defineIconCollection(prefix: string, icons: IconCollection): void {
  collections.set(prefix, { state: "ready", icons });
}

export function defineIconLoader(prefix: string, load: IconCollectionLoader): void {
  collections.set(prefix, { state: "loader", load });
}

export function defineIconifyCollection(
  prefix: string,
  json: IconifyCollectionJSON
): void {
  defineIconCollection(prefix, json.icons ?? {});
}

export function hasIcon(name: IconName | string): boolean {
  return resolveIcon(name) != null;
}

export function resolveIcon(name: IconName | string): IconBody | null {
  const { collection, icon } = parseIconName(name);
  ensureBuiltInLoader(collection);
  const entry = collections.get(collection);
  if (!entry || entry.state !== "ready") {
    return null;
  }

  return entry.icons[icon] ?? null;
}

export async function loadIconCollection(
  prefix: string
): Promise<IconCollection | null> {
  ensureBuiltInLoader(prefix);
  const entry = collections.get(prefix);
  if (!entry) return null;

  if (entry.state === "ready") return entry.icons;

  if (entry.state === "loading") return entry.promise;

  const promise = entry.load().then((icons) => {
    collections.set(prefix, { state: "ready", icons });
    return icons;
  });

  collections.set(prefix, { state: "loading", promise });
  return promise;
}

export async function resolveIconAsync(
  name: IconName | string
): Promise<IconBody | null> {
  const { collection, icon } = parseIconName(name);
  const loaded = await loadIconCollection(collection);
  if (!loaded) return null;
  return loaded[icon] ?? null;
}

export function iconViewBox(icon: IconBody): string {
  const left = icon.left ?? 0;
  const top = icon.top ?? 0;
  const width = icon.width ?? 24;
  const height = icon.height ?? 24;
  return `${left} ${top} ${width} ${height}`;
}
