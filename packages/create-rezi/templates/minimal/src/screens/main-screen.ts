import type { VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { PRODUCT_NAME, PRODUCT_TAGLINE, TEMPLATE_LABEL, themeSpec } from "../theme.js";
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

  const content = ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: PRODUCT_NAME,
      subtitle: PRODUCT_TAGLINE,
      actions: [
        ui.badge(TEMPLATE_LABEL, { variant: "info" }),
        ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
      ],
    }),
    body: ui.column({ gap: 1 }, [
      ui.panel("Counter", [
        ui.column({ gap: 1 }, [
          ui.text(`Count: ${String(state.count)}`, { variant: "heading" }),
          ui.toolbar({ gap: 1 }, [
            ui.button({ id: "dec", label: "-1", onPress: handlers.onDecrement }),
            ui.button({
              id: "inc",
              label: "+1",
              intent: "primary",
              onPress: handlers.onIncrement,
            }),
            ui.button({ id: "theme", label: "Cycle Theme", onPress: handlers.onCycleTheme }),
            ui.button({ id: "help", label: "Help", intent: "link", onPress: handlers.onToggleHelp }),
          ]),
        ]),
      ]),
      state.lastError
        ? ui.panel("Alerts", [
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
        : ui.panel("Status", [ui.text("No runtime error. Press e to simulate one.")]),
    ]),
    footer: ui.statusBar({
      left: [ui.status("online"), ui.text("Ready")],
      right: [ui.text("Keys: q quit · ? help · +/- counter · t theme · e error")],
    }),
  });

  if (!state.showHelp) return content;

  return ui.layers([
    content,
    ui.modal({
      id: "minimal-help-modal",
      title: `${PRODUCT_NAME} Help`,
      width: 62,
      backdrop: "none",
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
