import type { Toast } from "@rezi-ui/core";

export type RouteId = "bridge" | "engineering" | "crew" | "comms" | "cargo" | "settings";

export type AlertLevel = "green" | "yellow" | "red";

export type ThemeName = "day" | "night" | "alert";

export type CrewMember = Readonly<{
  id: string;
  name: string;
  rank: "ensign" | "lieutenant" | "commander" | "captain";
  department: "bridge" | "engineering" | "medical" | "science" | "security";
  status: "active" | "off-duty" | "injured" | "away";
  efficiency: number;
}>;

export type Subsystem = Readonly<{
  id: string;
  name: string;
  parent: string | null;
  health: number;
  power: number;
  temperature: number;
}>;

export type CargoItem = Readonly<{
  id: string;
  name: string;
  category: "fuel" | "supplies" | "equipment" | "medical" | "ordnance";
  quantity: number;
  priority: number;
  bay: number;
}>;

export type CommsMessage = Readonly<{
  id: string;
  timestamp: number;
  channel: "fleet" | "local" | "emergency" | "internal";
  sender: string;
  content: string;
  priority: "routine" | "urgent" | "critical";
  acknowledged: boolean;
}>;

export type ShipToast = Readonly<{
  id: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  timestamp: number;
  durationMs: number;
}>;

export type TelemetrySnapshot = Readonly<{
  reactorPower: number;
  shieldStrength: number;
  hullIntegrity: number;
  warpFactor: number;
  fuelLevel: number;
  lifeSupportPct: number;
}>;

export type CrewEditorDraft = Readonly<{
  department: CrewMember["department"];
  status: CrewMember["status"];
}>;

export type CargoCategoryFilter = CargoItem["category"] | "all";

export type NotificationMode = "all" | "critical" | "none";

export type StarshipState = Readonly<{
  tick: number;
  nowMs: number;
  alertLevel: AlertLevel;
  themeName: ThemeName;
  showHelp: boolean;
  showCommandPalette: boolean;
  commandQuery: string;
  commandIndex: number;
  autopilot: boolean;
  paused: boolean;

  telemetry: TelemetrySnapshot;
  telemetryHistory: readonly number[];
  shieldHistory: readonly number[];

  crew: readonly CrewMember[];
  selectedCrewId: string | null;
  crewSearchQuery: string;
  editingCrew: boolean;
  crewLoading: boolean;
  crewPage: number;
  crewPageSize: number;
  crewDraft: CrewEditorDraft;

  subsystems: readonly Subsystem[];
  expandedSubsystemIds: readonly string[];
  engineeringDiagMode: boolean;
  boostActive: boolean;
  splitSizes: readonly number[];

  messages: readonly CommsMessage[];
  activeChannel: CommsMessage["channel"];
  showHailDialog: boolean;
  hailTarget: string;
  hailMessage: string;
  commsSearchQuery: string;
  commsScrollTop: number;
  expandedMessageIds: readonly string[];

  cargo: readonly CargoItem[];
  cargoScrollTop: number;
  cargoSortBy: "name" | "category" | "quantity" | "priority";
  cargoCategoryFilter: CargoCategoryFilter;
  selectedCargoId: string | null;
  cargoBulkChecked: boolean;

  shipName: string;
  alertThreshold: number;
  defaultChannel: CommsMessage["channel"];
  notificationsMode: NotificationMode;
  settingsNotes: string;
  showResetDialog: boolean;

  toasts: readonly ShipToast[];
}>;

export type StarshipAction =
  | Readonly<{ type: "tick"; nowMs: number }>
  | Readonly<{ type: "toggle-pause" }>
  | Readonly<{ type: "toggle-autopilot" }>
  | Readonly<{ type: "set-alert"; level: AlertLevel }>
  | Readonly<{ type: "toggle-red-alert" }>
  | Readonly<{ type: "cycle-theme" }>
  | Readonly<{ type: "set-theme"; theme: ThemeName }>
  | Readonly<{ type: "toggle-help" }>
  | Readonly<{ type: "toggle-command-palette" }>
  | Readonly<{ type: "set-command-query"; query: string }>
  | Readonly<{ type: "set-command-index"; index: number }>
  | Readonly<{ type: "apply-command"; commandId: string }>
  | Readonly<{ type: "select-crew"; crewId: string | null }>
  | Readonly<{ type: "set-crew-search"; query: string }>
  | Readonly<{ type: "toggle-crew-editor" }>
  | Readonly<{ type: "set-crew-loading"; loading: boolean }>
  | Readonly<{ type: "set-crew-page"; page: number }>
  | Readonly<{ type: "set-crew-draft-department"; department: CrewMember["department"] }>
  | Readonly<{ type: "set-crew-draft-status"; status: CrewMember["status"] }>
  | Readonly<{
      type: "assign-crew";
      crewId: string;
      department: CrewMember["department"];
      status: CrewMember["status"];
    }>
  | Readonly<{ type: "toggle-subsystem"; subsystemId: string }>
  | Readonly<{ type: "toggle-diagnostics" }>
  | Readonly<{ type: "toggle-boost" }>
  | Readonly<{ type: "set-split-sizes"; sizes: readonly number[] }>
  | Readonly<{ type: "switch-channel"; channel: CommsMessage["channel"] }>
  | Readonly<{ type: "set-comms-search"; query: string }>
  | Readonly<{ type: "set-comms-scroll"; scrollTop: number }>
  | Readonly<{ type: "toggle-message-expanded"; messageId: string; expanded: boolean }>
  | Readonly<{ type: "acknowledge-message"; messageId: string }>
  | Readonly<{ type: "toggle-hail-dialog" }>
  | Readonly<{ type: "set-hail-target"; target: string }>
  | Readonly<{ type: "set-hail-message"; message: string }>
  | Readonly<{ type: "send-hail"; target: string; message: string }>
  | Readonly<{ type: "set-cargo-scroll"; scrollTop: number }>
  | Readonly<{ type: "set-cargo-sort"; sortBy: StarshipState["cargoSortBy"] }>
  | Readonly<{ type: "set-cargo-category-filter"; category: CargoCategoryFilter }>
  | Readonly<{ type: "select-cargo"; cargoId: string | null }>
  | Readonly<{ type: "set-cargo-bulk-checked"; checked: boolean }>
  | Readonly<{ type: "set-cargo-priority"; cargoId: string; priority: number }>
  | Readonly<{ type: "set-ship-name"; name: string }>
  | Readonly<{ type: "set-alert-threshold"; threshold: number }>
  | Readonly<{ type: "set-default-channel"; channel: CommsMessage["channel"] }>
  | Readonly<{ type: "set-notifications-mode"; mode: NotificationMode }>
  | Readonly<{ type: "set-settings-notes"; notes: string }>
  | Readonly<{ type: "toggle-reset-dialog" }>
  | Readonly<{ type: "reset-settings" }>
  | Readonly<{ type: "add-message"; message: CommsMessage }>
  | Readonly<{ type: "add-toast"; toast: ShipToast }>
  | Readonly<{ type: "dismiss-toast"; toastId: string }>
  | Readonly<{ type: "prune-toasts"; nowMs: number }>;

export type RouteDeps = Readonly<{
  dispatch: (action: StarshipAction) => void;
  navigate: (routeId: RouteId) => void;
  routes: readonly Readonly<{ id: RouteId; title: string }>[];
  getBindings?: () => readonly import("@rezi-ui/core").RegisteredBinding[];
}>;

export function toCoreToast(toast: ShipToast): Toast {
  return {
    id: toast.id,
    message: toast.message,
    type: toast.level,
    duration: toast.durationMs,
  };
}
