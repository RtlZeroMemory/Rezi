import { ui, type RouteRenderContext, type VNode } from "@rezi-ui/core";
import { stylesForTheme, themeSpec } from "../theme.js";
import type { RouteDeps, StarshipState } from "../types.js";
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

export function renderSettingsScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  const state = context.state;
  const styles = stylesForTheme(state.themeName);
  const activeTheme = themeSpec(state.themeName);
  const error = validationError(state);

  const previewPage = ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: "Preview Console",
      subtitle: activeTheme.label,
      actions: [ui.badge("Preview", { variant: "info" })],
    }),
    body: ui.column({ gap: 1 }, [
      ui.breadcrumb({
        items: [{ label: "Bridge" }, { label: "Settings" }, { label: "Theme Preview" }],
      }),
      ui.row({ gap: 1 }, [
        ui.tag("Accent", { variant: activeTheme.badge }),
        ui.status("online", { label: "Ready" }),
      ]),
    ]),
    footer: ui.statusBar({
      left: [ui.text("Preview status")],
      right: [ui.text(`Theme ${activeTheme.label}`)],
    }),
  });

  const content = ui.card(
    {
      title: "Ship Settings",
      style: styles.panelStyle,
    },
    [
      ui.column({ gap: 1 }, [
        error
          ? ui.callout(error, {
              title: "Validation",
              variant: "error",
            })
          : ui.callout("All settings are valid.", {
              title: "Validation",
              variant: "success",
            }),
        ui.form({ id: "settings-form", gap: 1 }, [
          ui.field({
            label: "Ship Name",
            required: true,
            ...(state.shipName.trim().length === 0 ? { error: "Name required" } : {}),
            children: ui.input({
              id: "settings-ship-name",
              value: state.shipName,
              placeholder: "USS Rezi",
              onInput: (value) => deps.dispatch({ type: "set-ship-name", name: value }),
            }),
          }),
          ui.field({
            label: "Alert Threshold",
            hint: "Value used by engineering warnings",
            children: ui.slider({
              id: "settings-alert-threshold",
              min: 20,
              max: 95,
              step: 1,
              label: "Threshold",
              value: state.alertThreshold,
              onChange: (threshold) => deps.dispatch({ type: "set-alert-threshold", threshold }),
            }),
          }),
          ui.field({
            label: "Default Channel",
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
                deps.dispatch({
                  type: "set-default-channel",
                  channel: value as StarshipState["defaultChannel"],
                }),
            }),
          }),
          ui.field({
            label: "Autopilot",
            children: ui.checkbox({
              id: "settings-autopilot",
              checked: state.autopilot,
              label: "Enable autopilot by default",
              onChange: () => deps.dispatch({ type: "toggle-autopilot" }),
            }),
          }),
          ui.field({
            label: "Notifications",
            children: ui.radioGroup({
              id: "settings-notifications-mode",
              value: state.notificationsMode,
              direction: "horizontal",
              options: [
                { value: "all", label: "All" },
                { value: "critical", label: "Critical" },
                { value: "none", label: "None" },
              ],
              onChange: (mode) =>
                deps.dispatch({
                  type: "set-notifications-mode",
                  mode: mode as StarshipState["notificationsMode"],
                }),
            }),
          }),
          ui.field({
            label: "Captain's Notes",
            children: ui.textarea({
              id: "settings-notes",
              value: state.settingsNotes,
              rows: 5,
              placeholder: "Operational notes",
              onInput: (notes) => deps.dispatch({ type: "set-settings-notes", notes }),
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
                deps.dispatch({
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
            onPress: () => deps.dispatch({ type: "toggle-reset-dialog" }),
          }),
          ui.button({
            id: "settings-cycle-theme",
            label: "Cycle Theme",
            intent: "link",
            onPress: () => deps.dispatch({ type: "cycle-theme" }),
          }),
        ]),
        ui.divider(),
        ui.panel("Theme Preview", [
          ui.grid(
            {
              columns: 3,
              gap: 1,
            },
            ui.button({
              id: "theme-day",
              label: "Day Shift",
              intent: state.themeName === "day" ? "primary" : "secondary",
              onPress: () => deps.dispatch({ type: "set-theme", theme: "day" }),
            }),
            ui.button({
              id: "theme-night",
              label: "Night Shift",
              intent: state.themeName === "night" ? "primary" : "secondary",
              onPress: () => deps.dispatch({ type: "set-theme", theme: "night" }),
            }),
            ui.button({
              id: "theme-alert",
              label: "Red Alert",
              intent: state.themeName === "alert" ? "primary" : "secondary",
              onPress: () => deps.dispatch({ type: "set-theme", theme: "alert" }),
            }),
          ),
          ui.row({ gap: 1, wrap: true }, [
            ui.icon("ui.palette"),
            ui.text(`Active theme: ${activeTheme.label}`, { variant: "caption" }),
            ui.spacer({ flex: 1 }),
            ui.kbd(["Ctrl", "R"]),
            ui.text("reset", { variant: "caption" }),
          ]),
          ui.center(previewPage),
        ]),
        ui.panel("Keybinding Reference", [
          ui.keybindingHelp(deps.getBindings ? deps.getBindings() : [], {
            title: "Ship Controls",
          }),
        ]),
      ]),
    ],
  );

  return renderShell({
    title: "Ship Settings",
    context,
    deps,
    body: ui.layers([
      content,
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
                onPress: () => deps.dispatch({ type: "reset-settings" }),
              },
              {
                id: "settings-reset-cancel",
                label: "Cancel",
                onPress: () => deps.dispatch({ type: "toggle-reset-dialog" }),
              },
            ],
            onClose: () => deps.dispatch({ type: "toggle-reset-dialog" }),
            width: 52,
          })
        : null,
    ]),
  });
}
