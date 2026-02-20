import { exit } from "node:process";
import type {
  LogEntry,
  RouteDefinition,
  RouteRenderContext,
  ThemeDefinition,
  VNode,
} from "@rezi-ui/core";
import { createApp, darkTheme, lightTheme, nordTheme, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type ThemeName = "nord" | "dark" | "light";
type EnvironmentName = "development" | "staging" | "production";

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
};

const PRODUCT_NAME = "__APP_NAME__";

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

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", { hour12: false });
}

function isThemeName(value: string): value is ThemeName {
  return value === "nord" || value === "dark" || value === "light";
}

function isEnvironment(value: string): value is EnvironmentName {
  return value === "development" || value === "staging" || value === "production";
}

function buildLogEntry(
  tick: number,
  environment: EnvironmentName,
  includeDebug: boolean,
): LogEntry {
  const source = LOG_SOURCES[tick % LOG_SOURCES.length] ?? "core";
  const message = LOG_MESSAGES[tick % LOG_MESSAGES.length] ?? "Updated background task";
  const baseLevel = LOG_LEVELS[tick % LOG_LEVELS.length] ?? "info";
  const level = includeDebug || baseLevel !== "debug" ? baseLevel : "info";
  const timestamp = Date.now();

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

function initialLogs(): readonly LogEntry[] {
  const seed: LogEntry[] = [];
  for (let i = 0; i < 6; i++) {
    seed.push(buildLogEntry(i + 1, "staging", true));
  }
  return Object.freeze(seed);
}

function appendTickLog(prev: Readonly<AppState>): AppState {
  const nextTick = prev.tick + 1;
  const nextEntry = buildLogEntry(nextTick, prev.environment, prev.includeDebug);
  const nextLogs = Object.freeze([...prev.logs, nextEntry].slice(-200));
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
  tick: 6,
  logs: initialLogs(),
  logsScrollTop: 0,
  expandedLogIds: Object.freeze([]),
  autoRefresh: true,
  includeDebug: true,
  operatorName: "operator",
  environment: "staging",
  themeName: "nord",
  commandTimeoutSec: 30,
});

// biome-ignore lint/style/useConst: app is assigned after route declarations for route-screen closures.
let app!: ReturnType<typeof createApp<AppState>>;
let isStopping = false;

function renderShell(title: string, context: RouteRenderContext<AppState>, body: VNode): VNode {
  return ui.column({ p: 1, gap: 1 }, [
    ui.box({ border: "rounded", p: 1 }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text(`${PRODUCT_NAME} · ${title}`, { variant: "heading" }),
        ui.row({ gap: 1 }, [
          ui.badge(`env:${context.state.environment}`, {
            variant: context.state.environment === "production" ? "warning" : "info",
          }),
          ui.badge(`tick:${String(context.state.tick)}`, { variant: "default" }),
        ]),
      ]),
      ui.text(`operator:${context.state.operatorName} · time:${formatTime(context.state.nowMs)}`, {
        variant: "caption",
      }),
    ]),
    ui.box({ border: "single", p: 1 }, [
      ui.routerTabs(context.router, topLevelRoutes, {
        id: "app-route-tabs",
        variant: "pills",
      }),
      ui.routerBreadcrumb(context.router, routes, {
        id: "app-route-breadcrumb",
        separator: " > ",
      }),
    ]),
    ui.box({ border: "single", p: 1 }, [body]),
    ui.text("ctrl+1 Home · ctrl+2 Logs · ctrl+3 Settings · q Quit", { variant: "caption" }),
  ]);
}

function renderHome(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;
  const latest = state.logs[state.logs.length - 1];

  return renderShell(
    "Home",
    context,
    ui.box({ border: "single", p: 1 }, [
      ui.column({ gap: 1 }, [
        ui.callout(
          "This app uses first-party page routing with keybindings, history, and focus restoration.",
          {
            title: "Router-ready CLI Template",
            variant: "info",
          },
        ),
        ui.row({ gap: 1 }, [
          ui.status(state.autoRefresh ? "online" : "away", {
            label: state.autoRefresh ? "Live stream enabled" : "Live stream paused",
          }),
          ui.badge(`logs:${String(state.logs.length)}`, { variant: "default" }),
          ui.badge(`tick:${String(state.tick)}`, { variant: "info" }),
        ]),
        ui.text(
          latest
            ? `Latest: [${latest.level.toUpperCase()}] ${latest.message} @ ${formatTime(latest.timestamp)}`
            : "No log entries yet.",
        ),
        ui.row({ gap: 1 }, [
          ui.button({
            id: "home-open-logs",
            label: "Open Logs",
            onPress: () => context.router.navigate("logs"),
          }),
          ui.button({
            id: "home-open-settings",
            label: "Open Settings",
            onPress: () => context.router.navigate("settings"),
          }),
        ]),
      ]),
    ]),
  );
}

function renderLogs(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;
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

  return renderShell(
    "Logs",
    context,
    ui.row({ gap: 2 }, [
      ui.box({ flex: 2, border: "single", p: 1 }, [logsConsole]),
      ui.box({ flex: 1, border: "single", p: 1 }, [
        ui.column({ gap: 1 }, [
          ui.text("Recent entries", { variant: "label" }),
          ...recent.map((entry) =>
            ui.button({
              id: `open-${entry.id}`,
              label: `${entry.level.toUpperCase()} · ${entry.source}`,
              onPress: () => context.router.navigate("detail", Object.freeze({ id: entry.id })),
            }),
          ),
          ...(recent.length === 0
            ? [ui.text("No entries in history.", { variant: "caption" })]
            : []),
          ui.button({
            id: "logs-open-settings",
            label: "Settings",
            onPress: () => context.router.navigate("settings"),
          }),
        ]),
      ]),
    ]),
  );
}

function renderSettings(
  _params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const state = context.state;

  return renderShell(
    "Settings",
    context,
    ui.box({ border: "single", p: 1 }, [
      ui.column({ gap: 1 }, [
        ui.field({
          label: "Operator",
          children: ui.input({
            id: "settings-operator",
            value: state.operatorName,
            onInput: (value) => {
              context.update((prev) => Object.freeze({ ...prev, operatorName: value }));
            },
          }),
        }),
        ui.field({
          label: "Environment",
          children: ui.select({
            id: "settings-environment",
            value: state.environment,
            options: ENV_OPTIONS,
            onChange: (value) => {
              if (!isEnvironment(value)) return;
              context.update((prev) => Object.freeze({ ...prev, environment: value }));
            },
          }),
        }),
        ui.field({
          label: "Theme",
          children: ui.select({
            id: "settings-theme",
            value: state.themeName,
            options: THEME_OPTIONS,
            onChange: (value) => {
              if (!isThemeName(value)) return;
              context.update((prev) => Object.freeze({ ...prev, themeName: value }));
              app.setTheme(THEME_BY_NAME[value]);
            },
          }),
        }),
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
        ui.field({
          label: `Command timeout: ${String(state.commandTimeoutSec)}s`,
          children: ui.slider({
            id: "settings-timeout",
            value: state.commandTimeoutSec,
            min: 5,
            max: 120,
            step: 5,
            onChange: (value) => {
              context.update((prev) => Object.freeze({ ...prev, commandTimeoutSec: value }));
            },
          }),
        }),
        ui.row({ gap: 1 }, [
          ui.button({
            id: "settings-open-logs",
            label: "Logs",
            onPress: () => context.router.navigate("logs"),
          }),
          ui.button({
            id: "settings-open-home",
            label: "Home",
            onPress: () => context.router.navigate("home"),
          }),
        ]),
      ]),
    ]),
  );
}

function renderDetail(
  params: Readonly<Record<string, string>>,
  context: RouteRenderContext<AppState>,
): VNode {
  const entryId = (params as Readonly<{ id?: string }>).id;
  const logs = context.state.logs;
  const index = entryId ? logs.findIndex((entry) => entry.id === entryId) : -1;
  const entry = index >= 0 ? logs[index] : undefined;

  if (!entry) {
    return renderShell(
      "Log Detail",
      context,
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
            else context.router.navigate("logs");
          },
        }),
      ]),
    );
  }

  const previous = index > 0 ? logs[index - 1] : undefined;
  const next = index >= 0 && index < logs.length - 1 ? logs[index + 1] : undefined;

  return renderShell(
    "Log Detail",
    context,
    ui.box({ border: "single", p: 1 }, [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 1 }, [
          ui.badge(entry.level.toUpperCase(), {
            variant: entry.level === "error" ? "error" : "info",
          }),
          ui.text(`source:${entry.source}`),
          ui.text(`time:${formatTime(entry.timestamp)}`),
        ]),
        ui.text(entry.message),
        ui.callout(entry.details ?? "No extra details", {
          title: "Details",
          variant: "info",
        }),
        ui.row({ gap: 1 }, [
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
              else context.router.navigate("logs");
            },
          }),
        ]),
      ]),
    ]),
  );
}

const routes: readonly RouteDefinition<AppState>[] = Object.freeze([
  {
    id: "home",
    title: "Home",
    keybinding: "ctrl+1",
    screen: renderHome,
  },
  {
    id: "logs",
    title: "Logs",
    keybinding: "ctrl+2",
    screen: renderLogs,
  },
  {
    id: "settings",
    title: "Settings",
    keybinding: "ctrl+3",
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
    fpsCap: 30,
  }),
  initialState,
  routes,
  initialRoute: "home",
  config: {
    fpsCap: 30,
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
});

app.onEvent((event) => {
  if (event.kind === "fatal") {
    clearInterval(logTimer);
  }
});

const logTimer = setInterval(() => {
  app.update((prev) => {
    if (!prev.autoRefresh) return prev;
    return appendTickLog(prev);
  });
}, 1000);

await app.start();
