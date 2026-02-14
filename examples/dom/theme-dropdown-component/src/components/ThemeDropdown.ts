import {
  bind,
  bindLocalStorage,
  mediaQueryMatches,
  readLocalStorage,
} from "@synx/dom";
import {
  defineComponent,
  documentRef,
  Ref,
  windowRef,
} from "@synx/dom/component";
import { button, div, p, span } from "@synx/dom/tags";
import { Icon } from "@synx/icon/components";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { map2 } from "@synx/frp/utils/reactive";

type ThemeMode = "light" | "dark" | "system";

type ThemeOption = {
  theme: ThemeMode;
  label: string;
  icon: string;
};

const STORAGE_KEY = "synx-theme-component";

const THEME_OPTIONS: ThemeOption[] = [
  { theme: "light", label: "Light", icon: "mdi:weather-sunny" },
  { theme: "dark", label: "Dark", icon: "mdi:weather-night" },
  { theme: "system", label: "System", icon: "mdi:monitor" },
];

function themeLabel(theme: ThemeMode): string {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "System";
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

const themeStorage = {
  initial: "system" as ThemeMode,
  serialize: (value: ThemeMode) => value,
  deserialize: (raw: string): ThemeMode | undefined =>
    isThemeMode(raw) ? raw : undefined,
};

function createThemeDropdown() {
  const initialTheme = readLocalStorage(STORAGE_KEY, themeStorage);
  const rootRef = Ref<HTMLDivElement>();
  const triggerRef = Ref<HTMLButtonElement>();
  const optionButtonRefs = THEME_OPTIONS.map(() => Ref<HTMLButtonElement>());

  const triggerClicked = triggerRef.outputs.click;
  const selectedThemeFromButtons = E.mergeAll(
    optionButtonRefs.map((buttonRef, index) =>
      E.map(
        buttonRef.outputs.click,
        () => THEME_OPTIONS[index].theme
      )
    )
  );
  const selectedTheme = selectedThemeFromButtons;
  const theme = E.stepper(selectedThemeFromButtons, initialTheme);
  const prefersDark = mediaQueryMatches("(prefers-color-scheme: dark)");
  const systemTheme = R.map(prefersDark, (isDark) => (isDark ? "dark" : "light"));
  const resolvedTheme = map2(
    theme,
    systemTheme,
    (selected, system): Exclude<ThemeMode, "system"> =>
      selected === "system" ? system : selected
  );

  const escapeKey = E.filter(
    windowRef.outputs.keydown,
    (event) => event.key === "Escape"
  );
  const pointerDownDocument = documentRef.outputs.pointerdown;
  const outsidePointerDown = E.filter(pointerDownDocument, (event) => {
    const target = event.target as Node | null;
    const root = R.sample(rootRef.ref);
    return !!root && !!target && !root.contains(target);
  });

  const isOpen = E.fold(
    E.mergeAll([
      E.map(triggerClicked, () => (open: boolean) => !open),
      E.map(selectedThemeFromButtons, () => () => false),
      E.map(escapeKey, () => () => false),
      E.map(outsidePointerDown, () => () => false),
    ]),
    false,
    (open, update) => update(open)
  );

  const triggerExpanded = R.map(isOpen, (open): "true" | "false" =>
    open ? "true" : "false"
  );
  const menuStyle = R.map(isOpen, (visible) => ({
    display: visible ? "grid" : "none",
  }));

  const triggerLabelText = R.map(theme, themeLabel);

  if (typeof document !== "undefined") {
    bind(document.documentElement as any, "data-theme" as any, resolvedTheme);
  }
  bindLocalStorage(STORAGE_KEY, theme, themeStorage);

  const el = div(
    { class: "theme-dropdown-component", ref: rootRef },
    div(
      { class: "theme-switcher" },
      button(
        {
          class: "theme-trigger",
          type: "button",
          "aria-haspopup": "menu",
          "aria-expanded": triggerExpanded,
          title: "Open theme menu",
          ref: triggerRef,
        },
        Icon({
          name: "mdi:monitor",
          class: "theme-trigger__icon",
          "aria-hidden": "true",
          width: 18,
          height: 18,
        }),
        span({ class: "theme-trigger__label" }, triggerLabelText)
      ),
      div(
        {
          class: "theme-menu",
          role: "menu",
          "aria-orientation": "vertical",
          "aria-label": "Select theme",
          tabindex: "-1",
          style: menuStyle,
        },
        THEME_OPTIONS.map((option, index) =>
          button(
            {
              class: "theme-option",
              type: "button",
              role: "menuitemradio",
              "aria-checked": R.map(
                theme,
                (value): "true" | "false" =>
                  value === option.theme ? "true" : "false"
              ),
              "data-theme-option": option.theme,
              ref: optionButtonRefs[index],
            },
            Icon({
              name: option.icon,
              class: "theme-option__icon",
              "aria-hidden": "true",
              width: 16,
              height: 16,
            }),
            span({}, option.label)
          )
        )
      )
    ),
    p(
      { class: "theme-readout" },
      span({ class: "theme-readout__label" }, "Current Theme: "),
      span({ class: "theme-readout__value" }, triggerLabelText)
    )
  );

  return {
    el,
    props: {},
    outputs: { selectedTheme: selectedThemeFromButtons },
  };
}

export const ThemeDropdown = defineComponent(createThemeDropdown);
export type { ThemeMode };
