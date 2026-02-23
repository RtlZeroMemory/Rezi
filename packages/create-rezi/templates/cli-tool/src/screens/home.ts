import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { stylesForTheme } from "../theme.js";
import type { CliState, RouteId } from "../types.js";
import { renderShell } from "./shell.js";

export function buildHomeContent(state: CliState): VNode {
  const styles = stylesForTheme(state.themeName);
  const latest = state.logs[state.logs.length - 1];

  return ui.panel({ title: "Overview", style: styles.panelStyle }, [
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
  const styles = stylesForTheme(context.state.themeName);

  return renderShell({
    title: "Home",
    context,
    onNavigate: deps.onNavigate,
    onToggleHelp: deps.onToggleHelp,
    body: ui.panel({ title: "Home Workspace", style: styles.panelStyle }, [
      ui.column({ gap: 1 }, [
        buildHomeContent(context.state),
        ui.actions([
          ui.button({
            id: "home-open-logs",
            label: "Open Logs",
            intent: "primary",
            onPress: () => deps.onNavigate("logs"),
          }),
          ui.button({
            id: "home-open-settings",
            label: "Open Settings",
            intent: "secondary",
            onPress: () => deps.onNavigate("settings"),
          }),
        ]),
      ]),
    ]),
  });
}
