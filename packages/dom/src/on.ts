import { Event, create, onCleanup } from "@synx/frp/event";
import { Reactive, isReactive, get } from "@synx/frp/reactive";
import { RefObject } from "./component";
import { trackEventInCurrentScope } from "./lifecycle";
import { subscribe } from "../../frp/src/event";

type MaybeReactiveEl =
  | HTMLElement
  | Reactive<HTMLElement | null | undefined>
  | RefObject<HTMLElement | null | undefined>;

export function on<K extends keyof HTMLElementEventMap>(
  elOrReactive: MaybeReactiveEl,
  eventName: K,
  options: OnOptions<K> = {}
): Event<HTMLElementEventMap[K]> {
  const [event, emit] = create<HTMLElementEventMap[K]>();

  // Resolve a Reactive<HTMLElement|null> if caller gave us one,
  // otherwise treat the plain element as a constant "reactive".
  const reactiveEl: Reactive<HTMLElement | null | undefined> | null =
    isRefObject(elOrReactive)
      ? elOrReactive.ref
      : isReactive(elOrReactive)
      ? elOrReactive
      : null;

  // Current target we’re actually bound to
  let currentEl: EventTarget | null = null;
  let removeCurrent: (() => void) | null = null;

  const handler = (e: globalThis.Event) => {
    const eventTyped = e as HTMLElementEventMap[K];

    const baseEl =
      options.window ? (window as unknown as HTMLElement)
      : options.document ? (document as unknown as HTMLElement)
      : (currentEl as HTMLElement | null);

    // Guard: if we’re element-scoped but not bound yet, ignore
    if (!options.window && !options.document && !baseEl) return;

    if (options.self && e.target !== baseEl) return;
    if (options.outside && !isClickOutside(baseEl as HTMLElement, e)) return;

    if (isKeyboardEvent(eventName)) {
      const keyEvent = eventTyped as unknown as KeyboardEvent;
      const key = (options as Extract<OnOptions<K>, { key?: string }>).key;
      if (key && keyEvent.key !== key) return;
    }

    if (isMouseEvent(eventName)) {
      const mouse = eventTyped as unknown as MouseEvent;
      if (options.ctrl && !mouse.ctrlKey) return;
      if (options.shift && !mouse.shiftKey) return;
      if (options.alt && !mouse.altKey) return;
      if (options.meta && !mouse.metaKey) return;
    }

    if ("ctrlKey" in (eventTyped as any) && options.ctrl && !(eventTyped as any).ctrlKey) return;
    if ("shiftKey" in (eventTyped as any) && options.shift && !(eventTyped as any).shiftKey) return;
    if ("altKey" in (eventTyped as any) && options.alt && !(eventTyped as any).altKey) return;
    if ("metaKey" in (eventTyped as any) && options.meta && !(eventTyped as any).metaKey) return;

    if (options.prevent) e.preventDefault();
    if (options.stop) e.stopPropagation();
    emit(eventTyped);
  };

  const attachTo = (t: EventTarget | null | undefined) => {
    // Detach old
    if (removeCurrent) {
      removeCurrent();
      removeCurrent = null;
    }
    currentEl = null;

    // Compute the target according to options
    const target: EventTarget =
      options.window ? window
      : options.document ? document
      : (t as EventTarget);

    if (!target) return;

    target.addEventListener(eventName, handler, {
      capture: options.capture,
      once: options.once,
      passive: options.passive,
    });

    removeCurrent = () => {
      target.removeEventListener(eventName, handler, {
        capture: options.capture,
      });
    };
    currentEl = target;
  };

  if (reactiveEl) {
    // Reactive element: (re)bind whenever the element changes
    // Handle initial attach
    attachTo(get(reactiveEl) ?? null);
    // Subscribe to changes
    const unsubscribe = subscribe(reactiveEl.changes, (node) => {
      attachTo(node ?? null);
    });
    onCleanup(event, () => {
      unsubscribe();
      if (removeCurrent) removeCurrent();
    });
  } else {
    // Plain element
    attachTo(elOrReactive as HTMLElement);
    onCleanup(event, () => {
      if (removeCurrent) removeCurrent();
    });
  }

  return trackEventInCurrentScope(event);
}

export type DelegatedEventMatch<
  T extends Element,
  K extends keyof HTMLElementEventMap
> = {
  event: HTMLElementEventMap[K];
  target: T;
};

export function onDelegated<
  T extends Element,
  K extends keyof HTMLElementEventMap
>(
  elOrReactive: MaybeReactiveEl,
  eventName: K,
  selector: string,
  options: OnOptions<K> = {}
): Event<DelegatedEventMatch<T, K>> {
  const base = on(elOrReactive, eventName, options);
  const [event, emit] = create<DelegatedEventMatch<T, K>>();

  const unsubscribe = subscribe(base, (evt) => {
    const target = findDelegatedTarget<T>(evt, selector);
    if (!target) return;
    emit({ event: evt, target });
  });

  onCleanup(event, unsubscribe);
  return trackEventInCurrentScope(event);
}

// --- helpers ---

function isRefObject(x: any): x is { ref: Reactive<any> } {
  return !!x && "ref" in x && isReactive(x.ref);
}

function isClickOutside(el: HTMLElement, event: globalThis.Event): boolean {
  return !!el && !el.contains(event.target as Node);
}

function findDelegatedTarget<T extends Element>(
  event: globalThis.Event,
  selector: string
): T | null {
  const root = event.currentTarget;
  const rootElement = root instanceof Element ? root : null;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];

  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (rootElement && !rootElement.contains(node) && node !== rootElement) continue;
    if (node.matches(selector)) return node as T;
    if (node === root) break;
  }

  const target = event.target;
  if (!(target instanceof Element)) return null;
  const closest = target.closest(selector);
  if (!closest) return null;
  if (!rootElement || closest === rootElement || rootElement.contains(closest)) {
    return closest as T;
  }
  return null;
}

type BaseOptions = {
  prevent?: boolean;
  stop?: boolean;
  once?: boolean;
  capture?: boolean;
  passive?: boolean;
  self?: boolean;
  outside?: boolean;
  window?: boolean;
  document?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

type MouseEventName =
  | "click"
  | "dblclick"
  | "contextmenu"
  | "auxclick"
  | "mousedown"
  | "mouseup"
  | "mouseover"
  | "mousemove"
  | "mouseenter"
  | "mouseleave"
  | "mouseout";

type KeyboardEventName = "keydown" | "keyup" | "keypress";

function isKeyboardEvent(name: string): name is KeyboardEventName {
  return name === "keydown" || name === "keyup" || name === "keypress";
}
function isMouseEvent(name: string): name is MouseEventName {
  return [
    "click",
    "dblclick",
    "contextmenu",
    "auxclick",
    "mousedown",
    "mouseup",
    "mouseover",
    "mousemove",
    "mouseenter",
    "mouseleave",
    "mouseout",
  ].includes(name);
}

type OnOptions<K extends keyof HTMLElementEventMap> =
  HTMLElementEventMap[K] extends KeyboardEvent
    ? BaseOptions & {
        key?: KeyboardEvent["key"];
        ctrl?: boolean;
        shift?: boolean;
        alt?: boolean;
        meta?: boolean;
      }
    : HTMLElementEventMap[K] extends MouseEvent
    ? BaseOptions & {
        ctrl?: boolean;
        shift?: boolean;
        alt?: boolean;
        meta?: boolean;
      }
    : BaseOptions;
