import { cycleThemeName } from "../theme.js";
import type {
  AlertLevel,
  CargoItem,
  CommsMessage,
  CrewMember,
  ShipToast,
  StarshipAction,
  StarshipState,
  Subsystem,
  TelemetrySnapshot,
} from "../types.js";
import { generateToast, seedCargo, seedCrew, seedMessages, seedSubsystems } from "./simulation.js";

const TELEMETRY_HISTORY_LIMIT = 60;
const COMMS_LIMIT = 220;
const TOAST_LIMIT = 8;

export type SubsystemTreeNode = Readonly<{
  node: Subsystem;
  children: readonly SubsystemTreeNode[];
}>;

export type SystemHealth = Readonly<{
  average: number;
  minimum: number;
  warningCount: number;
}>;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function freezeTelemetry(telemetry: TelemetrySnapshot): TelemetrySnapshot {
  return Object.freeze({ ...telemetry });
}

function freezeState(state: StarshipState): StarshipState {
  return Object.freeze(state);
}

function pushHistory(history: readonly number[], value: number, limit: number): readonly number[] {
  const next = [...history, value];
  if (next.length > limit) {
    next.splice(0, next.length - limit);
  }
  return Object.freeze(next);
}

function withToast(state: StarshipState, toast: ShipToast): readonly ShipToast[] {
  const withoutExisting = state.toasts.filter((item) => item.id !== toast.id);
  const next = [...withoutExisting, Object.freeze({ ...toast })];
  if (next.length > TOAST_LIMIT) {
    next.splice(0, next.length - TOAST_LIMIT);
  }
  return Object.freeze(next);
}

function alertFactor(level: AlertLevel): number {
  if (level === "green") return 0;
  if (level === "yellow") return 1;
  return 2;
}

export function evolveTelemetry(state: StarshipState, tick: number): TelemetrySnapshot {
  const phase = tick * 0.11;
  const alert = alertFactor(state.alertLevel);
  const boost = state.boostActive ? 1 : 0;
  const autopilot = state.autopilot ? 1 : 0;

  const reactorPower = clampInt(
    72 + Math.sin(phase * 0.9) * 12 + Math.cos(phase * 0.27) * 8 + alert * 4 + boost * 9,
    35,
    100,
  );

  const shieldStrength = clampInt(
    88 + Math.sin(phase * 0.71 + 0.8) * 9 - alert * 5 + noise(tick * 7 + 3) * 4,
    22,
    100,
  );

  const hullIntegrity = clampInt(97 + Math.sin(phase * 0.18) * 1.8 - alert * 0.9, 70, 100);

  const warpFactor = clamp(
    2.4 + Math.sin(phase * 0.43) * 0.9 + autopilot * 0.55 + boost * 0.38 + alert * 0.16,
    0.2,
    9.6,
  );

  const fuelLevel = clampInt(
    Math.max(
      16,
      state.telemetry.fuelLevel - (state.paused ? 0 : 0.06 + autopilot * 0.05 + boost * 0.08),
    ),
    0,
    100,
  );

  const lifeSupportPct = clampInt(94 + Math.cos(phase * 0.22 + 1.5) * 3.1 - alert * 0.6, 68, 100);

  return Object.freeze({
    reactorPower,
    shieldStrength,
    hullIntegrity,
    warpFactor,
    fuelLevel,
    lifeSupportPct,
  });
}

export function generateCommsMessage(tick: number, nowMs = Date.now()): CommsMessage | null {
  if (tick <= 0 || tick % 4 !== 0) return null;
  const emissionIndex = Math.floor(tick / 4);

  const channels: readonly CommsMessage["channel"][] = ["fleet", "local", "internal", "emergency"];
  const priorities: readonly CommsMessage["priority"][] = [
    "routine",
    "routine",
    "urgent",
    "critical",
  ];
  const senders = [
    "Fleet Command",
    "USS Meridian",
    "Outpost Vega",
    "Cargo Shuttle Arc",
    "Medical Frigate Solace",
    "Engineering Relay",
  ] as const;
  const contents = [
    "Navigation lane synchronized",
    "Requesting cargo status package",
    "Sensor anomaly resolved",
    "Routine convoy escort complete",
    "Prioritized distress channel check",
    "Engineering calibration update",
  ] as const;

  const channel = channels[(emissionIndex + 1) % channels.length] ?? "fleet";
  const priority = priorities[(emissionIndex * 2 + 1) % priorities.length] ?? "routine";
  const sender = senders[(emissionIndex * 5 + 2) % senders.length] ?? "Fleet Command";
  const content = `${contents[(emissionIndex * 3 + 1) % contents.length] ?? "Status update"} · t${tick}`;

  return Object.freeze({
    id: `tick-msg-${String(tick).padStart(5, "0")}`,
    timestamp: nowMs,
    channel,
    sender,
    content,
    priority,
    acknowledged: false,
  });
}

function defaultTelemetry(): TelemetrySnapshot {
  return Object.freeze({
    reactorPower: 74,
    shieldStrength: 89,
    hullIntegrity: 99,
    warpFactor: 2.4,
    fuelLevel: 86,
    lifeSupportPct: 96,
  });
}

export function createInitialState(nowMs = Date.now()): StarshipState {
  const telemetry = defaultTelemetry();
  const telemetryHistory = Object.freeze(
    Array.from({ length: TELEMETRY_HISTORY_LIMIT }, (_, index) =>
      clampInt(72 + Math.sin(index * 0.35) * 8 + Math.cos(index * 0.11) * 6, 40, 100),
    ),
  );
  const shieldHistory = Object.freeze(
    Array.from({ length: TELEMETRY_HISTORY_LIMIT }, (_, index) =>
      clampInt(85 + Math.sin(index * 0.28 + 0.6) * 7, 20, 100),
    ),
  );

  const crew = seedCrew(220);
  const selectedCrewId = crew[0]?.id ?? null;
  const selectedCrew = crew[0];

  return freezeState({
    tick: 0,
    nowMs,
    alertLevel: "green",
    themeName: "day",
    showHelp: false,
    showCommandPalette: false,
    commandQuery: "",
    commandIndex: 0,
    autopilot: true,
    paused: false,

    telemetry,
    telemetryHistory,
    shieldHistory,

    crew,
    selectedCrewId,
    crewSearchQuery: "",
    editingCrew: false,
    crewLoading: false,
    crewPage: 1,
    crewPageSize: 25,
    crewDraft: Object.freeze({
      department: selectedCrew?.department ?? "bridge",
      status: selectedCrew?.status ?? "active",
    }),

    subsystems: seedSubsystems(),
    expandedSubsystemIds: Object.freeze(["propulsion", "weapons", "shields", "life-support"]),
    engineeringDiagMode: false,
    boostActive: false,
    splitSizes: Object.freeze([42, 58]),

    messages: seedMessages(20),
    activeChannel: "fleet",
    showHailDialog: false,
    hailTarget: "",
    hailMessage: "",
    commsSearchQuery: "",
    commsScrollTop: 0,
    expandedMessageIds: Object.freeze([]),

    cargo: seedCargo(1_000),
    cargoScrollTop: 0,
    cargoSortBy: "priority",
    cargoCategoryFilter: "all",
    selectedCargoId: null,
    cargoBulkChecked: false,

    shipName: "USS Rezi",
    alertThreshold: 72,
    defaultChannel: "fleet",
    notificationsMode: "critical",
    settingsNotes: "",
    showResetDialog: false,

    toasts: Object.freeze([]),
  });
}

function toggleExpanded(expanded: readonly string[], key: string): readonly string[] {
  if (expanded.includes(key)) {
    return Object.freeze(expanded.filter((item) => item !== key));
  }
  return Object.freeze([...expanded, key]);
}

function toggleMessageExpanded(
  expanded: readonly string[],
  messageId: string,
  isExpanded: boolean,
): readonly string[] {
  if (isExpanded) {
    if (expanded.includes(messageId)) return expanded;
    return Object.freeze([...expanded, messageId]);
  }
  return Object.freeze(expanded.filter((item) => item !== messageId));
}

function withCrewDraftForSelection(state: StarshipState, crewId: string | null): StarshipState {
  const selected = state.crew.find((member) => member.id === crewId) ?? null;
  return freezeState({
    ...state,
    selectedCrewId: crewId,
    crewDraft: Object.freeze({
      department: selected?.department ?? state.crewDraft.department,
      status: selected?.status ?? state.crewDraft.status,
    }),
  });
}

function updateMessages(
  messages: readonly CommsMessage[],
  updater: (message: CommsMessage) => CommsMessage,
): readonly CommsMessage[] {
  return Object.freeze(messages.map((message) => Object.freeze(updater(message))));
}

function clampSizes(sizes: readonly number[]): readonly number[] {
  const normalized = sizes.map((value) => clampInt(value, 10, 90));
  if (normalized.length < 2) return Object.freeze([45, 55]);
  const left = normalized[0] ?? 45;
  const right = normalized[1] ?? 55;
  const total = left + right;
  if (total <= 0) return Object.freeze([45, 55]);
  const first = clampInt((left / total) * 100, 10, 90);
  const second = clampInt(100 - first, 10, 90);
  return Object.freeze([first, second]);
}

function applyCommand(state: StarshipState, commandId: string): StarshipState {
  if (commandId === "cmd-red-alert") {
    const level: AlertLevel = state.alertLevel === "red" ? "yellow" : "red";
    return freezeState({ ...state, alertLevel: level, showCommandPalette: false });
  }
  if (commandId === "cmd-theme") {
    return freezeState({
      ...state,
      themeName: cycleThemeName(state.themeName),
      showCommandPalette: false,
    });
  }
  if (commandId === "cmd-autopilot") {
    return freezeState({ ...state, autopilot: !state.autopilot, showCommandPalette: false });
  }
  if (commandId === "cmd-hail") {
    return freezeState({ ...state, showHailDialog: true, showCommandPalette: false });
  }
  return freezeState({ ...state, showCommandPalette: false });
}

export function reduceStarshipState(state: StarshipState, action: StarshipAction): StarshipState {
  if (action.type === "tick") {
    const tick = state.tick + 1;
    const telemetry = state.paused ? state.telemetry : evolveTelemetry(state, tick);
    const telemetryHistory = state.paused
      ? state.telemetryHistory
      : pushHistory(state.telemetryHistory, telemetry.reactorPower, TELEMETRY_HISTORY_LIMIT);
    const shieldHistory = state.paused
      ? state.shieldHistory
      : pushHistory(state.shieldHistory, telemetry.shieldStrength, TELEMETRY_HISTORY_LIMIT);

    let messages = state.messages;
    const generated = state.paused ? null : generateCommsMessage(tick, action.nowMs);
    if (generated) {
      messages = Object.freeze([...state.messages, generated].slice(-COMMS_LIMIT));
    }

    let toasts = state.toasts;
    const generatedToast = state.paused ? null : generateToast(tick, state);
    if (generatedToast) {
      toasts = withToast(state, generatedToast);
    }

    return freezeState({
      ...state,
      tick,
      nowMs: action.nowMs,
      telemetry: freezeTelemetry(telemetry),
      telemetryHistory,
      shieldHistory,
      messages,
      toasts,
    });
  }

  if (action.type === "toggle-pause") {
    return freezeState({ ...state, paused: !state.paused });
  }

  if (action.type === "toggle-autopilot") {
    return freezeState({ ...state, autopilot: !state.autopilot });
  }

  if (action.type === "set-alert") {
    return freezeState({ ...state, alertLevel: action.level });
  }

  if (action.type === "toggle-red-alert") {
    const level: AlertLevel = state.alertLevel === "red" ? "yellow" : "red";
    return freezeState({ ...state, alertLevel: level });
  }

  if (action.type === "cycle-theme") {
    return freezeState({ ...state, themeName: cycleThemeName(state.themeName) });
  }

  if (action.type === "set-theme") {
    return freezeState({ ...state, themeName: action.theme });
  }

  if (action.type === "toggle-help") {
    return freezeState({ ...state, showHelp: !state.showHelp });
  }

  if (action.type === "toggle-command-palette") {
    return freezeState({
      ...state,
      showCommandPalette: !state.showCommandPalette,
      commandQuery: state.showCommandPalette ? "" : state.commandQuery,
    });
  }

  if (action.type === "set-command-query") {
    return freezeState({ ...state, commandQuery: action.query, commandIndex: 0 });
  }

  if (action.type === "set-command-index") {
    return freezeState({ ...state, commandIndex: Math.max(0, action.index) });
  }

  if (action.type === "apply-command") {
    return applyCommand(state, action.commandId);
  }

  if (action.type === "select-crew") {
    return withCrewDraftForSelection(state, action.crewId);
  }

  if (action.type === "set-crew-search") {
    return freezeState({ ...state, crewSearchQuery: action.query, crewPage: 1 });
  }

  if (action.type === "toggle-crew-editor") {
    return freezeState({ ...state, editingCrew: !state.editingCrew });
  }

  if (action.type === "set-crew-loading") {
    return freezeState({ ...state, crewLoading: action.loading });
  }

  if (action.type === "set-crew-page") {
    return freezeState({ ...state, crewPage: Math.max(1, action.page) });
  }

  if (action.type === "set-crew-draft-department") {
    return freezeState({
      ...state,
      crewDraft: Object.freeze({ ...state.crewDraft, department: action.department }),
    });
  }

  if (action.type === "set-crew-draft-status") {
    return freezeState({
      ...state,
      crewDraft: Object.freeze({ ...state.crewDraft, status: action.status }),
    });
  }

  if (action.type === "assign-crew") {
    const crew = Object.freeze(
      state.crew.map((member) => {
        if (member.id !== action.crewId) return member;
        return Object.freeze({
          ...member,
          department: action.department,
          status: action.status,
        });
      }),
    );
    return freezeState({ ...state, crew, editingCrew: false });
  }

  if (action.type === "toggle-subsystem") {
    return freezeState({
      ...state,
      expandedSubsystemIds: toggleExpanded(state.expandedSubsystemIds, action.subsystemId),
    });
  }

  if (action.type === "toggle-diagnostics") {
    return freezeState({ ...state, engineeringDiagMode: !state.engineeringDiagMode });
  }

  if (action.type === "toggle-boost") {
    return freezeState({ ...state, boostActive: !state.boostActive });
  }

  if (action.type === "set-split-sizes") {
    return freezeState({ ...state, splitSizes: clampSizes(action.sizes) });
  }

  if (action.type === "switch-channel") {
    return freezeState({ ...state, activeChannel: action.channel });
  }

  if (action.type === "set-comms-search") {
    return freezeState({ ...state, commsSearchQuery: action.query });
  }

  if (action.type === "set-comms-scroll") {
    return freezeState({ ...state, commsScrollTop: Math.max(0, Math.floor(action.scrollTop)) });
  }

  if (action.type === "toggle-message-expanded") {
    return freezeState({
      ...state,
      expandedMessageIds: toggleMessageExpanded(
        state.expandedMessageIds,
        action.messageId,
        action.expanded,
      ),
    });
  }

  if (action.type === "acknowledge-message") {
    return freezeState({
      ...state,
      messages: updateMessages(state.messages, (message) =>
        message.id === action.messageId ? { ...message, acknowledged: true } : message,
      ),
    });
  }

  if (action.type === "toggle-hail-dialog") {
    return freezeState({ ...state, showHailDialog: !state.showHailDialog });
  }

  if (action.type === "set-hail-target") {
    return freezeState({ ...state, hailTarget: action.target });
  }

  if (action.type === "set-hail-message") {
    return freezeState({ ...state, hailMessage: action.message });
  }

  if (action.type === "send-hail") {
    const message: CommsMessage = Object.freeze({
      id: `hail-${state.tick}-${action.target.replace(/\s+/g, "-").toLowerCase()}`,
      timestamp: state.nowMs,
      channel: "fleet",
      sender: state.shipName,
      content: `Hail to ${action.target}: ${action.message}`,
      priority: "urgent",
      acknowledged: true,
    });
    return freezeState({
      ...state,
      showHailDialog: false,
      hailTarget: "",
      hailMessage: "",
      messages: Object.freeze([...state.messages, message].slice(-COMMS_LIMIT)),
      toasts: withToast(
        state,
        Object.freeze({
          id: `hail-toast-${state.tick}`,
          message: `Hail transmitted to ${action.target}`,
          level: "success",
          timestamp: state.nowMs,
          durationMs: 3_500,
        }),
      ),
    });
  }

  if (action.type === "set-cargo-scroll") {
    return freezeState({ ...state, cargoScrollTop: Math.max(0, Math.floor(action.scrollTop)) });
  }

  if (action.type === "set-cargo-sort") {
    return freezeState({ ...state, cargoSortBy: action.sortBy });
  }

  if (action.type === "set-cargo-category-filter") {
    return freezeState({ ...state, cargoCategoryFilter: action.category });
  }

  if (action.type === "select-cargo") {
    return freezeState({ ...state, selectedCargoId: action.cargoId });
  }

  if (action.type === "set-cargo-bulk-checked") {
    return freezeState({ ...state, cargoBulkChecked: action.checked });
  }

  if (action.type === "set-cargo-priority") {
    const cargo = Object.freeze(
      state.cargo.map((item) => {
        if (item.id !== action.cargoId) return item;
        return Object.freeze({ ...item, priority: clampInt(action.priority, 1, 5) });
      }),
    );
    return freezeState({ ...state, cargo });
  }

  if (action.type === "set-ship-name") {
    return freezeState({ ...state, shipName: action.name.slice(0, 30) });
  }

  if (action.type === "set-alert-threshold") {
    return freezeState({ ...state, alertThreshold: clampInt(action.threshold, 20, 95) });
  }

  if (action.type === "set-default-channel") {
    return freezeState({ ...state, defaultChannel: action.channel });
  }

  if (action.type === "set-notifications-mode") {
    return freezeState({ ...state, notificationsMode: action.mode });
  }

  if (action.type === "set-settings-notes") {
    return freezeState({ ...state, settingsNotes: action.notes });
  }

  if (action.type === "toggle-reset-dialog") {
    return freezeState({ ...state, showResetDialog: !state.showResetDialog });
  }

  if (action.type === "reset-settings") {
    return freezeState({
      ...state,
      shipName: "USS Rezi",
      alertThreshold: 72,
      defaultChannel: "fleet",
      notificationsMode: "critical",
      settingsNotes: "",
      showResetDialog: false,
    });
  }

  if (action.type === "add-message") {
    return freezeState({
      ...state,
      messages: Object.freeze(
        [...state.messages, Object.freeze({ ...action.message })].slice(-COMMS_LIMIT),
      ),
    });
  }

  if (action.type === "add-toast") {
    return freezeState({ ...state, toasts: withToast(state, action.toast) });
  }

  if (action.type === "dismiss-toast") {
    return freezeState({
      ...state,
      toasts: Object.freeze(state.toasts.filter((toast) => toast.id !== action.toastId)),
    });
  }

  if (action.type === "prune-toasts") {
    return freezeState({
      ...state,
      toasts: Object.freeze(
        state.toasts.filter((toast) => action.nowMs - toast.timestamp < toast.durationMs),
      ),
    });
  }

  return state;
}

export function visibleCrew(state: StarshipState): readonly CrewMember[] {
  const query = state.crewSearchQuery.trim().toLowerCase();
  if (!query) return state.crew;
  return Object.freeze(
    state.crew.filter((member) => {
      const haystack = `${member.name} ${member.department} ${member.rank}`.toLowerCase();
      return haystack.includes(query);
    }),
  );
}

export function selectedCrew(state: StarshipState): CrewMember | null {
  if (!state.selectedCrewId) return null;
  return state.crew.find((member) => member.id === state.selectedCrewId) ?? null;
}

export function filteredMessages(state: StarshipState): readonly CommsMessage[] {
  const query = state.commsSearchQuery.trim().toLowerCase();
  return Object.freeze(
    state.messages.filter((message) => {
      if (message.channel !== state.activeChannel) return false;
      if (!query) return true;
      const haystack = `${message.sender} ${message.content} ${message.priority}`.toLowerCase();
      return haystack.includes(query);
    }),
  );
}

export function sortedCargo(state: StarshipState): readonly CargoItem[] {
  const filtered =
    state.cargoCategoryFilter === "all"
      ? [...state.cargo]
      : state.cargo.filter((item) => item.category === state.cargoCategoryFilter);

  filtered.sort((left, right) => {
    if (state.cargoSortBy === "name") return left.name.localeCompare(right.name);
    if (state.cargoSortBy === "category") return left.category.localeCompare(right.category);
    if (state.cargoSortBy === "quantity") return right.quantity - left.quantity;
    return right.priority - left.priority;
  });

  return Object.freeze(filtered);
}

export function subsystemTree(state: StarshipState): readonly SubsystemTreeNode[] {
  const byParent = new Map<string | null, Subsystem[]>();
  for (const subsystem of state.subsystems) {
    const list = byParent.get(subsystem.parent) ?? [];
    list.push(subsystem);
    byParent.set(subsystem.parent, list);
  }

  const build = (parent: string | null): readonly SubsystemTreeNode[] => {
    const children = byParent.get(parent) ?? [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    return Object.freeze(
      children.map((node) =>
        Object.freeze({
          node,
          children: build(node.id),
        }),
      ),
    );
  };

  return build(null);
}

export function systemHealth(state: StarshipState): SystemHealth {
  if (state.subsystems.length === 0) {
    return Object.freeze({ average: 0, minimum: 0, warningCount: 0 });
  }

  let total = 0;
  let minimum = 100;
  let warningCount = 0;

  for (const subsystem of state.subsystems) {
    total += subsystem.health;
    minimum = Math.min(minimum, subsystem.health);
    if (subsystem.health < state.alertThreshold) warningCount += 1;
  }

  return Object.freeze({
    average: clampInt(total / state.subsystems.length, 0, 100),
    minimum,
    warningCount,
  });
}
