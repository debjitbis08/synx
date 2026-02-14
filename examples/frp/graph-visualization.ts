/**
 * Graph Visualization Example
 *
 * This example demonstrates how to use the FRP graph visualization system
 * to capture and visualize the reactive plumbing in a component.
 *
 * Run with: tsx examples/frp/graph-visualization.ts
 */

import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import {
  enableGraphTracking,
  printGraph,
  exportGraph,
  $,
  $$,
} from "@synx/frp/graph";

// ============================================================================
// Example: Theme Dropdown (Simplified)
// ============================================================================

function createThemeDropdownWithGraph() {
  console.log("Creating Theme Dropdown with graph tracking...\n");

  // Enable graph tracking BEFORE creating FRP nodes
  enableGraphTracking();

  // Create events and annotate with variable names using $()
  const triggerClicked = $("triggerClicked", E.create<void>());
  const lightClicked = $("lightClicked", E.create<void>());
  const darkClicked = $("darkClicked", E.create<void>());
  const systemClicked = $("systemClicked", E.create<void>());

  // Merge events with annotations
  const selectedFromButtons = $("selectedFromButtons",
    E.mergeAll([
      E.map(lightClicked, () => "light" as const),
      E.map(darkClicked, () => "dark" as const),
      E.map(systemClicked, () => "system" as const),
    ])
  );

  // Create reactive state
  const theme = $("theme", E.stepper(selectedFromButtons, "system" as const));

  // System theme detection (simulated)
  const prefersDark = $("prefersDark", R.of(false));
  const systemTheme = $("systemTheme",
    R.map(prefersDark, (isDark) => (isDark ? "dark" : "light"))
  );

  // Resolve final theme
  const resolvedTheme = $("resolvedTheme",
    R.map(theme, (selected) => {
      const system = R.sample(systemTheme);
      return selected === "system" ? system : selected;
    })
  );

  // Dropdown state
  const escapeKey = $("escapeKey", E.create<void>());
  const outsideClick = $("outsideClick", E.create<void>());

  const isOpen = $("isOpen",
    E.fold(
      E.mergeAll([
        E.map(triggerClicked, () => (open: boolean) => !open),
        E.map(selectedFromButtons, () => () => false),
        E.map(escapeKey, () => () => false),
        E.map(outsideClick, () => () => false),
      ]),
      false,
      (open, update) => update(open)
    )
  );

  // Derived UI state
  const triggerExpanded = $("triggerExpanded",
    R.map(isOpen, (open) => (open ? "true" : "false"))
  );

  const menuStyle = $("menuStyle",
    R.map(isOpen, (visible) => ({ display: visible ? "grid" : "none" }))
  );

  return {
    // Events
    triggerClicked,
    lightClicked,
    darkClicked,
    systemClicked,
    selectedFromButtons,
    escapeKey,
    outsideClick,
    // Reactives
    theme,
    prefersDark,
    systemTheme,
    resolvedTheme,
    isOpen,
    triggerExpanded,
    menuStyle,
  };
}

// ============================================================================
// Run Example
// ============================================================================

const dropdown = createThemeDropdownWithGraph();

console.log("Graph created!\n");
console.log("=".repeat(80));
console.log("");

// Print graph to console
printGraph();

console.log("\n" + "=".repeat(80));
console.log("\n📊 Export Formats:\n");

// Export as Mermaid
console.log("--- Mermaid ---");
console.log(exportGraph("mermaid"));
console.log("");

// Export as DOT (Graphviz)
console.log("--- Graphviz DOT ---");
console.log(exportGraph("dot"));
console.log("");

// Export as D3.js JSON
console.log("--- D3.js JSON ---");
console.log(JSON.stringify(exportGraph("d3"), null, 2));
console.log("");

// Test the component
console.log("\n" + "=".repeat(80));
console.log("\n🧪 Testing Component:\n");

// Subscribe to theme changes
R.subscribe(dropdown.theme, (theme) => {
  console.log(`Theme changed to: ${theme}`);
});

// Simulate user interactions
console.log("Clicking dark theme button...");
dropdown.darkClicked.emit();

console.log("\nClicking light theme button...");
dropdown.lightClicked.emit();

console.log("\nClicking system theme button...");
dropdown.systemClicked.emit();
