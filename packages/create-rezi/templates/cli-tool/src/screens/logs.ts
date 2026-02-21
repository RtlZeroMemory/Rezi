import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { levelBadgeVariant } from "../helpers/logs.js";
import { stylesForTheme } from "../theme.js";
import type { CliAction, CliState, RouteId } from "../types.js";
import { renderShell } from "./shell.js";

type LogsScreenDeps = Readonly<{
  dispatch: (action: CliAction) => void;
  onNavigate: (routeId: RouteId) => void;
  onToggleHelp: () => void;
}>;

export function renderLogsScreen(
  context: RouteRenderContext<CliState>,
  deps: LogsScreenDeps,
): VNode {
  const state = context.state;
  const styles = stylesForTheme(state.themeName);

  const recent = [...state.logs].slice(-5).reverse();

  return renderShell({
    title: "Logs",
    context,
    onNavigate: deps.onNavigate,
    onToggleHelp: deps.onToggleHelp,
    body: ui.column({ gap: 1 }, [
      ui.row({ gap: 1, wrap: true }, [
        ui.button({
          id: "logs-toggle-refresh",
          label: state.autoRefresh ? "Pause stream" : "Resume stream",
          onPress: () => deps.dispatch({ type: "toggle-refresh" }),
        }),
        ui.button({
          id: "logs-toggle-debug",
          label: state.includeDebug ? "Hide debug" : "Show debug",
          onPress: () => deps.dispatch({ type: "toggle-debug" }),
        }),
        ui.button({
          id: "logs-clear",
          label: "Clear logs",
          onPress: () => deps.dispatch({ type: "clear-logs" }),
        }),
      ]),
      ui.box({ border: "rounded", px: 1, py: 0, style: styles.panelStyle }, [
        ui.logsConsole({
          id: "logs-console",
          entries: state.logs,
          scrollTop: state.logsScrollTop,
          expandedEntries: state.expandedLogIds,
          ...(state.includeDebug
            ? {}
            : { levelFilter: Object.freeze(["info", "warn", "error"] as const) }),
          onScroll: (scrollTop) => deps.dispatch({ type: "set-scroll-top", scrollTop }),
          onEntryToggle: (entryId, expanded) =>
            deps.dispatch({ type: "set-entry-expanded", entryId, expanded }),
          onClear: () => deps.dispatch({ type: "clear-logs" }),
        }),
      ]),
      ui.box({ border: "rounded", px: 1, py: 0, style: styles.panelStyle }, [
        ui.column({ gap: 1 }, [
          ui.text("Recent entries", { variant: "heading" }),
          ...recent.map((entry) =>
            ui.row({ key: entry.id, gap: 1, wrap: true }, [
              ui.badge(entry.level.toUpperCase(), { variant: levelBadgeVariant(entry.level) }),
              ui.text(entry.message, { textOverflow: "ellipsis", maxWidth: 60 }),
            ]),
          ),
          ...(recent.length === 0 ? [ui.text("No log entries.", { style: styles.mutedStyle })] : []),
        ]),
      ]),
    ]),
  });
}
