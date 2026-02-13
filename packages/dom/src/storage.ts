import type { Reactive } from "@synx/frp/reactive";
import * as R from "@synx/frp/reactive";
import * as E from "@synx/frp/event";
import {
  trackDisposerInCurrentScope,
  trackReactiveInCurrentScope,
} from "./lifecycle";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type StorageBindingOptions<T> = {
  initial: T;
  serialize: (value: T) => string;
  deserialize: (raw: string) => T | undefined;
  storage?: StorageLike;
};

export function readLocalStorage<T>(
  key: string,
  options: StorageBindingOptions<T>
): T {
  const storage = options.storage ?? window.localStorage;
  const raw = storage.getItem(key);
  if (raw == null) return options.initial;

  try {
    return options.deserialize(raw) ?? options.initial;
  } catch {
    return options.initial;
  }
}

export function bindLocalStorage<T>(
  key: string,
  reactive: Reactive<T>,
  options: StorageBindingOptions<T>
): () => void {
  trackReactiveInCurrentScope(reactive);
  const storage = options.storage ?? window.localStorage;
  const write = (value: T) => {
    storage.setItem(key, options.serialize(value));
  };

  write(R.sample(reactive));
  return trackDisposerInCurrentScope(E.effect(reactive.changes, write));
}
