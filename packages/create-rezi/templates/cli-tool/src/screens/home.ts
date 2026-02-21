import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { stylesForTheme } from "../theme.js";
import type { CliState, RouteId } from "../types.js";
import { renderShell } from "./shell.js";

export function buildHomeContent(state: CliState): VNode {
  const styles = stylesForTheme(state.themeName);
  const latest = state.logs[state.logs.length - 1];

  return ui.box({ border: "rounded", px: 1, py: 0, style: styles.panelStyle }, [
    ui.column({ gap: 1 }, [
      ui.text("Route-aware Home screen", { variant: "heading" }),
      ui.text(`Operator: ${state.operatorName}`),
      ui.text(`Environment: ${state.environment}`),
      ui.text(`Log entries: ${String(state.logs.length)}`),
      ui.text(`Latest: ${latest ? latest.message : "No log entries yet"}`, {
        style: styles.mutedStyle,
        textOverflow: "ellipsis",
        maxWidth: 68,
      }),
    ]),
  ]);
}

type HomeScreenDeps = Readonly<{
  onNavigate: (routeId: RouteId) => void;
  onToggleHelp: () => void;
}>;

export function renderHomeScreen(
  context: RouteRenderContext<CliState>,
  deps: HomeScreenDeps,
): VNode {
  return renderShell({
    title: "Home",
    context,
    onNavigate: deps.onNavigate,
    onToggleHelp: deps.onToggleHelp,
    body: ui.column({ gap: 1 }, [
      buildHomeContent(context.state),
      ui.row({ gap: 1, wrap: true }, [
        ui.button({ id: "home-open-logs", label: "Open Logs", onPress: () => deps.onNavigate("logs") }),
        ui.button({
          id: "home-open-settings",
          label: "Open Settings",
          onPress: () => deps.onNavigate("settings"),
        }),
      ]),
    ]),
  });
}
