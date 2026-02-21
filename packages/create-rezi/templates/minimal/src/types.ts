export type ThemeName = "nord" | "dark" | "light";

export type MinimalState = Readonly<{
  count: number;
  showHelp: boolean;
  themeName: ThemeName;
  lastError: string | null;
}>;

export type MinimalAction =
  | Readonly<{ type: "increment" }>
  | Readonly<{ type: "decrement" }>
  | Readonly<{ type: "toggle-help" }>
  | Readonly<{ type: "cycle-theme" }>
  | Readonly<{ type: "set-error"; message: string | null }>;
