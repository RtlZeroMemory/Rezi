import { DEFAULT_THEME_NAME, cycleThemeName } from "../theme.js";
import type {
  DashboardAction,
  DashboardState,
  Service,
  ServiceFilter,
  ServiceStatus,
} from "../types.js";

const FILTER_ORDER: readonly ServiceFilter[] = Object.freeze(["all", "warning", "down", "healthy"]);
const MAX_HISTORY = 18;

const SEED_SERVICES: readonly Service[] = Object.freeze([
  {
    id: "auth",
    name: "Auth Gateway",
    region: "us-east-1",
    owner: "Identity",
    status: "healthy",
    latencyMs: 23,
    errorRate: 0.2,
    trafficRpm: 14320,
    history: Object.freeze(Array.from({ length: MAX_HISTORY }, () => 23)),
  },
  {
    id: "billing",
    name: "Billing API",
    region: "us-west-2",
    owner: "Commerce",
    status: "warning",
    latencyMs: 83,
    errorRate: 1.1,
    trafficRpm: 7390,
    history: Object.freeze(Array.from({ length: MAX_HISTORY }, () => 83)),
  },
  {
    id: "search",
    name: "Search Index",
    region: "eu-central-1",
    owner: "Discovery",
    status: "healthy",
    latencyMs: 37,
    errorRate: 0.34,
    trafficRpm: 9880,
    history: Object.freeze(Array.from({ length: MAX_HISTORY }, () => 37)),
  },
  {
    id: "notify",
    name: "Notification Bus",
    region: "eu-west-1",
    owner: "Messaging",
    status: "healthy",
    latencyMs: 31,
    errorRate: 0.27,
    trafficRpm: 8120,
    history: Object.freeze(Array.from({ length: MAX_HISTORY }, () => 31)),
  },
  {
    id: "exports",
    name: "Export Workers",
    region: "us-east-1",
    owner: "Data Platform",
    status: "down",
    latencyMs: 152,
    errorRate: 4.4,
    trafficRpm: 810,
    history: Object.freeze(Array.from({ length: MAX_HISTORY }, () => 152)),
  },
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nextFilter(current: ServiceFilter): ServiceFilter {
  const index = FILTER_ORDER.indexOf(current);
  const next = index < 0 ? 0 : (index + 1) % FILTER_ORDER.length;
  return FILTER_ORDER[next] ?? "all";
}

function deriveStatus(latencyMs: number, errorRate: number): ServiceStatus {
  if (latencyMs >= 130 || errorRate >= 3.2) return "down";
  if (latencyMs >= 78 || errorRate >= 1.0) return "warning";
  return "healthy";
}

function evolveService(service: Service, index: number, nextTick: number): Service {
  const phase = nextTick * 0.28 + index * 0.91;
  const latency = clamp(
    Math.round(service.latencyMs + Math.sin(phase) * 8 + Math.cos(phase * 0.66) * 6),
    12,
    220,
  );
  const errorRate = round2(clamp(service.errorRate + Math.sin(phase * 0.73) * 0.15, 0.03, 6.4));
  const trafficRpm = clamp(
    Math.round(service.trafficRpm + Math.sin(phase) * 420 + Math.cos(phase * 0.33) * 220),
    400,
    26000,
  );
  const status = deriveStatus(latency, errorRate);

  return {
    ...service,
    latencyMs: latency,
    errorRate,
    trafficRpm,
    status,
    history: Object.freeze([...service.history, latency].slice(-MAX_HISTORY)),
  };
}

function resolveSelectedId(state: DashboardState): string {
  const visible = visibleServices(state);
  if (visible.length === 0) return "";
  if (visible.some((service) => service.id === state.selectedId)) return state.selectedId;
  return visible[0]?.id ?? "";
}

export function createInitialState(nowMs = Date.now()): DashboardState {
  return {
    services: SEED_SERVICES,
    selectedId:
      SEED_SERVICES.find((service) => service.status !== "healthy")?.id ??
      SEED_SERVICES[0]?.id ??
      "",
    filter: "all",
    paused: false,
    showHelp: false,
    themeName: DEFAULT_THEME_NAME,
    tick: 0,
    startedAtMs: nowMs,
    lastUpdatedMs: nowMs,
  };
}

export function visibleServices(state: DashboardState): readonly Service[] {
  if (state.filter === "all") return state.services;
  return state.services.filter((service) => service.status === state.filter);
}

export function selectedService(state: DashboardState): Service | undefined {
  const visible = visibleServices(state);
  return visible.find((service) => service.id === state.selectedId) ?? visible[0];
}

export function reduceDashboardState(
  state: DashboardState,
  action: DashboardAction,
): DashboardState {
  if (action.type === "toggle-pause") {
    return { ...state, paused: !state.paused };
  }

  if (action.type === "toggle-help") {
    return { ...state, showHelp: !state.showHelp };
  }

  if (action.type === "cycle-filter") {
    const next = { ...state, filter: nextFilter(state.filter) };
    return { ...next, selectedId: resolveSelectedId(next) };
  }

  if (action.type === "cycle-theme") {
    return { ...state, themeName: cycleThemeName(state.themeName) };
  }

  if (action.type === "set-selected-id") {
    if (!state.services.some((service) => service.id === action.serviceId)) return state;
    return { ...state, selectedId: action.serviceId };
  }

  if (action.type === "move-selection") {
    const visible = visibleServices(state);
    if (visible.length === 0) return state;
    const current = visible.findIndex((service) => service.id === state.selectedId);
    const from = current < 0 ? 0 : current;
    const next = clamp(from + action.delta, 0, visible.length - 1);
    const selected = visible[next];
    return selected ? { ...state, selectedId: selected.id } : state;
  }

  if (action.type === "tick") {
    if (state.paused) {
      return { ...state, lastUpdatedMs: action.nowMs };
    }
    const nextTick = state.tick + 1;
    const services = state.services.map((service, index) =>
      evolveService(service, index, nextTick),
    );
    const next = {
      ...state,
      services,
      tick: nextTick,
      lastUpdatedMs: action.nowMs,
    };
    return { ...next, selectedId: resolveSelectedId(next) };
  }

  return state;
}
