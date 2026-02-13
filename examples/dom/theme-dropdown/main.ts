import {
  bind,
  bindLocalStorage,
  createScope,
  mediaQueryMatches,
  many,
  on,
  queryElements,
  queryRequired,
  role,
  readLocalStorage,
  show,
} from "@synx/dom";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { map2 } from "@synx/frp/utils/reactive";

type ThemeMode = "light" | "dark" | "system";

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function themeLabel(theme: ThemeMode): string {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "System";
}

function themeIcon(theme: ThemeMode): string {
  if (theme === "light") return "SUN";
  if (theme === "dark") return "MOON";
  return "SYS";
}

const root = queryRequired<HTMLElement>("html");
const app = queryRequired<HTMLElement>("[data-role='theme-demo']");
const {
  switcher,
  trigger,
  menu,
  readout,
  triggerIcon,
  triggerLabel,
  optionButtons,
} = queryElements(app, {
  switcher: role<HTMLElement>("switcher"),
  trigger: role<HTMLButtonElement>("trigger"),
  menu: role<HTMLDivElement>("menu"),
  readout: role<HTMLElement>("theme-readout"),
  triggerIcon: role<HTMLElement>("trigger-icon"),
  triggerLabel: role<HTMLElement>("trigger-label"),
  optionButtons: many<HTMLButtonElement>("[data-theme-option]"),
});

const themeStorage = {
  initial: "system" as ThemeMode,
  serialize: (value: ThemeMode) => value,
  deserialize: (raw: string): ThemeMode | undefined =>
    isThemeMode(raw) ? raw : undefined,
};

const initialTheme = readLocalStorage("synx-theme", themeStorage);

const scope = createScope({ root: app });

scope.run(() => {
  const triggerClicks = on(trigger, "click");
  const escapeKey = on(window as unknown as HTMLElement, "keydown", {
    window: true,
    key: "Escape",
  });
  const pointerDownDocument = on(switcher, "pointerdown", { document: true });
  const outsidePointerDown = E.filter(pointerDownDocument, (event) => {
    const target = event.target as Node | null;
    return !!target && !switcher.contains(target);
  });

  const optionEvents = optionButtons.map((button) => {
    const option = button.dataset.themeOption;
    if (!isThemeMode(option)) {
      throw new Error("Expected button[data-theme-option] to be a valid theme mode");
    }

    const clicks = on(button, "click");
    return {
      option,
      event: E.map(clicks, () => option),
    };
  });

  const themeSelected = E.mergeAll(optionEvents.map((entry) => entry.event));
  const theme = E.stepper(themeSelected, initialTheme);
  const prefersDark = mediaQueryMatches("(prefers-color-scheme: dark)");
  const systemTheme = R.map(prefersDark, (isDark) => (isDark ? "dark" : "light"));
  const resolvedTheme = map2(
    theme,
    systemTheme,
    (selectedTheme, system): Exclude<ThemeMode, "system"> =>
      selectedTheme === "system" ? system : selectedTheme
  );
  const isOpen = E.fold(
    E.mergeAll([
      E.map(triggerClicks, () => (open: boolean) => !open),
      E.map(themeSelected, () => () => false),
      E.map(escapeKey, () => () => false),
      E.map(outsidePointerDown, () => () => false),
    ]),
    false,
    (open, update) => update(open)
  );

  show(menu, isOpen);
  bind(
    trigger,
    "aria-expanded",
    R.map(isOpen, (open): "true" | "false" => (open ? "true" : "false"))
  );
  bind(readout, "text", R.map(theme, themeLabel));
  bind(triggerLabel, "text", R.map(theme, themeLabel));
  bind(triggerIcon, "text", R.map(theme, themeIcon));
  bind(root as any, "data-theme" as any, resolvedTheme);

  optionButtons.forEach((button) => {
    const option = button.dataset.themeOption;
    if (!isThemeMode(option)) return;
    bind(
      button,
      "aria-checked",
      R.map(
        theme,
        (selectedTheme): "true" | "false" =>
          selectedTheme === option ? "true" : "false"
      )
    );
  });

  bindLocalStorage("synx-theme", theme, themeStorage);
});
