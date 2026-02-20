import { exit } from "node:process";
import type {
  BadgeVariant,
  LogEntry,
  RouteDefinition,
  RouteRenderContext,
  RouterApi,
  TextStyle,
  ThemeDefinition,
  VNode,
} from "@rezi-ui/core";
import { createApp, darkTheme, lightTheme, nordTheme, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type ThemeName = "nord" | "dark" | "light";
type EnvironmentName = "development" | "staging" | "production";
type TopLevelRouteId = "home" | "logs" | "settings";

type AppState = {
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
  commandTimeoutSec: number;
  viewportCols: number;
  viewportRows: number;
};

const PRODUCT_NAME = "__APP_NAME__";
const PRODUCT_TAGLINE = "Task-oriented multi-screen workflow with first-party routing";
const UI_FPS_CAP = 30;
const PANEL_PADDING_X = 1;
const PANEL_PADDING_Y = 0;
const LOG_SEED_COUNT = 24;
const LOG_HISTORY_LIMIT = 200;
const LOG_TICK_MS = 900;
const STACKED_LAYOUT_COLS = 118;
const COMPACT_LAYOUT_COLS = 96;
const COMPACT_LAYOUT_ROWS = 28;
const HISTORY_MAX_ITEMS_COMPACT = 5;
const HISTORY_MAX_ITEMS_DEFAULT = 9;

const THEME_BY_NAME: Record<ThemeName, ThemeDefinition> = {
  nord: nordTheme,
  dark: darkTheme,
  light: lightTheme,
};

const LOG_MESSAGES: readonly string[] = Object.freeze([
  "Indexed 14 workspace files",
  "Loaded plugin metadata",
  "Synced runtime configuration",
  "Queued incremental diagnostics",
  "Completed background health check",
  "Applied command palette cache",
]);

const LOG_SOURCES: readonly string[] = Object.freeze([
  "core",
  "scheduler",
  "file-watcher",
  "runtime",
]);

const LOG_LEVELS: readonly LogEntry["level"][] = Object.freeze(["info", "warn", "error", "debug"]);

const ENV_OPTIONS: readonly Readonly<{ value: EnvironmentName; label: string }>[] = Object.freeze([
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
]);

const THEME_OPTIONS: readonly Readonly<{ value: ThemeName; label: string }>[] = Object.freeze([
  { value: "nord", label: "Nord" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
]);

type ViewStyles = Readonly<{
  rootStyle: TextStyle;
  panelStyle: TextStyle;
  stripStyle: TextStyle;
  sectionLabelStyle: TextStyle;
  metaStyle: TextStyle;
  quietStyle: TextStyle;
}>;

function themeLabel(themeName: ThemeName): string {
  return THEME_OPTIONS.find((option) => option.value === themeName)?.label ?? themeName;
}

function themeBadgeVariant(themeName: ThemeName): BadgeVariant {
  if (themeName === "light") return "success";
  if (themeName === "dark") return "default";
  return "info";
}

function environmentBadgeVariant(environment: EnvironmentName): BadgeVariant {
  if (environment === "production") return "warning";
  if (environment === "staging") return "info";
  return "success";
}

function levelBadgeVariant(level: LogEntry["level"]): BadgeVariant {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  if (level === "debug") return "info";
  return "default";
}

function getViewStyles(themeName: ThemeName): ViewStyles {
  const colors = THEME_BY_NAME[themeName].colors;
  return Object.freeze({
    rootStyle: { bg: colors.bg.base, fg: colors.fg.primary },
    panelStyle: { bg: colors.bg.elevated, fg: colors.fg.primary },
    stripStyle: { bg: colors.bg.subtle, fg: colors.fg.primary },
    sectionLabelStyle: { fg: colors.fg.secondary, bold: true },
    metaStyle: { fg: colors.fg.secondary, dim: true },
    quietStyle: { fg: colors.fg.muted, dim: true },
  });
}

function panel(
  title: string,
  children: readonly VNode[],
  style: TextStyle,
  opts: Readonly<{ flex?: number; minWidth?: number }> = Object.freeze({}),
): VNode {
  return ui.box(
    {
      title,
      border: "rounded",
      px: PANEL_PADDING_X,
      py: PANEL_PADDING_Y,
      style,
      ...(opts.flex === undefined ? {} : { flex: opts.flex }),
      ...(opts.minWidth === undefined ? {} : { minWidth: opts.minWidth }),
    },
    children,
  );
}

function applyTheme(context: RouteRenderContext<AppState>, themeName: ThemeName): void {
  context.update((prev) => Object.freeze({ ...prev, themeName }));
  app.setTheme(THEME_BY_NAME[themeName]);
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", { hour12: false });
}

function isThemeName(value: string): value is ThemeName {
  return value === "nord" || value === "dark" || value === "light";
}

function isEnvironment(value: string): value is EnvironmentName {
  return value === "development" || value === "staging" || value === "production";
}

function routeLabelFromId(routeId: string): string {
  if (routeId === "home") return "Home";
  if (routeId === "logs") return "Logs";
  if (routeId === "settings") return "Settings";
  if (routeId === "detail") return "Detail";
  return routeId[0] ? routeId[0].toUpperCase() + routeId.slice(1) : routeId;
}

function trimMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  const sideWidth = Math.max(1, Math.floor((maxChars - 1) / 2));
  return `${value.slice(0, sideWidth)}…${value.slice(value.length - sideWidth)}`;
}

function formatHistoryTrail(
  router: RouterApi,
  viewportCols: number,
  compact: boolean,
): Readonly<{ summary: string; count: number }> {
  const entries = router.history();
  const labels: string[] = [];
  for (const entry of entries) {
    const label = routeLabelFromId(entry.id);
    if (labels[labels.length - 1] === label) continue;
    labels.push(label);
  }
  const maxItems = compact ? HISTORY_MAX_ITEMS_COMPACT : HISTORY_MAX_ITEMS_DEFAULT;
  const tail = labels.slice(-maxItems);
  const prefix = labels.length > tail.length ? ["…"] : [];
  const text = [...prefix, ...tail].join(" > ");
  const maxChars = Math.max(24, viewportCols - 20);
  return Object.freeze({
    summary: trimMiddle(text, maxChars),
    count: entries.length,
  });
}

function navigateTopLevel(router: RouterApi, routeId: TopLevelRouteId): void {
  const current = router.currentRoute();
  if (current.id === routeId) return;
  if (current.id === "detail") {
    router.navigate(routeId);
    return;
  }
  router.replace(routeId);
}

function isStackedLayout(state: Readonly<AppState>): boolean {
  return state.viewportCols < STACKED_LAYOUT_COLS;
}

function isCompactLayout(state: Readonly<AppState>): boolean {
  return state.viewportCols < COMPACT_LAYOUT_COLS || state.viewportRows < COMPACT_LAYOUT_ROWS;
}

function buildLogEntry(
  tick: number,
  environment: EnvironmentName,
  includeDebug: boolean,
  timestamp = Date.now(),
): LogEntry {
  const source = LOG_SOURCES[tick % LOG_SOURCES.length] ?? "core";
  const message = LOG_MESSAGES[tick % LOG_MESSAGES.length] ?? "Updated background task";
  const baseLevel = LOG_LEVELS[tick % LOG_LEVELS.length] ?? "info";
  const level = includeDebug || baseLevel !== "debug" ? baseLevel : "info";

  return Object.freeze({
    id: `log-${String(tick)}`,
    timestamp,
    level,
    source,
    message: `${message} (${environment})`,
    details:
      `tick=${String(tick)}\n` +
      `environment=${environment}\n` +
      `source=${source}\n` +
      `level=${level}`,
  });
}

function initialLogs(
  seedCount = LOG_SEED_COUNT,
  environment: EnvironmentName = "staging",
): readonly LogEntry[] {
  const nowMs = Date.now();
  const seed: LogEntry[] = [];
  for (let i = 0; i < seedCount; i++) {
    const tick = i + 1;
    const timestamp = nowMs - (seedCount - tick) * 1200;
    seed.push(buildLogEntry(tick, environment, true, timestamp));
  }
  return Object.freeze(seed);
}

function appendTickLog(prev: Readonly<AppState>): AppState {
  const nextTick = prev.tick + 1;
  const nextEntry = buildLogEntry(nextTick, prev.environment, prev.includeDebug);
  const nextLogs = Object.freeze([...prev.logs, nextEntry].slice(-LOG_HISTORY_LIMIT));
  const nextExpanded = Object.freeze(
    prev.expandedLogIds.filter((entryId) => nextLogs.some((entry) => entry.id === entryId)),
  );

  return Object.freeze({
    ...prev,
    nowMs: Date.now(),
    tick: nextTick,
    logs: nextLogs,
    expandedLogIds: nextExpanded,
  });
}

function updateExpanded(
  previous: readonly string[],
  entryId: string,
  expanded: boolean,
): readonly string[] {
  if (expanded) {
    if (previous.includes(entryId)) return previous;
    return Object.freeze([...previous, entryId]);
  }
  return Object.freeze(previous.filter((id) => id !== entryId));
}

const initialState: AppState = Object.freeze({
  nowMs: Date.now(),
  tick: LOG_SEED_COUNT,
  logs: initialLogs(LOG_SEED_COUNT),
  logsScrollTop: 0,
  expandedLogIds: Object.freeze([]),
  autoRefresh: true,
  includeDebug: true,
  operatorName: "operator",
  environment: "staging",
  themeName: "nord",
  commandTimeoutSec: 30,
  viewportCols: 120,
  viewportRows: 36,
});

// biome-ignore lint/style/useConst: app is assigned after route declarations for route-screen closures.
let app!: ReturnType<typeof createApp<AppState>>;
let isStopping = false;

function renderShell(
  title: string,
  context: RouteRenderContext<AppState>,
  body: VNode,
  bodyTitle = title,
): VNode {
  const state = context.state;
  const styles = getViewStyles(state.themeName);
  const compact = isCompactLayout(state);
  const stacked = isStackedLayout(state);
  const history = formatHistoryTrail(context.router, state.viewportCols, compact);
  const currentRouteId = context.router.currentRoute().id;

  return ui.column({ p: 1, gap: 1, items: "stretch", style: styles.rootStyle }, [
    ui.box(
      { border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: styles.stripStyle },
      [
        ui.column({ gap: 1 }, [
          ui.row({ items: "center", gap: 1, wrap: true }, [
            ui.text(`${PRODUCT_NAME} · ${title}`, { variant: "heading" }),
            ui.badge(`Env ${state.environment.toUpperCase()}`, {
              variant: environmentBadgeVariant(state.environment),
            }),
            ui.tag(`Theme ${themeLabel(state.themeName)}`, {
              variant: themeBadgeVariant(state.themeName),
            }),
            ui.status(state.autoRefresh ? "online" : "away", {
              label: state.autoRefresh ? "Streaming" : "Paused",
            }),
            ui.badge(`${String(state.viewportCols)}×${String(state.viewportRows)}`, {
              variant: "default",
            }),
            ui.badge(`tick:${String(state.tick)}`, { variant: "default" }),
          ]),
          ...(compact
            ? []
            : [
                ui.text(PRODUCT_TAGLINE, { style: styles.sectionLabelStyle }),
                ui.text(`Operator ${state.operatorName} · ${formatTime(state.nowMs)}`, {
                  style: styles.metaStyle,
                }),
              ]),
        ]),
      ],
    ),
    ui.box(
      { border: "rounded", px: PANEL_PADDING_X, py: PANEL_PADDING_Y, style: styles.stripStyle },
      [
        ui.column({ gap: 1 }, [
          ui.routerTabs(context.router, topLevelRoutes, {
            id: "app-route-tabs",
            variant: "pills",
          }),
          ...(compact
            ? []
            : [
                ui.routerBreadcrumb(context.router, routes, {
                  id: "app-route-breadcrumb",
                  separator: " > ",
                }),
              ]),
          ui.text(`History (${String(history.count)}): ${history.summary}`, {
            style: styles.metaStyle,
          }),
          ui.row({ gap: 1, wrap: true }, [
            ui.kbd("f1"),
            ui.text("Home", { style: styles.quietStyle }),
            ui.kbd("f2"),
            ui.text("Logs", { style: styles.quietStyle }),
            ui.kbd("f3"),
            ui.text("Settings", { style: styles.quietStyle }),
          ]),
          ui.row({ gap: 1, wrap: true }, [
            ui.kbd("alt+1"),
            ui.text("Home", { style: styles.quietStyle }),
            ui.kbd("alt+2"),
            ui.text("Logs", { style: styles.quietStyle }),
            ui.kbd("alt+3"),
            ui.text("Settings", { style: styles.quietStyle }),
          ]),
          ...(currentRouteId === "detail"
            ? [
                ui.row({ gap: 1, wrap: true }, [
                  ui.kbd("esc"),
                  ui.text("Back from detail", { style: styles.quietStyle }),
                ]),
              ]
            : []),
          ...(stacked
            ? [
                ui.text("Adaptive layout: stacked panels enabled", {
                  style: styles.quietStyle,
                }),
              ]
            : []),
        ]),
      ],
    ),
    panel(bodyTitle, [body], styles.panelStyle, { flex: 1 }),
    ui.text("Shortcuts: F1/F2/F3 or Alt+1/2/3 · Esc from Detail goes back · q quits", {
      style: styles.quietStyle,
    }),
  ]);
}

function renderHome(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;
  const styles = getViewStyles(state.themeName);
  const stacked = isStackedLayout(state);
  const latest = state.logs[state.logs.length - 1];
  const hasLatest = latest !== undefined;
  const telemetryPanels = [
    panel(
      "Live stream",
      [
        ui.column({ gap: 1 }, [
          ui.row({ gap: 1, wrap: true }, [
            ui.status(state.autoRefresh ? "online" : "away", {
              label: state.autoRefresh ? "Live stream enabled" : "Live stream paused",
            }),
            ui.badge(`logs:${String(state.logs.length)}`, { variant: "info" }),
            ui.badge(`tick:${String(state.tick)}`, { variant: "info" }),
            ui.badge(`history:${String(context.router.history().length)}`, { variant: "success" }),
          ]),
          ui.text(
            latest
              ? `Latest: [${latest.level.toUpperCase()}] ${latest.message} @ ${formatTime(latest.timestamp)}`
              : "Latest: no log entries yet",
          ),
        ]),
      ],
      styles.stripStyle,
      { flex: 2, minWidth: 44 },
    ),
    panel(
      "Quick actions",
      [
        ui.column({ gap: 1 }, [
          ui.row({ gap: 1, wrap: true }, [
            ui.button({
              id: "home-open-logs",
              label: "Open Logs",
              onPress: () => navigateTopLevel(context.router, "logs"),
            }),
            ui.button({
              id: "home-open-settings",
              label: "Open Settings",
              onPress: () => navigateTopLevel(context.router, "settings"),
            }),
            ui.button({
              id: "home-open-latest-detail",
              label: "Open Latest Detail",
              disabled: !hasLatest,
              onPress: () => {
                if (!latest) return;
                context.router.navigate("detail", Object.freeze({ id: latest.id }));
              },
            }),
          ]),
          ui.text(
            "Tip: open a detail entry, then press Esc/Back to verify focus/history behavior.",
            { style: styles.quietStyle },
          ),
        ]),
      ],
      styles.stripStyle,
      { flex: 1, minWidth: 32 },
    ),
  ];

  return renderShell(
    "Home",
    context,
    ui.column({ gap: 1 }, [
      ui.callout(
        "This app uses first-party page routing with keybindings, history, and focus restoration.",
        {
          title: "Router-ready CLI Template",
          variant: "info",
        },
      ),
      ui.row({ gap: 1, wrap: true }, [
        ui.badge(`timeout:${String(state.commandTimeoutSec)}s`, { variant: "info" }),
        ui.badge(`theme:${themeLabel(state.themeName)}`, {
          variant: themeBadgeVariant(state.themeName),
        }),
        ui.tag(`debug:${state.includeDebug ? "on" : "off"}`, {
          variant: state.includeDebug ? "info" : "default",
        }),
      ]),
      stacked
        ? ui.column({ gap: 1 }, telemetryPanels)
        : ui.row({ gap: 1, wrap: true, items: "stretch" }, telemetryPanels),
    ]),
    "Overview",
  );
}

function renderLogs(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;
  const styles = getViewStyles(state.themeName);
  const stacked = isStackedLayout(state);
  const compact = isCompactLayout(state);
  const recent = [...state.logs].slice(-8).reverse();

  const logsConsole = ui.logsConsole({
    id: "logs-console",
    entries: state.logs,
    scrollTop: state.logsScrollTop,
    expandedEntries: state.expandedLogIds,
    ...(state.includeDebug
      ? {}
      : { levelFilter: Object.freeze(["info", "warn", "error"] as const) }),
    onScroll: (scrollTop) => {
      context.update((prev) => Object.freeze({ ...prev, logsScrollTop: scrollTop }));
    },
    onEntryToggle: (entryId, expanded) => {
      context.update((prev) =>
        Object.freeze({
          ...prev,
          expandedLogIds: updateExpanded(prev.expandedLogIds, entryId, expanded),
        }),
      );
    },
    onClear: () => {
      context.update((prev) =>
        Object.freeze({
          ...prev,
          logs: Object.freeze([]),
          logsScrollTop: 0,
          expandedLogIds: Object.freeze([]),
        }),
      );
    },
  });

  const recentPanel = panel(
    "Open recent entry",
    [
      ui.column({ gap: 1 }, [
        ...recent.map((entry) => {
          const when = formatTime(entry.timestamp);
          const sourceLabel =
            entry.source.length > 10 ? `${entry.source.slice(0, 10)}…` : entry.source;
          return ui.row({ gap: 1, items: "center", wrap: true }, [
            ui.badge(entry.level.toUpperCase(), { variant: levelBadgeVariant(entry.level) }),
            ui.button({
              id: `open-${entry.id}`,
              label: `${sourceLabel} ${when}`,
              onPress: () => context.router.navigate("detail", Object.freeze({ id: entry.id })),
            }),
          ]);
        }),
        ...(recent.length === 0
          ? [ui.text("No entries in history.", { style: styles.metaStyle })]
          : []),
        ui.row({ gap: 1, wrap: true }, [
          ui.button({
            id: "logs-open-latest-detail",
            label: "Latest detail",
            disabled: recent.length === 0,
            onPress: () => {
              const latest = recent[0];
              if (!latest) return;
              context.router.navigate("detail", Object.freeze({ id: latest.id }));
            },
          }),
          ui.button({
            id: "logs-open-settings",
            label: "Settings",
            onPress: () => navigateTopLevel(context.router, "settings"),
          }),
        ]),
      ]),
    ],
    styles.stripStyle,
    stacked ? { minWidth: 34 } : { flex: 2, minWidth: 34 },
  );

  const streamPanel = panel("Log stream", [logsConsole], styles.stripStyle, {
    ...(stacked ? {} : { flex: 3 }),
    minWidth: 52,
  });

  return renderShell(
    "Logs",
    context,
    ui.column({ gap: 1 }, [
      ui.row({ gap: 1, wrap: true }, [
        ui.tag(`debug:${state.includeDebug ? "on" : "off"}`, {
          variant: state.includeDebug ? "info" : "default",
        }),
        ui.tag(`refresh:${state.autoRefresh ? "on" : "off"}`, {
          variant: state.autoRefresh ? "success" : "warning",
        }),
        ui.badge(`entries:${String(state.logs.length)}`, { variant: "default" }),
        ui.button({
          id: "logs-toggle-refresh",
          label: state.autoRefresh ? "Pause stream" : "Resume stream",
          onPress: () => {
            context.update((prev) => Object.freeze({ ...prev, autoRefresh: !prev.autoRefresh }));
          },
        }),
        ui.button({
          id: "logs-clear-inline",
          label: "Clear logs",
          onPress: () => {
            context.update((prev) =>
              Object.freeze({
                ...prev,
                logs: Object.freeze([]),
                logsScrollTop: 0,
                expandedLogIds: Object.freeze([]),
              }),
            );
          },
        }),
      ]),
      stacked
        ? ui.column({ gap: 1 }, [streamPanel, recentPanel])
        : ui.row({ gap: compact ? 1 : 2, wrap: true, items: "stretch" }, [
            streamPanel,
            recentPanel,
          ]),
    ]),
    compact ? "Logs (compact)" : "Live Logs",
  );
}

function renderSettings(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;
  const styles = getViewStyles(state.themeName);
  const stacked = isStackedLayout(state);
  const compact = isCompactLayout(state);

  const profilePanel = panel(
    "Profile",
    [
      ui.column({ gap: 1 }, [
        ui.text("Operator", { style: styles.sectionLabelStyle }),
        ui.input({
          id: "settings-operator",
          value: state.operatorName,
          onInput: (value) => {
            context.update((prev) => Object.freeze({ ...prev, operatorName: value }));
          },
        }),
        ui.text("Environment", { style: styles.sectionLabelStyle }),
        ui.select({
          id: "settings-environment",
          value: state.environment,
          options: ENV_OPTIONS,
          onChange: (value) => {
            if (!isEnvironment(value)) return;
            context.update((prev) => Object.freeze({ ...prev, environment: value }));
          },
        }),
        ui.text("Theme", { style: styles.sectionLabelStyle }),
        ui.select({
          id: "settings-theme",
          value: state.themeName,
          options: THEME_OPTIONS,
          onChange: (value) => {
            if (!isThemeName(value)) return;
            applyTheme(context, value);
          },
        }),
      ]),
    ],
    styles.stripStyle,
    stacked ? { minWidth: 34 } : { flex: 1, minWidth: 34 },
  );

  const runtimePanel = panel(
    "Runtime",
    [
      ui.column({ gap: 1 }, [
        ui.checkbox({
          id: "settings-auto-refresh",
          checked: state.autoRefresh,
          label: "Auto-refresh log stream",
          onChange: (checked) => {
            context.update((prev) => Object.freeze({ ...prev, autoRefresh: checked }));
          },
        }),
        ui.checkbox({
          id: "settings-include-debug",
          checked: state.includeDebug,
          label: "Include debug level entries",
          onChange: (checked) => {
            context.update((prev) => Object.freeze({ ...prev, includeDebug: checked }));
          },
        }),
        ui.text(`Command timeout: ${String(state.commandTimeoutSec)}s`, {
          style: styles.sectionLabelStyle,
        }),
        ui.slider({
          id: "settings-timeout",
          value: state.commandTimeoutSec,
          min: 5,
          max: 120,
          step: 5,
          onChange: (value) => {
            context.update((prev) => Object.freeze({ ...prev, commandTimeoutSec: value }));
          },
        }),
        ui.text(
          `Current preset: ${themeLabel(state.themeName)} · ${state.environment.toUpperCase()}`,
          { style: styles.metaStyle },
        ),
      ]),
    ],
    styles.stripStyle,
    stacked ? { minWidth: 34 } : { flex: 1, minWidth: 34 },
  );

  return renderShell(
    "Settings",
    context,
    ui.column({ gap: 1 }, [
      ui.callout("Adjust runtime behavior, filtering, and presentation preferences.", {
        title: "Preferences",
        variant: "info",
      }),
      panel(
        "Theme presets",
        [
          ui.row(
            { gap: 1, wrap: true },
            THEME_OPTIONS.map((option) =>
              ui.button({
                id: `settings-theme-preset-${option.value}`,
                label: option.label,
                disabled: option.value === state.themeName,
                onPress: () => applyTheme(context, option.value),
              }),
            ),
          ),
        ],
        styles.stripStyle,
        { minWidth: 34 },
      ),
      stacked
        ? ui.column({ gap: 1 }, [profilePanel, runtimePanel])
        : ui.row({ gap: compact ? 1 : 2, wrap: true, items: "stretch" }, [
            profilePanel,
            runtimePanel,
          ]),
      panel(
        "Current session",
        [
          ui.row({ gap: 1, wrap: true }, [
            ui.badge(`env:${state.environment}`, {
              variant: environmentBadgeVariant(state.environment),
            }),
            ui.badge(`theme:${themeLabel(state.themeName)}`, {
              variant: themeBadgeVariant(state.themeName),
            }),
            ui.badge(`timeout:${String(state.commandTimeoutSec)}s`, { variant: "info" }),
            ui.tag(`debug:${state.includeDebug ? "on" : "off"}`, {
              variant: state.includeDebug ? "info" : "default",
            }),
          ]),
        ],
        styles.stripStyle,
      ),
      ui.row({ gap: 1, wrap: true }, [
        ui.button({
          id: "settings-open-logs",
          label: "Logs",
          onPress: () => navigateTopLevel(context.router, "logs"),
        }),
        ui.button({
          id: "settings-open-home",
          label: "Home",
          onPress: () => navigateTopLevel(context.router, "home"),
        }),
      ]),
    ]),
    compact ? "Settings (compact)" : "Configuration",
  );
}

function renderDetail(
  params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const styles = getViewStyles(context.state.themeName);
  const entryId = (params as Readonly<{ id?: string }>).id;
  const logs = context.state.logs;
  const index = entryId ? logs.findIndex((entry) => entry.id === entryId) : -1;
  const entry = index >= 0 ? logs[index] : undefined;

  if (!entry) {
    return renderShell(
      "Log Detail",
      context,
      ui.box({ border: "single", px: 1, py: 0, style: styles.stripStyle }, [
        ui.column({ gap: 1 }, [
          ui.callout("The selected log entry no longer exists in the bounded history window.", {
            title: "Entry unavailable",
            variant: "warning",
          }),
          ui.button({
            id: "detail-missing-back",
            label: "Back to Logs",
            onPress: () => {
              if (context.router.canGoBack()) context.router.back();
              else navigateTopLevel(context.router, "logs");
            },
          }),
        ]),
      ]),
      "Log Detail",
    );
  }

  const previous = index > 0 ? logs[index - 1] : undefined;
  const next = index >= 0 && index < logs.length - 1 ? logs[index + 1] : undefined;

  return renderShell(
    "Log Detail",
    context,
    ui.box({ border: "single", p: 1, style: styles.stripStyle }, [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 1, wrap: true }, [
          ui.badge(entry.level.toUpperCase(), {
            variant: levelBadgeVariant(entry.level),
          }),
          ui.tag(`source:${entry.source}`, { variant: "default" }),
          ui.tag(`time:${formatTime(entry.timestamp)}`, { variant: "default" }),
          ui.badge(`index ${String(index + 1)} / ${String(logs.length)}`, { variant: "default" }),
        ]),
        ui.text(entry.message),
        ui.callout(entry.details ?? "No extra details", {
          title: "Details",
          variant: "info",
        }),
        ui.row({ gap: 1, wrap: true }, [
          ui.button({
            id: "detail-prev",
            label: "Previous",
            disabled: previous === undefined,
            onPress: () => {
              if (!previous) return;
              context.router.replace("detail", Object.freeze({ id: previous.id }));
            },
          }),
          ui.button({
            id: "detail-next",
            label: "Next",
            disabled: next === undefined,
            onPress: () => {
              if (!next) return;
              context.router.replace("detail", Object.freeze({ id: next.id }));
            },
          }),
          ui.button({
            id: "detail-back",
            label: "Back",
            onPress: () => {
              if (context.router.canGoBack()) context.router.back();
              else navigateTopLevel(context.router, "logs");
            },
          }),
        ]),
      ]),
    ]),
    "Log Detail",
  );
}

const routes: readonly RouteDefinition<AppState>[] = Object.freeze([
  {
    id: "home",
    title: "Home",
    screen: renderHome,
  },
  {
    id: "logs",
    title: "Logs",
    screen: renderLogs,
  },
  {
    id: "settings",
    title: "Settings",
    screen: renderSettings,
  },
  {
    id: "detail",
    title: "Detail",
    screen: renderDetail,
  },
]);

const topLevelRoutes: readonly RouteDefinition<AppState>[] = Object.freeze(
  routes.filter((route) => route.id !== "detail"),
);

app = createApp({
  backend: createNodeBackend({
    fpsCap: UI_FPS_CAP,
  }),
  initialState,
  routes,
  initialRoute: "home",
  config: {
    fpsCap: UI_FPS_CAP,
  },
  theme: THEME_BY_NAME[initialState.themeName],
});

async function shutdown(): Promise<void> {
  if (isStopping) return;
  isStopping = true;
  clearInterval(logTimer);
  try {
    await app.stop();
  } catch {
    // Ignore shutdown races on forced exit paths.
  }
  app.dispose();
  exit(0);
}

app.keys({
  q: () => {
    void shutdown();
  },
  "ctrl+c": () => {
    void shutdown();
  },
  f1: () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "home");
  },
  f2: () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "logs");
  },
  f3: () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "settings");
  },
  "alt+1": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "home");
  },
  "alt+2": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "logs");
  },
  "alt+3": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "settings");
  },
  "ctrl+1": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "home");
  },
  "ctrl+2": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "logs");
  },
  "ctrl+3": () => {
    const router = app.router;
    if (!router) return;
    navigateTopLevel(router, "settings");
  },
  escape: () => {
    const router = app.router;
    if (!router) return;
    const route = router.currentRoute();
    if (route?.id === "detail") {
      if (router.canGoBack()) router.back();
      else navigateTopLevel(router, "logs");
    }
  },
});

app.onEvent((event) => {
  if (event.kind === "engine") {
    const raw = event.event;
    if (raw.kind === "resize") {
      app.update((prev) => {
        if (prev.viewportCols === raw.cols && prev.viewportRows === raw.rows) return prev;
        return Object.freeze({
          ...prev,
          viewportCols: raw.cols,
          viewportRows: raw.rows,
        });
      });
    }
    if (raw.kind === "text" && raw.codepoint >= 0 && raw.codepoint <= 0x10ffff) {
      const ch = String.fromCodePoint(raw.codepoint).toLowerCase();
      if (ch === "q") void shutdown();
    }
  }
  if (event.kind === "fatal") {
    clearInterval(logTimer);
  }
});

const logTimer = setInterval(() => {
  app.update((prev) => {
    if (!prev.autoRefresh) return prev;
    return appendTickLog(prev);
  });
}, LOG_TICK_MS);

await app.start();
