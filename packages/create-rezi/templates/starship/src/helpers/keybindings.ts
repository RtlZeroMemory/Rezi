import type { RouteId } from "../types.js";

export type StarshipCommand =
  | "quit"
  | "go-bridge"
  | "go-engineering"
  | "go-crew"
  | "go-comms"
  | "go-cargo"
  | "go-settings"
  | "go-next-deck"
  | "go-prev-deck"
  | "cycle-theme"
  | "toggle-help"
  | "toggle-command-palette"
  | "toggle-pause"
  | "toggle-autopilot"
  | "toggle-red-alert"
  | "set-alert-green"
  | "set-alert-yellow"
  | "set-alert-red"
  | "bridge-scan"
  | "engineering-boost"
  | "engineering-diagnostics"
  | "crew-new-assignment"
  | "crew-edit-selected"
  | "crew-search"
  | "comms-hail"
  | "comms-acknowledge"
  | "comms-search"
  | "comms-next-channel"
  | "comms-prev-channel"
  | "cargo-sort-name"
  | "cargo-sort-category"
  | "cargo-sort-quantity"
  | "cargo-sort-priority"
  | "settings-reset"
  | "settings-save";

const GLOBAL_COMMAND_BY_KEY: Readonly<Record<string, StarshipCommand>> = Object.freeze({
  q: "quit",
  "ctrl+c": "quit",
  "1": "go-bridge",
  "2": "go-engineering",
  "3": "go-crew",
  "4": "go-comms",
  "5": "go-cargo",
  "6": "go-settings",
  "shift+tab": "go-prev-deck",
  tab: "go-next-deck",
  t: "cycle-theme",
  "shift+/": "toggle-help",
  "?": "toggle-help",
  "ctrl+p": "toggle-command-palette",
  space: "toggle-pause",
  g: "set-alert-green",
  y: "set-alert-yellow",
  r: "set-alert-red",
});

export const COMMAND_BY_KEY: Readonly<Record<string, StarshipCommand>> = Object.freeze({
  ...GLOBAL_COMMAND_BY_KEY,
  a: "toggle-autopilot",
  s: "bridge-scan",
  b: "engineering-boost",
  d: "engineering-diagnostics",
  n: "crew-new-assignment",
  e: "crew-edit-selected",
  "/": "crew-search",
  h: "comms-hail",
  enter: "comms-acknowledge",
  "alt+right": "comms-next-channel",
  "alt+left": "comms-prev-channel",
  "alt+n": "cargo-sort-name",
  "alt+c": "cargo-sort-category",
  "alt+q": "cargo-sort-quantity",
  "alt+p": "cargo-sort-priority",
  "ctrl+r": "settings-reset",
  "ctrl+s": "settings-save",
});

const ROUTE_KEY_OVERRIDES: Readonly<Record<RouteId, Readonly<Record<string, StarshipCommand>>>> =
  Object.freeze({
    bridge: Object.freeze({
      a: "toggle-autopilot",
      r: "toggle-red-alert",
      s: "bridge-scan",
    }),
    engineering: Object.freeze({
      b: "engineering-boost",
      d: "engineering-diagnostics",
      r: "toggle-red-alert",
    }),
    crew: Object.freeze({
      n: "crew-new-assignment",
      e: "crew-edit-selected",
      "/": "crew-search",
    }),
    comms: Object.freeze({
      h: "comms-hail",
      enter: "comms-acknowledge",
      "/": "comms-search",
      n: "comms-next-channel",
      p: "comms-prev-channel",
    }),
    cargo: Object.freeze({
      n: "cargo-sort-name",
      c: "cargo-sort-category",
      q: "cargo-sort-quantity",
      p: "cargo-sort-priority",
    }),
    settings: Object.freeze({
      "ctrl+r": "settings-reset",
      "ctrl+s": "settings-save",
    }),
  });

export function resolveStarshipCommand(
  key: string,
  routeId?: RouteId,
): StarshipCommand | undefined {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return undefined;

  if (routeId) {
    const routeCommand = ROUTE_KEY_OVERRIDES[routeId]?.[normalized];
    if (routeCommand) return routeCommand;
    return GLOBAL_COMMAND_BY_KEY[normalized];
  }

  return COMMAND_BY_KEY[normalized];
}
