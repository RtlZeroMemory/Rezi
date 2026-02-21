import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { PRODUCT_NAME, PRODUCT_TAGLINE, TEMPLATE_LABEL, stylesForTheme, themeSpec } from "../theme.js";
import type { CliState, RouteId } from "../types.js";

type ShellOptions = Readonly<{
  title: string;
  context: RouteRenderContext<CliState>;
  body: VNode;
  onNavigate: (routeId: RouteId) => void;
  onToggleHelp: () => void;
}>;

export function renderShell(options: ShellOptions): VNode {
  const state = options.context.state;
  const styles = stylesForTheme(state.themeName);
  const theme = themeSpec(state.themeName);

  const content = ui.column({ p: 1, gap: 1, items: "stretch", style: styles.rootStyle }, [
    ui.box({ border: "rounded", px: 1, py: 0, style: styles.stripStyle }, [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 1, wrap: true, items: "center" }, [
          ui.text(`${PRODUCT_NAME} · ${options.title}`, { variant: "heading" }),
          ui.badge(TEMPLATE_LABEL, { variant: "info" }),
          ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
          ui.badge(`Tick ${String(state.tick)}`, { variant: "default" }),
          ui.status(state.autoRefresh ? "online" : "away", {
            label: state.autoRefresh ? "Streaming" : "Paused",
          }),
        ]),
        ui.text(PRODUCT_TAGLINE, { style: styles.mutedStyle }),
      ]),
    ]),

    ui.row({ gap: 1, wrap: true }, [
      ui.button({ id: "go-home", label: "Home", onPress: () => options.onNavigate("home") }),
      ui.button({ id: "go-logs", label: "Logs", onPress: () => options.onNavigate("logs") }),
      ui.button({
        id: "go-settings",
        label: "Settings",
        onPress: () => options.onNavigate("settings"),
      }),
      ui.button({ id: "toggle-help", label: "Help", onPress: options.onToggleHelp }),
    ]),

    options.body,

    ui.text("Keys: F1/F2/F3 or Alt+1/2/3 · p toggle stream · h/? help · q quit", {
      style: styles.mutedStyle,
    }),
  ]);

  if (!state.showHelp) return content;

  return ui.layers([
    content,
    ui.modal({
      id: "cli-help-modal",
      title: `${PRODUCT_NAME} Shortcuts`,
      width: 70,
      backdrop: "none",
      returnFocusTo: "toggle-help",
      content: ui.column({ gap: 1 }, [
        ui.text("F1/F2/F3 : navigate to Home/Logs/Settings"),
        ui.text("Alt+1/2/3 or Ctrl+1/2/3 : route shortcuts"),
        ui.text("p : pause/resume log stream"),
        ui.text("h, ?, esc : close help"),
        ui.text("q, ctrl+c : quit"),
      ]),
      actions: [
        ui.button({
          id: "cli-help-close",
          label: "Close",
          onPress: options.onToggleHelp,
        }),
      ],
      onClose: options.onToggleHelp,
    }),
  ]);
}
