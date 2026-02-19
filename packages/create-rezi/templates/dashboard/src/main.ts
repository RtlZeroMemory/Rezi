import type {
  BadgeVariant,
  StatusType,
  TableColumn,
  TextStyle,
  ThemeDefinition,
  VNode,
} from "@rezi-ui/core";
import {
  createApp,
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type ServiceStatus = "healthy" | "warning" | "down";
type Filter = "all" | ServiceStatus;
type SortKey = "name" | "latencyMs" | "errorRate" | "trafficRpm";
type SortDirection = "asc" | "desc";
type ThemeName = "nord" | "dracula" | "dimmed" | "dark" | "light" | "high-contrast";

type Service = {
  id: string;
  name: string;
  region: string;
  tier: "edge" | "core" | "stateful";
  status: ServiceStatus;
  latencyMs: number;
  errorRate: number;
  trafficRpm: number;
  cpuPct: number;
  memoryPct: number;
  saturation: number;
  history: readonly number[];
};

type Incident = {
  id: number;
  at: string;
  severity: "info" | "warn" | "critical";
  message: string;
};

type State = {
  services: readonly Service[];
  selectedId: string;
  pinnedId: string | null;
  filter: Filter;
  sort: SortKey;
  sortDirection: SortDirection;
  paused: boolean;
  debug: boolean;
  helpOpen: boolean;
  themeName: ThemeName;
  ticks: number;
  updatesApplied: number;
  incidents: readonly Incident[];
  nextIncidentId: number;
  startedAt: number;
  nowMs: number;
  lastUpdateAt: number;
  fleetLatencyHistory: readonly number[];
  fleetErrorHistory: readonly number[];
  fleetTrafficHistory: readonly number[];
};

type ThemeSpec = {
  label: string;
  theme: ThemeDefinition;
  badge: BadgeVariant;
};

const themeCatalog: Record<ThemeName, ThemeSpec> = {
  nord: { label: "Nord", theme: nordTheme, badge: "info" },
  dracula: { label: "Dracula", theme: draculaTheme, badge: "warning" },
  dimmed: { label: "Dimmed", theme: dimmedTheme, badge: "default" },
  dark: { label: "Dark", theme: darkTheme, badge: "default" },
  light: { label: "Light", theme: lightTheme, badge: "success" },
  "high-contrast": {
    label: "High Contrast",
    theme: highContrastTheme,
    badge: "error",
  },
};

const themeOrder: readonly ThemeName[] = [
  "nord",
  "dracula",
  "dimmed",
  "dark",
  "light",
  "high-contrast",
];

const UI_FPS_CAP = 30;
const TELEMETRY_CADENCE_MS = 1000;
const TELEMETRY_MAX_DRIFT_MS = TELEMETRY_CADENCE_MS * 2;
const PRODUCT_NAME = "__APP_NAME__";
const PRODUCT_TAGLINE = "Streaming edge reliability console";
const PRODUCT_MISSION =
  "Operate fleet health, incident response, and service recovery from one deterministic terminal console.";
const PRODUCT_ENVIRONMENT = "Production";
const PRODUCT_CLUSTER = "global-edge";
const SHOWCASE_MODE = true;
const LIVE_SPINNER_VARIANT = "dots" as const;
const CADENCE_PULSE_FRAMES = Object.freeze([
  "▁",
  "▂",
  "▃",
  "▄",
  "▅",
  "▆",
  "▇",
  "█",
  "▇",
  "▆",
  "▅",
  "▄",
]);
const PANEL_PADDING_X = 1;
const PANEL_PADDING_Y = 0;
const KPI_SPARKLINE_WIDTH = 20;
const KPI_PROGRESS_WIDTH = 20;
const SIGNAL_SPARKLINE_WIDTH = 20;
const SELECTED_HISTORY_WIDTH = 24;
const RESOURCE_SPARKLINE_WIDTH = 10;
const TABLE_REGION_WIDTH = 13;
const TABLE_STATUS_WIDTH = 13;
const TABLE_STATUS_LABEL_WIDTH = 7;
const INCIDENT_VISIBLE_ROWS = 7;
const INCIDENT_BADGE_WIDTH = 8;
const INCIDENT_TEXT_MAX_WIDTH = 96;
const CLUSTER_HEALTH_LABEL_WIDTH = 8;
const REFRESH_LABEL_WIDTH = 8;
const SORT_PANEL_LABEL_WIDTH = 11;
const RATE_LABEL_WIDTH = 7;
const SUMMARY_ALERT_LABEL_WIDTH = 16;
type ShortcutSpec = Readonly<{
  keys: string | readonly string[];
  description: string;
}>;

const HELP_SHORTCUTS: readonly ShortcutSpec[] = Object.freeze([
  { keys: ["up", "down", "j", "k"], description: "Move service selection" },
  { keys: "enter", description: "Pin or unpin selected service" },
  { keys: ["p", "space"], description: "Pause or resume live stream" },
  { keys: "f", description: "Cycle status filter" },
  { keys: "s", description: "Cycle sort field" },
  { keys: "o", description: "Toggle sort direction" },
  { keys: "t", description: "Cycle theme preset" },
  { keys: "d", description: "Toggle debug counters" },
  { keys: "c", description: "Clear active events feed" },
  { keys: "q", description: "Exit console" },
]);

function timeStamp(date = new Date()): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

const seedServices = [
  {
    id: "auth",
    name: "Auth Gateway",
    region: "us-east-1",
    tier: "edge",
    status: "healthy",
    latencyMs: 22,
    errorRate: 0.18,
    trafficRpm: 14250,
    cpuPct: 44,
    memoryPct: 53,
    saturation: 41,
  },
  {
    id: "billing",
    name: "Billing API",
    region: "us-west-2",
    tier: "stateful",
    status: "warning",
    latencyMs: 84,
    errorRate: 1.12,
    trafficRpm: 7340,
    cpuPct: 61,
    memoryPct: 70,
    saturation: 66,
  },
  {
    id: "search",
    name: "Search Index",
    region: "eu-central-1",
    tier: "core",
    status: "healthy",
    latencyMs: 36,
    errorRate: 0.32,
    trafficRpm: 9860,
    cpuPct: 52,
    memoryPct: 58,
    saturation: 52,
  },
  {
    id: "realtime",
    name: "Realtime Fanout",
    region: "ap-south-1",
    tier: "core",
    status: "warning",
    latencyMs: 98,
    errorRate: 1.92,
    trafficRpm: 12320,
    cpuPct: 78,
    memoryPct: 74,
    saturation: 79,
  },
  {
    id: "exports",
    name: "Export Workers",
    region: "us-east-1",
    tier: "stateful",
    status: "down",
    latencyMs: 0,
    errorRate: 8.4,
    trafficRpm: 640,
    cpuPct: 96,
    memoryPct: 91,
    saturation: 97,
  },
  {
    id: "notify",
    name: "Notification Bus",
    region: "eu-west-1",
    tier: "edge",
    status: "healthy",
    latencyMs: 31,
    errorRate: 0.27,
    trafficRpm: 8110,
    cpuPct: 47,
    memoryPct: 55,
    saturation: 48,
  },
] as const satisfies readonly Omit<Service, "history">[];

const initialServices: readonly Service[] = Object.freeze(
  seedServices.map((service) => ({
    ...service,
    history: Object.freeze(Array.from({ length: 24 }, () => service.latencyMs)),
  })),
);

const initialIncidents: readonly Incident[] = Object.freeze([
  {
    id: 1,
    at: timeStamp(),
    severity: "critical",
    message: "Export Workers entered fail-safe mode after queue timeout in us-east-1.",
  },
  {
    id: 2,
    at: timeStamp(),
    severity: "warn",
    message: "Realtime Fanout jitter exceeded 90 ms SLO in ap-south-1.",
  },
  {
    id: 3,
    at: timeStamp(),
    severity: "info",
    message: "Canary deploy #491 promoted to production on global-edge.",
  },
]);

const initialNowMs = Date.now();

function averageLatency(services: readonly Service[]): number {
  return Math.round(
    services.reduce((total, service) => total + service.latencyMs, 0) /
      Math.max(1, services.length),
  );
}

function averageErrorRate(services: readonly Service[]): number {
  return round2(
    services.reduce((total, service) => total + service.errorRate, 0) /
      Math.max(1, services.length),
  );
}

function totalTraffic(services: readonly Service[]): number {
  return services.reduce((total, service) => total + service.trafficRpm, 0);
}

function repeatSeries(value: number, size = 28): readonly number[] {
  return Object.freeze(Array.from({ length: size }, () => value));
}

const app = createApp<State>({
  backend: createNodeBackend({
    emojiWidthPolicy: "auto",
    fpsCap: UI_FPS_CAP,
    // Keep engine present/poll off the app thread so animated frames don't
    // delay keyboard/mouse routing under load.
    executionMode: "worker",
  }),
  config: { fpsCap: UI_FPS_CAP },
  theme: themeCatalog.nord.theme,
  initialState: {
    services: initialServices,
    selectedId:
      initialServices.find((service) => service.status === "down")?.id ??
      initialServices[0]?.id ??
      "",
    pinnedId: null,
    filter: "all",
    sort: "name",
    sortDirection: "asc",
    paused: false,
    debug: false,
    helpOpen: false,
    themeName: "nord",
    ticks: 0,
    updatesApplied: 0,
    incidents: initialIncidents,
    nextIncidentId: 4,
    startedAt: initialNowMs,
    nowMs: initialNowMs,
    lastUpdateAt: initialNowMs,
    fleetLatencyHistory: repeatSeries(averageLatency(initialServices)),
    fleetErrorHistory: repeatSeries(averageErrorRate(initialServices)),
    fleetTrafficHistory: repeatSeries(totalTraffic(initialServices)),
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function smoothInt(current: number, target: number, gain: number): number {
  return Math.round(current + (target - current) * gain);
}

function smoothFloat(current: number, target: number, gain: number): number {
  return current + (target - current) * gain;
}

function formatTrafficCompact(rpm: number): string {
  if (rpm >= 1000) return `${(rpm / 1000).toFixed(1)}k`;
  return `${rpm}`;
}

function formatTrafficFixed(rpm: number): string {
  return formatTrafficCompact(rpm).padStart(6, " ");
}

function formatHzFixed(hz: number): string {
  return `${hz.toFixed(2).padStart(5, " ")} Hz`;
}

function formatMsFixed(ms: number): string {
  return `${Math.max(0, Math.round(ms)).toString().padStart(4, " ")} ms`;
}

function formatSecondsFixed(seconds: number): string {
  return `${Math.max(0, Math.round(seconds)).toString().padStart(4, " ")} s`;
}

function clipLabel(value: string, maxChars: number): string {
  if (maxChars <= 1) return value.slice(0, 1);
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

function fixedLabel(value: string, maxChars: number, width = maxChars): string {
  return clipLabel(value, maxChars).padEnd(width, " ");
}

function signedDelta(value: number, digits = 0): string {
  const rounded = digits === 0 ? Math.round(value).toString() : value.toFixed(digits);
  if (value > 0) return `+${rounded}`;
  if (value < 0) return rounded;
  return digits === 0 ? "0" : Number(value).toFixed(digits);
}

function deltaSeverity(
  value: number,
  warningThreshold: number,
  criticalThreshold: number,
): BadgeVariant {
  const magnitude = Math.abs(value);
  if (magnitude >= criticalThreshold) return "error";
  if (magnitude >= warningThreshold) return "warning";
  return "success";
}

function statusBadge(status: ServiceStatus): { text: string; variant: BadgeVariant } {
  if (status === "healthy") return { text: "Healthy", variant: "success" };
  if (status === "warning") return { text: "Warning", variant: "warning" };
  return { text: "Critical", variant: "error" };
}

function incidentBadge(severity: Incident["severity"]): { text: string; variant: BadgeVariant } {
  if (severity === "critical") return { text: "Critical", variant: "error" };
  if (severity === "warn") return { text: "Warning", variant: "warning" };
  return { text: "Info", variant: "info" };
}

function incidentIcon(severity: Incident["severity"]): string {
  if (severity === "critical") return "status.cross";
  if (severity === "warn") return "status.warning";
  return "status.info";
}

function statusToIndicator(status: ServiceStatus): StatusType {
  if (status === "healthy") return "online";
  if (status === "warning") return "away";
  return "busy";
}

function serviceIcon(status: ServiceStatus): string {
  if (status === "healthy") return "status.check";
  if (status === "warning") return "status.dot";
  return "status.cross";
}

function statusEmoji(status: ServiceStatus): string {
  if (status === "healthy") return "🟢";
  if (status === "warning") return "🟡";
  return "🔴";
}

function statusCellGlyph(_status: ServiceStatus): string {
  return "●";
}

function animationFrame(frames: readonly string[], tick: number): string {
  if (frames.length === 0) return "";
  const index = Math.abs(tick) % frames.length;
  return frames[index] ?? frames[0] ?? "";
}

function tierSymbol(tier: Service["tier"]): string {
  if (tier === "edge") return "◌";
  if (tier === "core") return "◆";
  return "▣";
}

function serviceOwner(service: Service): string {
  if (service.tier === "stateful") return "Data Platform";
  if (service.tier === "core") return "Core Runtime";
  return "Edge Runtime";
}

function serviceRunbook(service: Service): string {
  if (service.status === "down") return "RB-017";
  if (service.status === "warning") return "RB-011";
  return "RB-004";
}

function serviceSlo(service: Service): string {
  if (service.tier === "stateful") return "150 ms";
  if (service.tier === "core") return "120 ms";
  return "95 ms";
}

function panel(
  title: string,
  children: readonly VNode[],
  flex = 1,
  style: TextStyle | undefined = undefined,
): VNode {
  const props =
    style === undefined
      ? {
          title,
          flex,
          border: "rounded" as const,
          px: PANEL_PADDING_X,
          py: PANEL_PADDING_Y,
        }
      : {
          title,
          flex,
          border: "rounded" as const,
          px: PANEL_PADDING_X,
          py: PANEL_PADDING_Y,
          style,
        };
  return ui.box(props, children);
}

function toolbarAction(
  _iconPath: string,
  buttonId: string,
  label: string,
  onPress: () => void,
): VNode {
  return ui.button({ id: buttonId, label, onPress });
}

function shortcutLabel(keys: string | readonly string[]): string {
  const parts = Array.isArray(keys) ? keys : [keys];
  return parts.join(" + ");
}

function applyFilter(services: readonly Service[], filter: Filter): Service[] {
  if (filter === "all") return [...services];
  return services.filter((service) => service.status === filter);
}

function statusPriority(status: ServiceStatus): number {
  if (status === "down") return 0;
  if (status === "warning") return 1;
  return 2;
}

function sortServices(
  services: readonly Service[],
  sort: SortKey,
  direction: SortDirection,
): Service[] {
  const weight = direction === "asc" ? 1 : -1;
  const sorted = [...services].sort((a, b) => {
    const severityOrder = statusPriority(a.status) - statusPriority(b.status);
    if (severityOrder !== 0) return severityOrder;

    let base = 0;
    if (sort === "name") {
      base = a.name.localeCompare(b.name);
    } else if (sort === "latencyMs") {
      base = a.latencyMs - b.latencyMs;
    } else if (sort === "errorRate") {
      base = a.errorRate - b.errorRate;
    } else {
      base = a.trafficRpm - b.trafficRpm;
    }

    if (base === 0) base = a.name.localeCompare(b.name);
    return base * weight;
  });

  return sorted;
}

function visibleServicesFor(
  services: readonly Service[],
  filter: Filter,
  sort: SortKey,
  direction: SortDirection,
): Service[] {
  return sortServices(applyFilter(services, filter), sort, direction);
}

function selectedFromVisible(visible: readonly Service[], selectedId: string): Service | undefined {
  return visible.find((service) => service.id === selectedId) ?? visible[0];
}

function withResolvedSelection(state: State): State {
  const visible = visibleServicesFor(state.services, state.filter, state.sort, state.sortDirection);
  if (visible.length === 0) return state;
  const selected = selectedFromVisible(visible, state.selectedId);
  if (!selected) return state;
  if (selected.id === state.selectedId) return state;
  return { ...state, selectedId: selected.id };
}

function moveSelection(state: State, delta: number): State {
  const visible = visibleServicesFor(state.services, state.filter, state.sort, state.sortDirection);
  if (visible.length === 0) return state;

  const current = visible.findIndex((service) => service.id === state.selectedId);
  const nextIndex = clamp((current < 0 ? 0 : current) + delta, 0, visible.length - 1);
  const next = visible[nextIndex];
  if (!next) return state;
  if (next.id === state.selectedId) return state;
  return { ...state, selectedId: next.id };
}

function cycleFilter(filter: Filter): Filter {
  if (filter === "all") return "warning";
  if (filter === "warning") return "down";
  if (filter === "down") return "healthy";
  return "all";
}

function filterLabel(filter: Filter): string {
  if (filter === "all") return "ALL";
  if (filter === "healthy") return "HEALTHY";
  if (filter === "warning") return "WARNING";
  return "DOWN";
}

function defaultDirectionForSort(sort: SortKey): SortDirection {
  return sort === "name" ? "asc" : "desc";
}

function cycleSort(sort: SortKey): SortKey {
  const order: readonly SortKey[] = ["name", "latencyMs", "errorRate", "trafficRpm"];
  const index = order.indexOf(sort);
  const nextIndex = index < 0 ? 0 : (index + 1) % order.length;
  return order[nextIndex] ?? "name";
}

function toSortKey(value: string): SortKey | null {
  if (value === "name") return "name";
  if (value === "latencyMs") return "latencyMs";
  if (value === "errorRate") return "errorRate";
  if (value === "trafficRpm") return "trafficRpm";
  return null;
}

function sortLabel(sort: SortKey): string {
  if (sort === "latencyMs") return "Latency SLO";
  if (sort === "errorRate") return "Error Rate";
  if (sort === "trafficRpm") return "Traffic";
  return "Service";
}

function deriveStatus(latencyMs: number, errorRate: number, saturation: number): ServiceStatus {
  if (errorRate >= 4.2 || saturation >= 95 || latencyMs >= 170) {
    return "down";
  }
  if (errorRate >= 1.4 || saturation >= 82 || latencyMs >= 95) {
    return "warning";
  }
  return "healthy";
}

function pushSeries(history: readonly number[], value: number, maxSize = 28): readonly number[] {
  return Object.freeze([...history, value].slice(-maxSize));
}

function pushHistory(history: readonly number[], latencyMs: number): readonly number[] {
  return pushSeries(history, latencyMs, 24);
}

function nextThemeName(current: ThemeName): ThemeName {
  const index = themeOrder.indexOf(current);
  const nextIndex = index < 0 ? 0 : (index + 1) % themeOrder.length;
  return themeOrder[nextIndex] ?? themeOrder[0] ?? "nord";
}

function cycleThemeAction(): void {
  let next: ThemeName = "nord";
  app.update((state) => {
    next = nextThemeName(state.themeName);
    if (next === state.themeName) return state;
    return {
      ...state,
      themeName: next,
    };
  });
  app.setTheme(themeCatalog[next].theme);
}

function togglePauseAction(): void {
  app.update((state) => ({ ...state, paused: !state.paused }));
}

function cycleFilterAction(): void {
  app.update((state) =>
    withResolvedSelection({
      ...state,
      filter: cycleFilter(state.filter),
    }),
  );
}

function cycleSortAction(): void {
  app.update((state) => {
    const nextSort = cycleSort(state.sort);
    return withResolvedSelection({
      ...state,
      sort: nextSort,
      sortDirection: defaultDirectionForSort(nextSort),
    });
  });
}

function toggleSortDirectionAction(): void {
  app.update((state) =>
    withResolvedSelection({
      ...state,
      sortDirection: state.sortDirection === "asc" ? "desc" : "asc",
    }),
  );
}

function toggleDebugAction(): void {
  app.update((state) => ({ ...state, debug: !state.debug }));
}

function clearIncidentsAction(): void {
  app.update((state) => ({ ...state, incidents: Object.freeze([]) }));
}

function togglePinAction(): void {
  app.update((state) => {
    const visible = visibleServicesFor(
      state.services,
      state.filter,
      state.sort,
      state.sortDirection,
    );
    const selected = selectedFromVisible(visible, state.selectedId);
    if (!selected) return state;
    return {
      ...state,
      pinnedId: state.pinnedId === selected.id ? null : selected.id,
    };
  });
}

function openHelpAction(): void {
  app.update((state) => ({ ...state, helpOpen: true }));
}

function closeHelpAction(): void {
  app.update((state) => ({ ...state, helpOpen: false }));
}

function simulateTick(state: State, nowMs: number): State {
  if (state.paused) return state;
  const nextTick = state.ticks + 1;

  let nextIncidentId = state.nextIncidentId;
  const generated: Incident[] = [];

  const addIncident = (severity: Incident["severity"], message: string): void => {
    generated.push({ id: nextIncidentId, at: timeStamp(), severity, message });
    nextIncidentId += 1;
  };

  const nextServices = state.services.map((service, index) => {
    const phaseA = nextTick * 0.18 + index * 1.17;
    const phaseB = nextTick * 0.09 + index * 0.63;
    const latencySwingA = SHOWCASE_MODE ? 6 : 9;
    const latencySwingB = SHOWCASE_MODE ? 3 : 4;
    const errorSwing = SHOWCASE_MODE ? 0.12 : 0.2;
    const trafficSwingA = SHOWCASE_MODE ? 300 : 420;
    const trafficSwingB = SHOWCASE_MODE ? 170 : 260;
    const cpuSwing = SHOWCASE_MODE ? 4 : 6;
    const memSwing = SHOWCASE_MODE ? 3 : 5;
    const satSwing = SHOWCASE_MODE ? 3 : 4;

    const targetLatency = clamp(
      Math.round(
        service.latencyMs + Math.sin(phaseA) * latencySwingA + Math.cos(phaseB) * latencySwingB,
      ),
      12,
      280,
    );
    const latencyMs = clamp(smoothInt(service.latencyMs, targetLatency, 0.22), 12, 280);

    const targetError = clamp(service.errorRate + Math.sin(phaseB) * errorSwing, 0.03, 9.9);
    const errorRate = round2(clamp(smoothFloat(service.errorRate, targetError, 0.2), 0.03, 9.9));

    const targetTraffic = clamp(
      Math.round(
        service.trafficRpm + Math.sin(phaseA) * trafficSwingA + Math.cos(phaseB) * trafficSwingB,
      ),
      400,
      34000,
    );
    const trafficRpm = clamp(smoothInt(service.trafficRpm, targetTraffic, 0.2), 400, 34000);

    const targetCpu = clamp(Math.round(service.cpuPct + Math.sin(phaseA) * cpuSwing), 18, 99);
    const targetMem = clamp(Math.round(service.memoryPct + Math.cos(phaseB) * memSwing), 16, 99);
    const targetSat = clamp(Math.round(service.saturation + Math.sin(phaseA) * satSwing), 14, 99);

    const cpuPct = clamp(smoothInt(service.cpuPct, targetCpu, 0.24), 18, 99);
    const memoryPct = clamp(smoothInt(service.memoryPct, targetMem, 0.22), 16, 99);
    const saturation = clamp(smoothInt(service.saturation, targetSat, 0.24), 14, 99);

    const status = deriveStatus(latencyMs, errorRate, saturation);

    if (status !== service.status) {
      addIncident(
        status === "down" ? "critical" : status === "warning" ? "warn" : "info",
        `${service.name} health changed ${service.status.toUpperCase()} -> ${status.toUpperCase()}.`,
      );
    }

    if (latencyMs >= 145 && status === "warning" && nextTick % 18 === (index + 3) % 18) {
      addIncident("warn", `${service.name} crossed ${latencyMs} ms p95 latency SLO.`);
    }

    return {
      ...service,
      status,
      latencyMs,
      errorRate,
      trafficRpm,
      cpuPct,
      memoryPct,
      saturation,
      history: pushHistory(service.history, latencyMs),
    };
  });

  if (nextTick % 16 === 0 && nextServices.length > 0) {
    const hottest = nextServices.reduce((prev, curr) =>
      curr.saturation > prev.saturation ? curr : prev,
    );
    addIncident("info", `${hottest.name} saturation is now ${hottest.saturation}%.`);
  }

  const fleetLatency = averageLatency(nextServices);
  const fleetError = averageErrorRate(nextServices);
  const fleetTraffic = totalTraffic(nextServices);

  const nextState = withResolvedSelection({
    ...state,
    services: nextServices,
    ticks: nextTick,
    updatesApplied: state.updatesApplied + 1,
    incidents: Object.freeze([...generated, ...state.incidents].slice(0, 12)),
    nextIncidentId,
    nowMs,
    lastUpdateAt: nowMs,
    fleetLatencyHistory: pushSeries(state.fleetLatencyHistory, fleetLatency, 30),
    fleetErrorHistory: pushSeries(state.fleetErrorHistory, fleetError, 30),
    fleetTrafficHistory: pushSeries(state.fleetTrafficHistory, fleetTraffic, 30),
  });

  return nextState;
}

app.view((state) => {
  const visible = visibleServicesFor(state.services, state.filter, state.sort, state.sortDirection);
  const selected = selectedFromVisible(visible, state.selectedId) ?? state.services[0];
  const pinned = state.pinnedId
    ? (state.services.find((service) => service.id === state.pinnedId) ?? null)
    : null;

  const healthyCount = state.services.filter((service) => service.status === "healthy").length;
  const warningCount = state.services.filter((service) => service.status === "warning").length;
  const downCount = state.services.filter((service) => service.status === "down").length;
  const overallStatus: ServiceStatus =
    downCount > 0 ? "down" : warningCount > 0 ? "warning" : "healthy";

  const overallBadge = statusBadge(overallStatus);
  const clusterHealthLabel =
    overallStatus === "down" ? "Critical" : overallStatus === "warning" ? "Degraded" : "Healthy";

  const themeSpec = themeCatalog[state.themeName];
  const palette = themeSpec.theme.colors;
  const rootStyle: TextStyle = { bg: palette.bg.base, fg: palette.fg.primary };
  const panelStyle: TextStyle = { bg: palette.bg.elevated, fg: palette.fg.primary };
  const stripStyle: TextStyle = { bg: palette.bg.subtle, fg: palette.fg.primary };
  const sectionLabelStyle: TextStyle = { fg: palette.fg.secondary, bold: true };
  const metaStyle: TextStyle = { fg: palette.fg.secondary, dim: true };
  const quietStyle: TextStyle = { fg: palette.fg.muted, dim: true };
  const accentStyle: TextStyle = { fg: palette.accent.primary };

  const avgLatency = state.fleetLatencyHistory[state.fleetLatencyHistory.length - 1] ?? 0;
  const avgError = state.fleetErrorHistory[state.fleetErrorHistory.length - 1] ?? 0;
  const avgTraffic = state.fleetTrafficHistory[state.fleetTrafficHistory.length - 1] ?? 0;
  const prevLatency = state.fleetLatencyHistory[state.fleetLatencyHistory.length - 2] ?? avgLatency;
  const prevError = state.fleetErrorHistory[state.fleetErrorHistory.length - 2] ?? avgError;
  const prevTraffic = state.fleetTrafficHistory[state.fleetTrafficHistory.length - 2] ?? avgTraffic;
  const latencyDelta = avgLatency - prevLatency;
  const errorDelta = avgError - prevError;
  const trafficDelta = avgTraffic - prevTraffic;
  const cadencePulse = animationFrame(CADENCE_PULSE_FRAMES, state.ticks);

  const avgCpu = Math.round(
    state.services.reduce((total, service) => total + service.cpuPct, 0) /
      Math.max(1, state.services.length),
  );
  const avgMem = Math.round(
    state.services.reduce((total, service) => total + service.memoryPct, 0) /
      Math.max(1, state.services.length),
  );

  const wallNowMs = state.paused ? Date.now() : state.nowMs;
  const uptimeSeconds = Math.max(1, Math.floor((wallNowMs - state.startedAt) / 1000));
  const updateRate = state.updatesApplied / uptimeSeconds;
  const stalenessMs = wallNowMs - state.lastUpdateAt;
  const liveCadenceMs = Math.max(1, Math.round(1000 / Math.max(updateRate, 0.1)));
  const stalenessSeconds = Math.max(0, Math.round(stalenessMs / 1000));
  const updateRateLabel = formatHzFixed(updateRate);
  const cadenceLabel = formatMsFixed(liveCadenceMs);
  const staleLabel = formatSecondsFixed(stalenessSeconds);

  const themeLabel = fixedLabel(themeSpec.label, 12, 12);
  const pinnedLabel = pinned ? fixedLabel(pinned.name, 16, 16) : fixedLabel("none", 16, 16);
  const selectedLabel = selected ? fixedLabel(selected.name, 18, 18) : "";
  const incidentCountLabel = String(state.incidents.length).padStart(2, " ");
  const filterBadgeLabel = fixedLabel(filterLabel(state.filter), 7, 7);
  const sortBadgeLabel = `${fixedLabel(sortLabel(state.sort), 10, 10)} ${state.sortDirection === "asc" ? "↑" : "↓"}`;
  const sortPanelLabel = `${fixedLabel(sortLabel(state.sort), SORT_PANEL_LABEL_WIDTH, SORT_PANEL_LABEL_WIDTH)} ${state.sortDirection === "asc" ? "↑" : "↓"}`;
  const clusterHealthFixedLabel = fixedLabel(
    clusterHealthLabel.toUpperCase(),
    CLUSTER_HEALTH_LABEL_WIDTH,
    CLUSTER_HEALTH_LABEL_WIDTH,
  );
  const refreshLabel = state.paused
    ? fixedLabel("paused", REFRESH_LABEL_WIDTH, REFRESH_LABEL_WIDTH)
    : fixedLabel(cadenceLabel.trimStart(), REFRESH_LABEL_WIDTH, REFRESH_LABEL_WIDTH);
  const rateLabel = fixedLabel(updateRateLabel.trimStart(), RATE_LABEL_WIDTH, RATE_LABEL_WIDTH);
  const syncValueLabel = refreshLabel;
  const latencyValueLabel = `${String(Math.round(avgLatency)).padStart(3, " ")} ms`;
  const errorValueLabel = `${avgError.toFixed(2).padStart(5, " ")}%`;
  const throughputValueLabel = `${formatTrafficFixed(avgTraffic)} rpm`;

  const cadenceVariant: BadgeVariant =
    state.paused || stalenessMs > Math.max(TELEMETRY_CADENCE_MS * 2, liveCadenceMs * 2)
      ? "warning"
      : "success";
  const latencyDeltaVariant = deltaSeverity(latencyDelta, 6, 12);
  const errorDeltaVariant = deltaSeverity(errorDelta, 0.15, 0.4);
  const trafficDeltaVariant = deltaSeverity(trafficDelta, 500, 1100);
  const loadVariant: BadgeVariant =
    avgCpu >= 85 || avgMem >= 88 ? "error" : avgCpu >= 72 ? "warning" : "success";
  const freshnessRatio = state.paused
    ? 0
    : clamp(1 - stalenessMs / Math.max(TELEMETRY_CADENCE_MS * 2, liveCadenceMs * 2), 0, 1);
  const latencyRatio = clamp(avgLatency / 180, 0, 1);
  const errorRatio = clamp(avgError / 5, 0, 1);
  const trafficRatio = clamp(avgTraffic / 60000, 0, 1);
  const loadRatio = clamp(Math.max(avgCpu, avgMem) / 100, 0, 1);

  const kpiTrackStyle: TextStyle = { fg: palette.border.subtle };
  const freshnessBarStyle: TextStyle = { fg: palette.accent.primary };
  const latencyBarStyle: TextStyle = { fg: palette.warning };
  const errorBarStyle: TextStyle = { fg: palette.error };
  const throughputBarStyle: TextStyle = { fg: palette.success };
  const loadBarStyle: TextStyle = { fg: palette.accent.secondary };

  const summaryBanner: Readonly<{
    icon: string;
    title: string;
    message: string;
    variant: BadgeVariant;
  }> =
    downCount > 0
      ? {
          icon: "status.cross",
          title: "CRITICAL OUTAGE",
          message: `${String(downCount).padStart(2, " ")} services down - escalate and reroute traffic.`,
          variant: "error",
        }
      : warningCount > 0
        ? {
            icon: "status.warning",
            title: "DEGRADED OPS",
            message: `${String(warningCount).padStart(2, " ")} services degraded - monitor burn and prepare mitigation.`,
            variant: "warning",
          }
        : {
            icon: "status.check",
            title: "HEALTHY FLEET",
            message: "All services are within expected SLO bounds.",
            variant: "success",
          };

  const runbookPlan: Readonly<{
    title: string;
    variant: BadgeVariant;
    summary: string;
    step1: string;
    step2: string;
    step3: string;
  }> =
    overallStatus === "down"
      ? {
          title: "Incident Commander",
          variant: "error",
          summary: "P1 path active for failing services.",
          step1: "Page primary on-call and assign commander.",
          step2: "Reroute traffic from failing region.",
          step3: "Validate queue depth and upstream deps.",
        }
      : overallStatus === "warning"
        ? {
            title: "Heightened Monitoring",
            variant: "warning",
            summary: "No page yet, active watch required.",
            step1: "Track p95 latency and error trend.",
            step2: "Prepare rollback + canary hold.",
            step3: "Escalate if burn crosses threshold.",
          }
        : {
            title: "Steady State",
            variant: "success",
            summary: "Runbook idle, baseline operations.",
            step1: "Observe release health indicators.",
            step2: "Review event feed for anomalies.",
            step3: "Keep incident channel clear.",
          };

  const pulseCard = (
    title: string,
    value: string,
    variant: BadgeVariant,
    body: readonly VNode[],
  ): VNode =>
    ui.box(
      {
        border: "rounded",
        px: PANEL_PADDING_X,
        py: PANEL_PADDING_Y,
        flex: 1,
        minWidth: 24,
        style: panelStyle,
      },
      [
        ui.column({ gap: 1 }, [
          ui.row({ gap: 1, items: "center" }, [
            ui.text(title, { style: sectionLabelStyle }),
            ui.spacer({ flex: 1 }),
            ui.badge(value, { variant }),
          ]),
          ...body,
        ]),
      ],
    );

  const statusCellStyle = (status: ServiceStatus): TextStyle => {
    if (status === "healthy") return { fg: palette.success, bold: true };
    if (status === "warning") return { fg: palette.warning, bold: true };
    return { fg: palette.error, bold: true };
  };

  const tableColumns: readonly TableColumn<Service>[] = [
    {
      key: "name",
      header: "Service",
      flex: 2,
      minWidth: 30,
      sortable: true,
      render: (_, row) =>
        ui.row({ gap: 1, items: "center" }, [
          ui.text(row.id === state.selectedId ? "▸" : "·", {
            style: row.id === state.selectedId ? accentStyle : quietStyle,
          }),
          ui.icon(serviceIcon(row.status)),
          ui.text(row.name, {
            style: { bold: row.id === state.selectedId || row.id === state.pinnedId },
          }),
          ui.text(tierSymbol(row.tier), { style: quietStyle }),
          row.id === state.pinnedId ? ui.icon("ui.star") : null,
        ]),
    },
    {
      key: "region",
      header: "Region",
      width: TABLE_REGION_WIDTH,
      overflow: "clip",
      render: (_, row) => ui.text(fixedLabel(row.region, 10, 10), { style: metaStyle }),
    },
    {
      key: "status",
      header: "Health",
      width: TABLE_STATUS_WIDTH,
      overflow: "clip",
      render: (_, row) =>
        ui.text(
          `${statusCellGlyph(row.status)} ${fixedLabel(row.status.toUpperCase(), TABLE_STATUS_LABEL_WIDTH, TABLE_STATUS_LABEL_WIDTH)}`,
          { style: statusCellStyle(row.status) },
        ),
    },
    {
      key: "latencyMs",
      header: "P95 ms",
      width: 8,
      align: "right",
      sortable: true,
      render: (_, row) =>
        ui.text(`${row.latencyMs}`.padStart(3, " "), { style: { bold: row.latencyMs >= 110 } }),
    },
    {
      key: "errorRate",
      header: "Err %",
      width: 8,
      align: "right",
      sortable: true,
      render: (_, row) =>
        ui.text(row.errorRate.toFixed(2).padStart(5, " "), {
          style: { bold: row.errorRate >= 1.4 },
        }),
    },
    {
      key: "trafficRpm",
      header: "RPM",
      width: 9,
      align: "right",
      sortable: true,
      render: (_, row) => ui.text(formatTrafficFixed(row.trafficRpm)),
    },
  ];

  const selectedBadge = statusBadge(selected?.status ?? "healthy");
  const selectedErrorBudget = clamp((selected?.errorRate ?? 0) / 5, 0, 1);
  const selectedLatencyBudget = clamp((selected?.latencyMs ?? 0) / 180, 0, 1);
  const selectedPanelName = selected ? fixedLabel(selected.name, 18, 18) : "";
  const selectedPanelStatus = fixedLabel(selectedBadge.text, 8, 8);
  const selectedPanelRegion = selected ? fixedLabel(selected.region, 10, 10) : "";
  const selectedPanelTier = selected ? fixedLabel(selected.tier, 8, 8) : "";
  const selectedOwner = selected ? fixedLabel(serviceOwner(selected), 13, 13) : "";
  const selectedRunbook = selected ? fixedLabel(serviceRunbook(selected), 6, 6) : "";
  const selectedSlo = selected ? fixedLabel(serviceSlo(selected), 6, 6) : "";

  const inspectorGuidance: Readonly<{
    title: string;
    message: string;
    variant: BadgeVariant;
  }> =
    !selected || selected.status === "healthy"
      ? {
          title: "Nominal Service",
          message: "No escalation required. Continue observing baseline telemetry.",
          variant: "success",
        }
      : selected.status === "warning"
        ? {
            title: "Watch Closely",
            message: "Track latency and error trend. Prepare mitigation if burn accelerates.",
            variant: "warning",
          }
        : {
            title: "Escalate Immediately",
            message: "Page on-call SRE, shift traffic, and inspect queue + dependency health.",
            variant: "error",
          };

  const incidentBadgeLabel = (severity: Incident["severity"]): string =>
    fixedLabel(incidentBadge(severity).text, INCIDENT_BADGE_WIDTH, INCIDENT_BADGE_WIDTH);

  const helpShortcutRow = (keys: string | readonly string[], description: string): VNode =>
    ui.row({ gap: 2, items: "center" }, [
      ui.badge(fixedLabel(shortcutLabel(keys), 19, 19), { variant: "info" }),
      ui.text(description, { style: metaStyle }),
    ]);

  const mainContent = ui.column({ flex: 1, p: 1, gap: 1, items: "stretch", style: rootStyle }, [
    ui.box({ border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: stripStyle }, [
      ui.column({ gap: 1 }, [
        ui.row({ items: "center", gap: 1, wrap: true }, [
          ui.row({ gap: 2, items: "center" }, [
            ui.text("🛰"),
            ui.text(PRODUCT_NAME, { variant: "heading" }),
            ui.tag(`Env ${PRODUCT_ENVIRONMENT}`, { variant: "warning" }),
            ui.status(state.paused ? "away" : "online", {
              label: state.paused ? "Paused" : "Streaming",
            }),
          ]),
          ui.spacer({ flex: 1 }),
          ui.badge(`Cluster Health ${clusterHealthFixedLabel}`, { variant: overallBadge.variant }),
        ]),
        ui.text(PRODUCT_TAGLINE, { style: sectionLabelStyle }),
        ui.row({ justify: "between", items: "center", gap: 1, wrap: true }, [
          ui.row({ gap: 1, items: "center", wrap: true }, [
            ui.text(`Cluster ${PRODUCT_CLUSTER}`, { style: metaStyle }),
            ui.text("·", { style: quietStyle }),
            ui.text(`Refresh ${refreshLabel}`, { style: metaStyle }),
            ui.text("·", { style: quietStyle }),
            ui.text(`Rate ${rateLabel}`, { style: metaStyle }),
          ]),
          ui.row({ gap: 1, items: "center", wrap: true }, [
            SHOWCASE_MODE ? ui.tag("Showcase Mode", { variant: "info" }) : null,
            ui.tag(`Theme ${themeLabel}`, { variant: themeSpec.badge }),
            ui.tag(`Pinned ${pinnedLabel}`, { variant: pinned ? "info" : "default" }),
          ]),
        ]),
      ]),
    ]),

    ui.box({ border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: stripStyle }, [
      ui.row({ gap: 1, items: "center", wrap: true }, [
        ui.icon(summaryBanner.icon),
        ui.badge(
          `[ ${fixedLabel(summaryBanner.title, SUMMARY_ALERT_LABEL_WIDTH, SUMMARY_ALERT_LABEL_WIDTH)} ]`,
          {
            variant: summaryBanner.variant,
          },
        ),
        ui.text(summaryBanner.message, {
          textOverflow: "ellipsis",
          maxWidth: 92,
        }),
      ]),
    ]),

    ui.box({ border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: stripStyle }, [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 2, items: "center", wrap: true }, [
          toolbarAction(
            state.paused ? "ui.play" : "status.dot",
            "toggle-pause",
            "⏯  Stream",
            togglePauseAction,
          ),
          toolbarAction("ui.refresh", "cycle-theme", "🎨 Theme", cycleThemeAction),
          toolbarAction("status.question", "help", "❓ Help", openHelpAction),
          toolbarAction("ui.close", "clear-incidents", "🧹 Clear Events", clearIncidentsAction),
        ]),
        ui.row({ gap: 2, items: "center", wrap: true }, [
          ui.button({
            id: "cycle-filter",
            label: `🧭 Filter ${filterLabel(state.filter)}`,
            onPress: cycleFilterAction,
          }),
          ui.button({ id: "cycle-sort", label: "⇅ Sort Field", onPress: cycleSortAction }),
          ui.button({
            id: "toggle-order",
            label: "⇵ Sort Direction",
            onPress: toggleSortDirectionAction,
          }),
          ui.button({ id: "toggle-pin", label: "📌 Pin Service", onPress: togglePinAction }),
          ui.button({ id: "toggle-debug", label: "🧪 Debug", onPress: toggleDebugAction }),
        ]),
      ]),
    ]),

    ui.row({ gap: 1, wrap: true, items: "stretch" }, [
      pulseCard("Sync Interval", syncValueLabel, cadenceVariant, [
        ui.row({ gap: 1, items: "center" }, [
          state.paused
            ? ui.icon("ui.pause")
            : ui.spinner({
                variant: LIVE_SPINNER_VARIANT,
                label: cadencePulse,
                style: { fg: palette.accent.primary },
              }),
          ui.text(state.paused ? `Stale ${staleLabel}` : `Rate ${updateRateLabel}`, {
            style: metaStyle,
          }),
        ]),
        ui.progress(freshnessRatio, {
          variant: "blocks",
          width: KPI_PROGRESS_WIDTH,
          style: freshnessBarStyle,
          trackStyle: kpiTrackStyle,
        }),
        ui.text(`Cadence target ${cadenceLabel}`, { style: quietStyle }),
      ]),
      pulseCard("Latency SLO", latencyValueLabel, latencyDeltaVariant, [
        ui.sparkline(state.fleetLatencyHistory, { width: KPI_SPARKLINE_WIDTH, min: 0, max: 220 }),
        ui.progress(latencyRatio, {
          variant: "minimal",
          width: KPI_PROGRESS_WIDTH,
          style: latencyBarStyle,
          trackStyle: kpiTrackStyle,
        }),
        ui.text(`${signedDelta(latencyDelta)} ms / cycle`, { style: quietStyle }),
      ]),
      pulseCard("Error Budget Burn", errorValueLabel, errorDeltaVariant, [
        ui.sparkline(state.fleetErrorHistory, { width: KPI_SPARKLINE_WIDTH, min: 0, max: 10 }),
        ui.progress(errorRatio, {
          variant: "minimal",
          width: KPI_PROGRESS_WIDTH,
          style: errorBarStyle,
          trackStyle: kpiTrackStyle,
        }),
        ui.text(`${signedDelta(errorDelta, 2)}% / cycle`, { style: quietStyle }),
      ]),
      pulseCard("Request Throughput", throughputValueLabel, trafficDeltaVariant, [
        ui.sparkline(state.fleetTrafficHistory, { width: KPI_SPARKLINE_WIDTH }),
        ui.progress(trafficRatio, {
          variant: "blocks",
          width: KPI_PROGRESS_WIDTH,
          style: throughputBarStyle,
          trackStyle: kpiTrackStyle,
        }),
        ui.text(`${signedDelta(trafficDelta)} rpm / cycle`, { style: quietStyle }),
      ]),
    ]),

    ui.row({ flex: 3, gap: 1, items: "stretch" }, [
      panel(
        "Fleet Services",
        [
          ui.row({ items: "center", gap: 1, wrap: true }, [
            ui.row({ gap: 2, items: "center" }, [
              ui.status("busy", { label: `Critical ${String(downCount).padStart(2, " ")}` }),
              ui.status("away", { label: `Degraded ${String(warningCount).padStart(2, " ")}` }),
              ui.status("online", { label: `Healthy ${String(healthyCount).padStart(2, " ")}` }),
            ]),
            ui.spacer({ flex: 1 }),
            ui.row({ gap: 1, items: "center" }, [
              ui.badge(`Filter ${filterBadgeLabel}`, {
                variant:
                  state.filter === "all"
                    ? "default"
                    : state.filter === "down"
                      ? "error"
                      : "warning",
              }),
              ui.badge(`Sort ${sortPanelLabel}`, { variant: "info" }),
            ]),
          ]),
          visible.length === 0
            ? ui.empty("No services match this filter.", {
                description: "Press f or use the Filter control to return to ALL.",
                icon: "status.question",
              })
            : ui.table<Service>({
                id: "service-table",
                columns: tableColumns,
                data: visible,
                getRowKey: (row) => row.id,
                selection: selected ? [selected.id] : [],
                selectionMode: "single",
                onSelectionChange: (keys) => {
                  const nextId = keys[0];
                  if (!nextId) return;
                  app.update((s) => (s.selectedId === nextId ? s : { ...s, selectedId: nextId }));
                },
                onRowPress: (row) => {
                  app.update((s) => (s.selectedId === row.id ? s : { ...s, selectedId: row.id }));
                },
                onRowDoublePress: (row) => {
                  app.update((s) => ({
                    ...s,
                    selectedId: row.id,
                    pinnedId: s.pinnedId === row.id ? null : row.id,
                  }));
                },
                sortColumn: state.sort,
                sortDirection: state.sortDirection,
                onSort: (column, direction) => {
                  const sort = toSortKey(column);
                  if (!sort) return;
                  app.update((s) => {
                    if (s.sort === sort && s.sortDirection === direction) return s;
                    return withResolvedSelection({
                      ...s,
                      sort,
                      sortDirection: direction,
                    });
                  });
                },
                borderStyle: { variant: "rounded", color: palette.border.default },
              }),
        ],
        3,
        panelStyle,
      ),

      ui.column({ flex: 2, gap: 1, items: "stretch" }, [
        panel(
          "Service Inspector",
          [
            selected
              ? ui.column({ gap: 1 }, [
                  ui.row({ gap: 1, items: "center", wrap: true }, [
                    ui.icon(serviceIcon(selected.status)),
                    ui.text(selectedPanelName, { style: { bold: true } }),
                    ui.spacer({ flex: 1 }),
                    ui.badge(selectedPanelStatus, { variant: selectedBadge.variant }),
                    selected.id === state.pinnedId ? ui.icon("ui.star") : null,
                  ]),
                  ui.row({ gap: 1, wrap: true }, [
                    ui.tag(`🧭 Region ${selectedPanelRegion}`, { variant: "info" }),
                    ui.tag(`🧱 Tier ${selectedPanelTier}`, { variant: "default" }),
                    ui.tag(`📶 Traffic ${formatTrafficFixed(selected.trafficRpm)} rpm`, {
                      variant: "warning",
                    }),
                  ]),
                  ui.row({ gap: 1, wrap: true }, [
                    ui.tag(`👤 Owner ${selectedOwner}`, { variant: "default" }),
                    ui.tag(`📘 Runbook ${selectedRunbook}`, {
                      variant: inspectorGuidance.variant === "error" ? "error" : "info",
                    }),
                    ui.tag(`🎯 SLO ${selectedSlo}`, { variant: "info" }),
                  ]),
                  ui.row({ gap: 1, items: "center" }, [
                    ui.badge(fixedLabel(inspectorGuidance.title, 20, 20), {
                      variant: inspectorGuidance.variant,
                    }),
                    ui.text(inspectorGuidance.message, {
                      style: metaStyle,
                      textOverflow: "ellipsis",
                      maxWidth: 52,
                    }),
                  ]),
                  ui.divider({ char: "·" }),
                  ui.progress(selected.cpuPct / 100, {
                    label: "CPU",
                    variant: "bar",
                    showPercent: true,
                  }),
                  ui.progress(selected.memoryPct / 100, {
                    label: "Memory",
                    variant: "bar",
                    showPercent: true,
                  }),
                  ui.gauge((selected.saturation ?? 0) / 100, {
                    label: "Saturation",
                    variant: "compact",
                    thresholds: [
                      { value: 0.72, variant: "warning" },
                      { value: 0.9, variant: "error" },
                    ],
                  }),
                  ui.gauge(selectedErrorBudget, {
                    label: "Error budget burn",
                    variant: "compact",
                    thresholds: [
                      { value: 0.45, variant: "warning" },
                      { value: 0.75, variant: "error" },
                    ],
                  }),
                  ui.row({ gap: 1, items: "center" }, [
                    ui.text("P95 trend", { style: metaStyle }),
                    ui.sparkline(selected.history, {
                      width: SELECTED_HISTORY_WIDTH,
                      min: 0,
                      max: 240,
                    }),
                  ]),
                  ui.text(`Latency SLO utilization ${Math.round(selectedLatencyBudget * 100)}%`, {
                    style: quietStyle,
                  }),
                ])
              : ui.empty("No selected service", {
                  description: "Choose a row in Fleet Services to inspect details.",
                  icon: "status.question",
                }),
          ],
          3,
          panelStyle,
        ),

        panel(
          "Escalation Runbook",
          [
            ui.column({ gap: 1 }, [
              ui.row({ gap: 1, items: "center", wrap: true }, [
                ui.badge(fixedLabel(runbookPlan.title, 22, 22), { variant: runbookPlan.variant }),
                ui.tag(`Runbook ${selectedRunbook || "RB-000"}`, {
                  variant: runbookPlan.variant === "error" ? "error" : "info",
                }),
              ]),
              ui.text(runbookPlan.summary, {
                style: metaStyle,
                textOverflow: "ellipsis",
                maxWidth: 56,
              }),
              ui.divider({ char: "·" }),
              ui.text(`1 ${runbookPlan.step1}`, {
                style: metaStyle,
                textOverflow: "ellipsis",
                maxWidth: 60,
              }),
              ui.text(`2 ${runbookPlan.step2}`, {
                style: metaStyle,
                textOverflow: "ellipsis",
                maxWidth: 60,
              }),
              ui.text(`3 ${runbookPlan.step3}`, {
                style: metaStyle,
                textOverflow: "ellipsis",
                maxWidth: 60,
              }),
              ui.row({ gap: 1, items: "center", wrap: true }, [
                ui.text("Current fleet load", { style: metaStyle }),
                ui.miniChart(
                  [
                    { label: "CPU", value: avgCpu, max: 100 },
                    { label: "MEM", value: avgMem, max: 100 },
                    { label: "LAT", value: avgLatency, max: 220 },
                  ],
                  { variant: "pills" },
                ),
              ]),
            ]),
          ],
          2,
          panelStyle,
        ),
      ]),
    ]),

    panel(
      state.debug ? "Active Events + Debug" : "Active Events",
      [
        ui.column({ gap: 1 }, [
          ui.text("Newest events first. Feed updates continuously while stream is active.", {
            style: metaStyle,
          }),
          ...Array.from({ length: INCIDENT_VISIBLE_ROWS }, (_, index) => {
            const incident = state.incidents[index];
            if (!incident) return ui.text(" ", { style: quietStyle });
            const badge = incidentBadge(incident.severity);
            return ui.row({ key: `incident-row-${incident.id}`, gap: 1, items: "center" }, [
              ui.icon(incidentIcon(incident.severity)),
              ui.badge(incidentBadgeLabel(incident.severity), { variant: badge.variant }),
              ui.text(`[${incident.at}] ${incident.message}`, {
                textOverflow: "ellipsis",
                maxWidth: INCIDENT_TEXT_MAX_WIDTH,
              }),
            ]);
          }),
          state.debug
            ? ui.column({ gap: 1 }, [
                ui.divider({ char: "-" }),
                ui.callout("Render loop instrumentation", {
                  variant: "info",
                  title: "Debug Counters",
                }),
                ui.row({ gap: 2, items: "center", wrap: true }, [
                  ui.text(`Ticks ${state.ticks}`),
                  ui.text(`Applied ${state.updatesApplied}`),
                  ui.text(`Rate ${updateRate.toFixed(2)} Hz`),
                  ui.text(`Last update age ${stalenessMs} ms`),
                ]),
              ])
            : ui.text("Press d to open render/debug counters.", { style: quietStyle }),
        ]),
      ],
      1,
      panelStyle,
    ),

    ui.box({ border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: stripStyle }, [
      ui.column({ gap: 1 }, [
        ui.row({ justify: "between", items: "center", gap: 1 }, [
          ui.row({ gap: 1, items: "center" }, [
            ui.icon(state.paused ? "ui.pause" : "ui.play"),
            ui.text(state.paused ? "Live stream paused" : "Live stream active"),
            selected
              ? ui.tag(`Selected ${selectedLabel}`, {
                  variant:
                    selected.status === "down"
                      ? "error"
                      : selected.status === "warning"
                        ? "warning"
                        : "info",
                })
              : null,
          ]),
          ui.row({ gap: 1, items: "center" }, [
            ui.badge(`Filter ${filterBadgeLabel}`, {
              variant:
                state.filter === "all" ? "default" : state.filter === "down" ? "error" : "warning",
            }),
            ui.badge(`Sort ${sortBadgeLabel}`, { variant: "info" }),
            ui.badge(`${incidentCountLabel} events`, {
              variant: downCount > 0 ? "error" : warningCount > 0 ? "warning" : "success",
            }),
          ]),
        ]),
        ui.divider({ char: "·" }),
        ui.row({ gap: 1, items: "center" }, [
          ui.kbd(["up", "down"]),
          ui.text("select", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("f"),
          ui.text("filter", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("s"),
          ui.text("sort", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("o"),
          ui.text("order", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("t"),
          ui.text("theme", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("h"),
          ui.text("help", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd(["p", "space"]),
          ui.text("pause", { style: metaStyle }),
          ui.text("·", { style: quietStyle }),
          ui.kbd("q"),
          ui.text("quit", { style: metaStyle }),
        ]),
      ]),
    ]),
  ]);

  return ui.layers([
    mainContent,
    state.helpOpen
      ? ui.modal({
          id: "help-modal",
          title: `${PRODUCT_NAME} Commands`,
          width: 90,
          frameStyle: {
            background: palette.bg.elevated,
            foreground: palette.fg.primary,
            border: palette.border.default,
          },
          backdrop: "none",
          initialFocus: "help-close",
          returnFocusTo: "help",
          content: ui.column({ gap: 1 }, [
            ui.box({ border: "rounded", px: 1, py: 0, style: stripStyle }, [
              ui.column({ gap: 1 }, [
                ui.row({ gap: 1, items: "center", wrap: true }, [
                  ui.icon("status.info"),
                  ui.text("Keyboard + Mouse Controls", { style: sectionLabelStyle }),
                  ui.spacer({ flex: 1 }),
                  ui.text("Esc closes help", { style: quietStyle }),
                ]),
                ui.text(PRODUCT_MISSION, { style: metaStyle }),
              ]),
            ]),
            ui.divider({ char: "·" }),
            ui.column(
              { gap: 1 },
              HELP_SHORTCUTS.map((shortcut) =>
                helpShortcutRow(shortcut.keys, shortcut.description),
              ),
            ),
          ]),
          actions: [
            ui.button({
              id: "help-close",
              label: "Close (Esc)",
              onPress: closeHelpAction,
            }),
          ],
          onClose: closeHelpAction,
        })
      : null,
  ]);
});

let telemetryTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryRunning = false;
let telemetryNextAt = 0;

function clearTelemetryTimer(): void {
  if (telemetryTimer === null) return;
  clearTimeout(telemetryTimer);
  telemetryTimer = null;
}

function scheduleTelemetryTick(nowMs = Date.now()): void {
  if (!telemetryRunning) return;
  if (telemetryNextAt <= 0) telemetryNextAt = nowMs + TELEMETRY_CADENCE_MS;
  const delayMs = Math.max(0, telemetryNextAt - nowMs);
  telemetryTimer = setTimeout(runTelemetryTick, delayMs);
}

function runTelemetryTick(): void {
  if (!telemetryRunning) return;
  const nowMs = Date.now();
  if (telemetryNextAt <= 0) telemetryNextAt = nowMs;
  if (nowMs - telemetryNextAt > TELEMETRY_MAX_DRIFT_MS) {
    telemetryNextAt = nowMs;
  }
  telemetryNextAt += TELEMETRY_CADENCE_MS;
  app.update((state) => simulateTick(state, nowMs));
  scheduleTelemetryTick(nowMs);
}

function startTelemetryLoop(): void {
  if (telemetryRunning) return;
  telemetryRunning = true;
  telemetryNextAt = 0;
  scheduleTelemetryTick();
}

function stopTelemetryLoop(): void {
  telemetryRunning = false;
  telemetryNextAt = 0;
  clearTelemetryTimer();
}

let dashboardStopRequested = false;

function requestDashboardStop(): void {
  stopTelemetryLoop();
  if (dashboardStopRequested) return;
  dashboardStopRequested = true;

  // Defer app.stop() outside event/key handlers to avoid reentrant-stop fatals.
  setTimeout(() => {
    void app.stop();
  }, 0);
}

app.onEvent((ev) => {
  if (ev.kind === "engine") {
    const raw = ev.event;
    if (raw.kind === "resize") {
      startTelemetryLoop();
    }
    if (raw.kind === "key" && raw.action === "down") {
      // Fallback quit handling for terminals that deliver printable keys in
      // non-standard key paths/modifier combos.
      if (raw.key === 81 || raw.key === 113 || (raw.mods & 0b0010) !== 0) {
        if (raw.key === 81 || raw.key === 113 || raw.key === 67 || raw.key === 99) {
          requestDashboardStop();
        }
      }
    }
    if (raw.kind === "text" && raw.codepoint >= 0 && raw.codepoint <= 0x10ffff) {
      const ch = String.fromCodePoint(raw.codepoint).toLowerCase();
      if (ch === "q") requestDashboardStop();
    }
  }
  if (ev.kind === "fatal") stopTelemetryLoop();
});

app.keys({
  q: requestDashboardStop,
  "shift+q": requestDashboardStop,
  "ctrl+c": requestDashboardStop,
  up: (ctx) => {
    if (ctx.focusedId === "service-table") return;
    ctx.update((s) => moveSelection(s, -1));
  },
  down: (ctx) => {
    if (ctx.focusedId === "service-table") return;
    ctx.update((s) => moveSelection(s, 1));
  },
  k: () => app.update((s) => moveSelection(s, -1)),
  j: () => app.update((s) => moveSelection(s, 1)),
  f: cycleFilterAction,
  s: cycleSortAction,
  o: toggleSortDirectionAction,
  t: cycleThemeAction,
  p: togglePauseAction,
  space: togglePauseAction,
  enter: togglePinAction,
  d: toggleDebugAction,
  c: clearIncidentsAction,
  h: openHelpAction,
  escape: closeHelpAction,
});

try {
  await app.start();
} finally {
  stopTelemetryLoop();
}
