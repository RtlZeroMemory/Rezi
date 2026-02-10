import { createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type Plan = "starter" | "growth" | "enterprise";

type State = {
  section: number;
  name: string;
  email: string;
  company: string;
  plan: Plan;
  seats: string;
  newsletter: boolean;
  notes: string;
  status: string;
};

const sections = ["Profile", "Plan", "Review"] as const;

const initialState: State = {
  section: 0,
  name: "",
  email: "",
  company: "",
  plan: "growth",
  seats: "5",
  newsletter: true,
  notes: "",
  status: "Draft",
};

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState,
});

const colors = {
  accent: rgb(116, 200, 255),
  muted: rgb(140, 150, 170),
  panel: rgb(18, 22, 34),
  panelAlt: rgb(22, 28, 44),
  ok: rgb(130, 220, 170),
  ink: rgb(10, 14, 24),
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function panel(title: string, children: ReturnType<typeof ui.column>[], flex = 1) {
  return ui.box(
    {
      title,
      flex,
      border: "rounded",
      px: 1,
      py: 0,
      style: { bg: colors.panel, fg: colors.muted },
    },
    children,
  );
}

app.view((state) => {
  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
      ui.text(`Status: ${state.status}`, { fg: colors.ok, bold: true }),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Sections",
        [
          ui.column(
            { gap: 0 },
            sections.map((label, index) => {
              const active = index === state.section;
              return ui.text(`${active ? ">" : " "} ${label}`, {
                key: label,
                fg: active ? colors.accent : colors.muted,
                bold: active,
              });
            }),
          ),
        ],
        1,
      ),

      panel(
        "Customer Details",
        [
          ui.column({ gap: 1 }, [
            ui.field({
              label: "Name",
              required: true,
              children: ui.input({
                id: "name",
                value: state.name,
                placeholder: "Ada Lovelace",
                onInput: (value) => app.update((s) => ({ ...s, name: value })),
              }),
            }),
            ui.field({
              label: "Email",
              required: true,
              children: ui.input({
                id: "email",
                value: state.email,
                placeholder: "ada@lovelace.io",
                onInput: (value) => app.update((s) => ({ ...s, email: value })),
              }),
            }),
            ui.field({
              label: "Company",
              children: ui.input({
                id: "company",
                value: state.company,
                placeholder: "Analytical Engines Ltd",
                onInput: (value) => app.update((s) => ({ ...s, company: value })),
              }),
            }),
            ui.field({
              label: "Plan",
              children: ui.select({
                id: "plan",
                value: state.plan,
                options: [
                  { value: "starter", label: "Starter" },
                  { value: "growth", label: "Growth" },
                  { value: "enterprise", label: "Enterprise" },
                ],
                onChange: (value) => app.update((s) => ({ ...s, plan: value as Plan })),
              }),
            }),
            ui.field({
              label: "Seats",
              children: ui.input({
                id: "seats",
                value: state.seats,
                onInput: (value) => app.update((s) => ({ ...s, seats: value })),
              }),
            }),
            ui.checkbox({
              id: "newsletter",
              label: "Subscribe to release notes",
              checked: state.newsletter,
              onChange: (checked) => app.update((s) => ({ ...s, newsletter: checked })),
            }),
          ]),
        ],
        2,
      ),

      panel(
        "Preview",
        [
          ui.column({ gap: 1 }, [
            ui.text("Summary", { fg: colors.accent, bold: true }),
            ui.text(`Name: ${state.name || "-"}`),
            ui.text(`Email: ${state.email || "-"}`),
            ui.text(`Company: ${state.company || "-"}`),
            ui.text(`Plan: ${state.plan}`),
            ui.text(`Seats: ${state.seats || "-"}`),
            ui.text(`Newsletter: ${state.newsletter ? "Yes" : "No"}`),
            ui.divider({ char: "-" }),
            ui.text("Notes"),
            ui.text(state.notes || "Add internal notes in Review."),
            ui.button({
              id: "save",
              label: "Save draft",
              onPress: () =>
                app.update((s) => ({
                  ...s,
                  status: `Saved at ${new Date().toLocaleTimeString()}`,
                })),
            }),
          ]),
        ],
        1,
      ),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text("Form flow ready"),
        ui.row({ gap: 1 }, [
          ui.kbd("tab"),
          ui.text("Focus"),
          ui.kbd("ctrl+s"),
          ui.text("Save"),
          ui.kbd("ctrl+r"),
          ui.text("Reset"),
          ui.kbd("q"),
          ui.text("Quit"),
        ]),
      ]),
    ]),
  ]);
});

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
  "ctrl+s": () =>
    app.update((s) => ({
      ...s,
      status: `Saved at ${new Date().toLocaleTimeString()}`,
    })),
  "ctrl+r": () => app.update(() => ({ ...initialState })),
  "ctrl+up": () =>
    app.update((s) => ({
      ...s,
      section: clamp(s.section - 1, 0, sections.length - 1),
    })),
  "ctrl+down": () =>
    app.update((s) => ({
      ...s,
      section: clamp(s.section + 1, 0, sections.length - 1),
    })),
});

await app.start();
