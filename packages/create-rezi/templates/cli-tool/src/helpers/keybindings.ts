export type CliCommand =
  | "quit"
  | "go-home"
  | "go-logs"
  | "go-settings"
  | "toggle-help"
  | "toggle-refresh";

const COMMAND_BY_KEY: Readonly<Record<string, CliCommand>> = Object.freeze({
  q: "quit",
  "ctrl+c": "quit",
  f1: "go-home",
  "alt+1": "go-home",
  "ctrl+1": "go-home",
  f2: "go-logs",
  "alt+2": "go-logs",
  "ctrl+2": "go-logs",
  f3: "go-settings",
  "alt+3": "go-settings",
  "ctrl+3": "go-settings",
  h: "toggle-help",
  "shift+/": "toggle-help",
  p: "toggle-refresh",
});

export function resolveCliCommand(key: string): CliCommand | undefined {
  return COMMAND_BY_KEY[key.toLowerCase()];
}
