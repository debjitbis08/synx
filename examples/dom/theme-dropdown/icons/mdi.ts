import { defineIconCollection } from "@synx/icon";

let registered = false;

export function registerMdiIcons(): void {
  if (registered) return;

  defineIconCollection("mdi", {
    "weather-sunny": {
      body: '<path d="M12 4V2m0 20v-2m5.66-14.34 1.41-1.41M4.93 19.07l1.41-1.41M20 12h2M2 12h2m13.66 5.66 1.41 1.41M4.93 4.93l1.41 1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>'
    },
    "weather-night": {
      body: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    },
    monitor: {
      body: '<rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    }
  });

  registered = true;
}
