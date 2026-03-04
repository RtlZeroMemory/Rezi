import type { VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { PRODUCT_NAME, PRODUCT_TAGLINE, TEMPLATE_LABEL, stylesForTheme, themeSpec } from "../theme.js";
import type { MinimalState } from "../types.js";

type ScreenHandlers = Readonly<{
  onIncrement: () => void;
  onDecrement: () => void;
  onCycleTheme: () => void;
  onToggleHelp: () => void;
  onClearError: () => void;
}>;

export function renderMainScreen(state: MinimalState, handlers: ScreenHandlers): VNode {
  const theme = themeSpec(state.themeName);
  const styles = stylesForTheme(state.themeName);

  const page = ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: PRODUCT_NAME,
      subtitle: PRODUCT_TAGLINE,
      actions: [
        ui.badge(TEMPLATE_LABEL, { variant: "info" }),
        ui.text(`Theme ${theme.label}`, { style: styles.mutedStyle }),
      ],
    }),
    body: ui.column({ gap: 1 }, [
      ui.panel({ title: "Counter", style: styles.panelStyle }, [
        ui.column({ gap: 1 }, [
          ui.text(`Count: ${String(state.count)}`, { variant: "heading" }),
          ui.actions([
            ui.button({ id: "dec", label: "-1", intent: "secondary", onPress: handlers.onDecrement }),
            ui.button({
              id: "inc",
              label: "+1",
              intent: "primary",
              onPress: handlers.onIncrement,
            }),
            ui.button({
              id: "theme",
              label: "Cycle Theme",
              intent: "secondary",
              onPress: handlers.onCycleTheme,
            }),
            ui.button({ id: "help", label: "Help", intent: "link", onPress: handlers.onToggleHelp }),
          ]),
        ]),
      ]),
      state.lastError
        ? ui.panel({ title: "Alerts", style: styles.panelStyle }, [
            ui.callout(state.lastError, {
              title: "Example Error Pattern",
              variant: "error",
            }),
            ui.actions([
              ui.button({
                id: "clear-error",
                label: "Clear",
                intent: "danger",
                onPress: handlers.onClearError,
              }),
            ]),
          ])
        : ui.panel({ title: "Status", style: styles.panelStyle }, [
            ui.callout("No runtime error. Press e to simulate one.", {
              title: "Healthy",
              variant: "success",
            }),
          ]),
    ]),
    footer: ui.statusBar({
      left: [ui.status("online"), ui.text("Ready", { style: styles.mutedStyle })],
      right: [ui.text("Keys: q quit · ? help · +/- counter · t theme · e error", {
        style: styles.mutedStyle,
      })],
    }),
  });

  const content = ui.box({ border: "none", p: 0, style: styles.rootStyle }, [page]);

  if (!state.showHelp) return content;

  return ui.layers([
    content,
    ui.modal({
      id: "minimal-help-modal",
      title: `${PRODUCT_NAME} Help`,
      width: 62,
      backdrop: "dim",
      returnFocusTo: "help",
      content: ui.column({ gap: 1 }, [
        ui.text("q, ctrl+c : quit"),
        ui.text("?, h : toggle help"),
        ui.text("+, - : increment/decrement counter"),
        ui.text("t : cycle theme"),
        ui.text("e : trigger example error"),
      ]),
      actions: [
        ui.button({
          id: "minimal-help-close",
          label: "Close",
          onPress: handlers.onToggleHelp,
        }),
      ],
      onClose: handlers.onToggleHelp,
    }),
  ]);
}
