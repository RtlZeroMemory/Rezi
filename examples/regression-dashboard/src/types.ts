export type ServiceStatus = "healthy" | "warning" | "down";
export type ServiceFilter = "all" | ServiceStatus;
export type ThemeName = "nord" | "dark" | "light";

export type Service = Readonly<{
  id: string;
  name: string;
  region: string;
  owner: string;
  status: ServiceStatus;
  latencyMs: number;
  errorRate: number;
  trafficRpm: number;
  history: readonly number[];
}>;

export type DashboardState = Readonly<{
  services: readonly Service[];
  selectedId: string;
  filter: ServiceFilter;
  paused: boolean;
  showHelp: boolean;
  themeName: ThemeName;
  tick: number;
  startedAtMs: number;
  lastUpdatedMs: number;
}>;

export type DashboardAction =
  | Readonly<{ type: "tick"; nowMs: number }>
  | Readonly<{ type: "toggle-pause" }>
  | Readonly<{ type: "toggle-help" }>
  | Readonly<{ type: "cycle-filter" }>
  | Readonly<{ type: "cycle-theme" }>
  | Readonly<{ type: "move-selection"; delta: -1 | 1 }>
  | Readonly<{ type: "set-selected-id"; serviceId: string }>;
