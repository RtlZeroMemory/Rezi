import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { themeSpec } from "../theme.js";
import type {
  CliAction,
  CliState,
  EnvironmentName,
  RouteId,
  ThemeName,
} from "../types.js";
import { renderShell } from "./shell.js";

const THEME_OPTIONS: readonly Readonly<{ value: ThemeName; label: string }>[] = Object.freeze([
  { value: "nord", label: "Nord" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
]);

const ENVIRONMENT_OPTIONS: readonly Readonly<{ value: EnvironmentName; label: string }>[] =
  Object.freeze([
    { value: "development", label: "Development" },
    { value: "staging", label: "Staging" },
    { value: "production", label: "Production" },
  ]);

function isThemeName(value: string): value is ThemeName {
  return value === "nord" || value === "dark" || value === "light";
}

function isEnvironmentName(value: string): value is EnvironmentName {
  return value === "development" || value === "staging" || value === "production";
}

type SettingsScreenDeps = Readonly<{
  dispatch: (action: CliAction) => void;
  onNavigate: (routeId: RouteId) => void;
  onToggleHelp: () => void;
}>;

export function renderSettingsScreen(
  context: RouteRenderContext<CliState>,
  deps: SettingsScreenDeps,
): VNode {
  const state = context.state;
  const theme = themeSpec(state.themeName);

  return renderShell({
    title: "Settings",
    context,
    onNavigate: deps.onNavigate,
    onToggleHelp: deps.onToggleHelp,
    body: ui.box({ border: "rounded", px: 1, py: 0 }, [
      ui.column({ gap: 1 }, [
        ui.text("Profile", { variant: "heading" }),
        ui.text("Operator"),
        ui.input({
          id: "settings-operator",
          value: state.operatorName,
          onInput: (operatorName) => deps.dispatch({ type: "set-operator", operatorName }),
        }),
        ui.text("Environment"),
        ui.select({
          id: "settings-environment",
          value: state.environment,
          options: ENVIRONMENT_OPTIONS,
          onChange: (value) => {
            if (!isEnvironmentName(value)) return;
            deps.dispatch({ type: "set-environment", environment: value });
          },
        }),
        ui.text("Theme"),
        ui.select({
          id: "settings-theme",
          value: state.themeName,
          options: THEME_OPTIONS,
          onChange: (value) => {
            if (!isThemeName(value)) return;
            deps.dispatch({ type: "set-theme", themeName: value });
          },
        }),
        ui.checkbox({
          id: "settings-auto-refresh",
          checked: state.autoRefresh,
          label: "Auto-refresh log stream",
          onChange: () => deps.dispatch({ type: "toggle-refresh" }),
        }),
        ui.checkbox({
          id: "settings-include-debug",
          checked: state.includeDebug,
          label: "Include debug entries",
          onChange: () => deps.dispatch({ type: "toggle-debug" }),
        }),
        ui.text(`Current theme: ${theme.label}`, { style: { dim: true } }),
      ]),
    ]),
  });
}
