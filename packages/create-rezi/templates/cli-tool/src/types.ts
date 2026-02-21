import type { LogEntry } from "@rezi-ui/core";

export type ThemeName = "nord" | "dark" | "light";
export type EnvironmentName = "development" | "staging" | "production";
export type RouteId = "home" | "logs" | "settings";

export type CliState = Readonly<{
  nowMs: number;
  tick: number;
  logs: readonly LogEntry[];
  logsScrollTop: number;
  expandedLogIds: readonly string[];
  autoRefresh: boolean;
  includeDebug: boolean;
  operatorName: string;
  environment: EnvironmentName;
  themeName: ThemeName;
  showHelp: boolean;
}>;

export type CliAction =
  | Readonly<{ type: "tick"; nowMs: number }>
  | Readonly<{ type: "toggle-refresh" }>
  | Readonly<{ type: "toggle-debug" }>
  | Readonly<{ type: "toggle-help" }>
  | Readonly<{ type: "set-operator"; operatorName: string }>
  | Readonly<{ type: "set-environment"; environment: EnvironmentName }>
  | Readonly<{ type: "set-theme"; themeName: ThemeName }>
  | Readonly<{ type: "set-scroll-top"; scrollTop: number }>
  | Readonly<{ type: "set-entry-expanded"; entryId: string; expanded: boolean }>
  | Readonly<{ type: "clear-logs" }>;
