import { defineComponent, Ref } from "@synx/dom/component";
import { div, h1, p } from "@synx/dom/tags";
import { ThemeDropdown } from "./components/ThemeDropdown";

function createThemeDropdownApp() {
  const dropdownRef = Ref<ReturnType<typeof ThemeDropdown>>();

  const el = div(
    { class: "demo" },
    p({ class: "eyebrow" }, "Synx DOM component example"),
    h1({}, "Theme Picker Component"),
    p(
      { class: "hint" },
      "Reusable component with props + outputs, app-level theme sink."
    ),
    ThemeDropdown({ ref: dropdownRef })
  );

  return {
    el,
    props: {},
    refs: {
      dropdown: dropdownRef,
    },
    outputs: {
      selectedTheme: dropdownRef.outputs.selectedTheme,
    },
  };
}

export const ThemeDropdownApp = defineComponent(createThemeDropdownApp);
