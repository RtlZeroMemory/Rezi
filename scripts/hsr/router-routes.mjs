import { rgb, ui } from "@rezi-ui/core";

const palette = Object.freeze({
  bg: rgb(7, 12, 20),
  panel: rgb(13, 22, 35),
  panelAlt: rgb(20, 30, 45),
  ink: rgb(224, 236, 247),
  muted: rgb(142, 166, 192),
  accent: rgb(116, 199, 255),
  success: rgb(121, 218, 163),
  warning: rgb(255, 179, 113),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createRouterDemoRoutes(deps) {
  return Object.freeze([
    {
      id: "home",
      title: "Home",
      keybinding: "ctrl+1",
      screen: (_params, ctx) =>
        ui.page({
          p: 1,
          gap: 1,
          header: ui.box({ border: "double", p: 1, style: { fg: palette.ink, bg: palette.bg } }, [
            ui.row({ justify: "between", items: "center" }, [
              ui.richText([
                { text: "Router HSR ", style: { fg: palette.accent, bold: true } },
                { text: "Home Screen", style: { fg: palette.ink, bold: true } },
              ]),
              ui.row({ gap: 1 }, [ui.badge("ROUTE", { variant: "info" }), ui.status("online")]),
            ]),
            ui.text("Edit scripts/hsr/router-routes.mjs and save to hot-swap the route table.", {
              variant: "caption",
              style: { fg: palette.muted },
            }),
          ]),
          body: ui.column({ gap: 1 }, [
            ui.panel(
              {
                title: "Navigation",
                variant: "heavy",
                style: { fg: palette.ink, bg: palette.panel },
              },
              [
                ui.row({ gap: 2, items: "center" }, [
                  ui.button({
                    id: "inc-home",
                    label: "+1",
                    onPress: deps.onIncrement,
                    style: { fg: palette.success, bold: true },
                  }),
                  ui.text(`Count: ${String(ctx.state.count)}`, {
                    variant: "heading",
                    style: { fg: palette.accent, bold: true },
                  }),
                  ui.button({
                    id: "go-form",
                    label: "Go to Form",
                    onPress: () => deps.onNavigate("form"),
                    style: { fg: palette.warning, bold: true },
                  }),
                ]),
                ui.progress(clamp01((ctx.state.count + 10) / 20), {
                  label: "Demo meter",
                  showPercent: true,
                  style: { fg: palette.accent },
                  trackStyle: { fg: palette.muted },
                }),
              ],
            ),
            ui.callout("Keys: ctrl+1 home, ctrl+2 form, ctrl+q quit", { variant: "info" }),
          ]),
          footer: ui.row({ gap: 1 }, [
            ui.tag("Hot route swap", { variant: "success" }),
            ui.tag("State preserved", { variant: "info" }),
          ]),
        }),
    },
    {
      id: "form",
      title: "Form",
      keybinding: "ctrl+2",
      screen: (_params, ctx) =>
        ui.page({
          p: 1,
          gap: 1,
          header: ui.box({ border: "double", p: 1, style: { fg: palette.ink, bg: palette.bg } }, [
            ui.row({ justify: "between", items: "center" }, [
              ui.richText([
                { text: "Router HSR ", style: { fg: palette.accent, bold: true } },
                { text: "Form Screen", style: { fg: palette.ink, bold: true } },
              ]),
              ui.row({ gap: 1 }, [ui.badge("FORM", { variant: "warning" }), ui.status("away")]),
            ]),
            ui.text("Keep cursor in Name/Notes, edit the routes module, then continue typing.", {
              variant: "caption",
              style: { fg: palette.muted },
            }),
          ]),
          body: ui.column({ gap: 1 }, [
            ui.panel(
              {
                title: "Profile Editor",
                variant: "rounded",
                style: { fg: palette.ink, bg: palette.panelAlt },
              },
              [
                ui.text("Name", { variant: "caption", style: { fg: palette.muted } }),
                ui.input({
                  id: "name",
                  value: ctx.state.name,
                  onInput: (value) => deps.onNameInput(value),
                  style: { fg: palette.ink },
                }),
                ui.text("Notes", { variant: "caption", style: { fg: palette.muted } }),
                ui.input({
                  id: "notes",
                  value: ctx.state.notes,
                  onInput: (value) => deps.onNotesInput(value),
                  style: { fg: palette.ink },
                }),
              ],
            ),
            ui.panel(
              {
                title: "Actions",
                variant: "rounded",
                style: { fg: palette.ink, bg: palette.panel },
              },
              [
                ui.row({ gap: 2 }, [
                  ui.button({
                    id: "dec-form",
                    label: "-1",
                    onPress: deps.onDecrement,
                    style: { fg: palette.warning, bold: true },
                  }),
                  ui.button({
                    id: "go-home",
                    label: "Back to Home",
                    onPress: () => deps.onNavigate("home"),
                    style: { fg: palette.success, bold: true },
                  }),
                ]),
                ui.callout(`Preview: ${ctx.state.name}`, { variant: "info" }),
              ],
            ),
          ]),
          footer: ui.row({ gap: 1 }, [
            ui.tag("ctrl+1 home", { variant: "info" }),
            ui.tag("ctrl+2 form", { variant: "warning" }),
          ]),
        }),
    },
  ]);
}
