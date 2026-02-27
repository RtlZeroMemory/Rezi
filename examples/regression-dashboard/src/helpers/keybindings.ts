export type DashboardCommand =
  | "quit"
  | "move-up"
  | "move-down"
  | "toggle-help"
  | "toggle-pause"
  | "cycle-filter"
  | "cycle-theme";

const COMMAND_BY_KEY: Readonly<Record<string, DashboardCommand>> = Object.freeze({
  q: "quit",
  "ctrl+c": "quit",
  up: "move-up",
  k: "move-up",
  down: "move-down",
  j: "move-down",
  h: "toggle-help",
  "shift+/": "toggle-help",
  p: "toggle-pause",
  space: "toggle-pause",
  f: "cycle-filter",
  t: "cycle-theme",
});

export function resolveDashboardCommand(key: string): DashboardCommand | undefined {
  return COMMAND_BY_KEY[key.toLowerCase()];
}
