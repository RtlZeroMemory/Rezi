import type { RouteDefinition } from "@rezi-ui/core";
import type { CliAction, CliState, RouteId } from "../types.js";
import { renderHomeScreen } from "./home.js";
import { renderLogsScreen } from "./logs.js";
import { renderSettingsScreen } from "./settings.js";

type RouteDeps = Readonly<{
  dispatch: (action: CliAction) => void;
  onNavigate: (routeId: RouteId) => void;
  onToggleHelp: () => void;
}>;

export function createCliRoutes(deps: RouteDeps): readonly RouteDefinition<CliState>[] {
  return Object.freeze([
    {
      id: "home",
      title: "Home",
      screen: (_params, context) =>
        renderHomeScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleHelp: deps.onToggleHelp,
        }),
    },
    {
      id: "logs",
      title: "Logs",
      screen: (_params, context) =>
        renderLogsScreen(context, {
          dispatch: deps.dispatch,
          onNavigate: deps.onNavigate,
          onToggleHelp: deps.onToggleHelp,
        }),
    },
    {
      id: "settings",
      title: "Settings",
      screen: (_params, context) =>
        renderSettingsScreen(context, {
          dispatch: deps.dispatch,
          onNavigate: deps.onNavigate,
          onToggleHelp: deps.onToggleHelp,
        }),
    },
  ]);
}
