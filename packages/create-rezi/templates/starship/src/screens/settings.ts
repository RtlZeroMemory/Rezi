import { defineWidget, ui, type RouteRenderContext, type VNode } from "@rezi-ui/core";
import { padLabel, resolveLayout } from "../helpers/layout.js";
import { SPACE, themeSpec, themeTokens } from "../theme.js";
import type { RouteDeps, StarshipState } from "../types.js";
import { sectionHeader, surfacePanel } from "./primitives.js";
import { renderShell } from "./shell.js";

function validationError(state: StarshipState): string | null {
  const name = state.shipName.trim();
  if (name.length === 0) return "Ship name is required.";
  if (name.length > 30) return "Ship name must be 30 characters or fewer.";
  if (state.alertThreshold < 20 || state.alertThreshold > 95) {
    return "Alert threshold should stay between 20 and 95.";
  }
  return null;
}

type SettingsDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

const SettingsDeck = defineWidget<SettingsDeckProps>((props, ctx): VNode => {
  const state = props.state;
  const tokens = themeTokens(state.themeName);
  const activeTheme = themeSpec(state.themeName);
  const error = validationError(state);
  const layout = resolveLayout({
    width: state.viewportCols,
    height: state.viewportRows,
  });

  const settingsForm = surfacePanel(tokens, "Ship Settings", [
    sectionHeader(tokens, "Configuration", "Fixed-width labels + consistent section rhythm"),
    error
      ? ui.callout(error, {
          title: "Validation",
          variant: "error",
        })
      : ui.callout("All settings are valid.", {
          title: "Validation",
          variant: "success",
        }),
    ui.form({ id: "settings-form", gap: SPACE.md }, [
      ui.field({
        label: padLabel("Ship Name", 18),
        required: true,
        ...(state.shipName.trim().length === 0 ? { error: "Name required" } : {}),
        children: ui.input({
          id: "settings-ship-name",
          value: state.shipName,
          placeholder: "USS Rezi",
          onInput: (value) => props.dispatch({ type: "set-ship-name", name: value }),
        }),
      }),
      ui.field({
        label: padLabel("Alert Threshold", 18),
        hint: "Value used by engineering warnings",
        children: ui.slider({
          id: "settings-alert-threshold",
          min: 20,
          max: 95,
          step: 1,
          label: "Threshold",
          value: state.alertThreshold,
          onChange: (threshold) => props.dispatch({ type: "set-alert-threshold", threshold }),
        }),
      }),
      ui.field({
        label: padLabel("Default Channel", 18),
        children: ui.select({
          id: "settings-default-channel",
          value: state.defaultChannel,
          options: [
            { value: "fleet", label: "Fleet" },
            { value: "local", label: "Local" },
            { value: "emergency", label: "Emergency" },
            { value: "internal", label: "Internal" },
          ],
          onChange: (value) =>
            props.dispatch({
              type: "set-default-channel",
              channel: value as StarshipState["defaultChannel"],
            }),
        }),
      }),
      ui.field({
        label: padLabel("Autopilot", 18),
        children: ui.checkbox({
          id: "settings-autopilot",
          checked: state.autopilot,
          label: "Enable autopilot by default",
          onChange: () => props.dispatch({ type: "toggle-autopilot" }),
        }),
      }),
      ui.field({
        label: padLabel("Notifications", 18),
        children: ui.radioGroup({
          id: "settings-notifications-mode",
          value: state.notificationsMode,
          direction: layout.hideNonCritical ? "vertical" : "horizontal",
          options: [
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "none", label: "None" },
          ],
          onChange: (mode) =>
            props.dispatch({
              type: "set-notifications-mode",
              mode: mode as StarshipState["notificationsMode"],
            }),
        }),
      }),
      ui.field({
        label: padLabel("Captain Notes", 18),
        children: ui.textarea({
          id: "settings-notes",
          value: state.settingsNotes,
          rows: layout.hideNonCritical ? 3 : 5,
          placeholder: "Operational notes",
          onInput: (notes) => props.dispatch({ type: "set-settings-notes", notes }),
        }),
      }),
    ]),
    ui.actions([
      ui.button({
        id: "settings-save",
        label: "Save",
        intent: "primary",
        onPress: () => {
          if (!error) {
            props.dispatch({
              type: "add-toast",
              toast: {
                id: `settings-saved-${state.nowMs}-${state.tick}`,
                message: "Settings saved",
                level: "success",
                timestamp: state.nowMs,
                durationMs: 3000,
              },
            });
          }
        },
      }),
      ui.button({
        id: "settings-reset",
        label: "Reset",
        intent: "danger",
        onPress: () => props.dispatch({ type: "toggle-reset-dialog" }),
      }),
      ui.button({
        id: "settings-cycle-theme",
        label: "Cycle Theme",
        intent: "link",
        onPress: () => props.dispatch({ type: "cycle-theme" }),
      }),
    ]),
  ], { tone: "base" });

  return ui.layers([
    ui.column({ gap: SPACE.md, width: "100%" }, [
      settingsForm,
      layout.hideNonCritical
        ? surfacePanel(tokens, "Theme Snapshot", [
            ui.row({ gap: SPACE.sm, wrap: true }, [
              ui.badge(activeTheme.label, { variant: activeTheme.badge }),
              ui.text("Open wider terminal for full theme preview rail.", {
                variant: "caption",
              }),
            ]),
          ], { tone: "inset" })
        : null,
    ]),
    state.showResetDialog
      ? ui.dialog({
          id: "settings-reset-dialog",
          title: "Reset Settings",
          message: "Reset all ship settings to defaults?",
          actions: [
            {
              id: "settings-reset-confirm",
              label: "Reset",
              intent: "danger",
              onPress: () => props.dispatch({ type: "reset-settings" }),
            },
            {
              id: "settings-reset-cancel",
              label: "Cancel",
              onPress: () => props.dispatch({ type: "toggle-reset-dialog" }),
            },
          ],
          onClose: () => props.dispatch({ type: "toggle-reset-dialog" }),
          width: 52,
        })
      : null,
  ]);
});

function settingsRightRail(state: StarshipState, deps: RouteDeps): VNode {
  const tokens = themeTokens(state.themeName);
  const activeTheme = themeSpec(state.themeName);

  const previewPage = ui.page({
    p: SPACE.sm,
    gap: SPACE.sm,
    header: ui.header({
      title: "Preview Console",
      subtitle: activeTheme.label,
      actions: [ui.badge("Preview", { variant: "info" })],
    }),
    body: ui.column({ gap: SPACE.xs, width: "100%", height: "100%" }, [
      ui.breadcrumb({
        items: [{ label: "Bridge" }, { label: "Settings" }, { label: "Theme Preview" }],
      }),
      ui.row({ gap: SPACE.xs }, [
        ui.tag("Accent", { variant: activeTheme.badge }),
        ui.status("online", { label: "Ready" }),
      ]),
    ]),
    footer: ui.statusBar({
      left: [ui.text("Preview status")],
      right: [ui.text(`Theme ${activeTheme.label}`)],
      style: {
        bg: tokens.bg.panel.inset,
        fg: tokens.text.primary,
      },
    }),
  });

  return ui.column({ gap: SPACE.sm, width: "100%" }, [
    surfacePanel(tokens, "Theme Preview", [
      sectionHeader(tokens, "Theme Modes", "Changes apply instantly across the console"),
      ui.grid(
        {
          columns: 3,
          gap: SPACE.xs,
        },
        ui.button({
          id: "settings-theme-day",
          label: "Day Shift",
          intent: state.themeName === "day" ? "primary" : "secondary",
          onPress: () => deps.dispatch({ type: "set-theme", theme: "day" }),
        }),
        ui.button({
          id: "settings-theme-night",
          label: "Night Shift",
          intent: state.themeName === "night" ? "primary" : "secondary",
          onPress: () => deps.dispatch({ type: "set-theme", theme: "night" }),
        }),
        ui.button({
          id: "settings-theme-alert",
          label: "Red Alert",
          intent: state.themeName === "alert" ? "primary" : "secondary",
          onPress: () => deps.dispatch({ type: "set-theme", theme: "alert" }),
        }),
      ),
      ui.row({ gap: SPACE.sm, wrap: true }, [
        ui.icon("ui.palette"),
        ui.text(`Active theme: ${activeTheme.label}`, { variant: "caption" }),
      ]),
      ui.center(previewPage),
    ], { tone: "base" }),
    surfacePanel(tokens, "Keybinding Reference", [
      ui.keybindingHelp(deps.getBindings ? deps.getBindings() : [], {
        title: "Ship Controls",
      }),
    ], { tone: "inset" }),
  ]);
}

export function renderSettingsScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  return renderShell({
    title: "Ship Settings",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [
      SettingsDeck({
        key: "settings-deck",
        state: context.state,
        dispatch: deps.dispatch,
      }),
    ]),
    rightRail: settingsRightRail(context.state, deps),
  });
}
