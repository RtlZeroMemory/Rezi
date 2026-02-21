export type MinimalCommand =
  | "quit"
  | "toggle-help"
  | "increment"
  | "decrement"
  | "cycle-theme"
  | "raise-error";

const COMMAND_BY_KEY: Readonly<Record<string, MinimalCommand>> = Object.freeze({
  q: "quit",
  "ctrl+c": "quit",
  h: "toggle-help",
  "shift+/": "toggle-help",
  "+": "increment",
  "shift+=": "increment",
  "-": "decrement",
  t: "cycle-theme",
  e: "raise-error",
});

export function resolveMinimalCommand(key: string): MinimalCommand | undefined {
  return COMMAND_BY_KEY[key.toLowerCase()];
}
