import {
  type Toast,
  type VNode,
  addToast,
  createApp,
  filterExpiredToasts,
  removeToast,
  rgb,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type Plan = "starter" | "growth" | "enterprise";
type BillingCycle = "monthly" | "annual";
type KeyMode = "insert" | "command";

type State = {
  section: number;
  mode: KeyMode;
  name: string;
  email: string;
  company: string;
  role: string;
  workspace: string;
  plan: Plan;
  billing: BillingCycle;
  seats: string;
  region: string;
  ssoRequired: boolean;
  auditNotes: string;
  termsAccepted: boolean;
  notes: string;
  toasts: readonly Toast[];
  showHelp: boolean;
  status: string;
};

type ValidationErrors = {
  name?: string;
  email?: string;
  workspace?: string;
  seats?: string;
  terms?: string;
};

const sections = Object.freeze([
  { id: "profile", label: "Profile", hint: "Owner identity and contact channels." },
  { id: "workspace", label: "Workspace", hint: "Environment shape, capacity, and region." },
  { id: "security", label: "Security", hint: "Access defaults and governance metadata." },
  { id: "review", label: "Review", hint: "Confirm terms and submit for provisioning." },
] as const);
type SectionId = (typeof sections)[number]["id"];

const initialState: State = {
  section: 0,
  mode: "insert",
  name: "",
  email: "",
  company: "",
  role: "",
  workspace: "",
  plan: "growth",
  billing: "annual",
  seats: "5",
  region: "us-east",
  ssoRequired: true,
  auditNotes: "",
  termsAccepted: false,
  notes: "",
  toasts: Object.freeze([]),
  showHelp: false,
  status: "Draft not saved",
};

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState,
});

const colors = {
  accent: rgb(88, 204, 242),
  muted: rgb(142, 152, 170),
  panel: rgb(20, 26, 38),
  panelAlt: rgb(28, 36, 50),
  ok: rgb(120, 220, 170),
  warn: rgb(250, 191, 109),
  danger: rgb(255, 128, 126),
  ink: rgb(10, 14, 24),
  inkSoft: rgb(34, 42, 60),
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function panel(title: string, children: readonly VNode[], flex = 1): VNode {
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

function withError(error: string | undefined): { error: string } | Record<string, never> {
  return error ? { error } : {};
}

function nowLabel(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function currentSection(state: Readonly<State>): SectionId {
  return sections[state.section]?.id ?? "profile";
}

function parseSeatCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

function getValidationErrors(state: Readonly<State>): ValidationErrors {
  const errors: ValidationErrors = {};

  if (state.name.trim().length < 2) {
    errors.name = "Enter a full owner name.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
    errors.email = "Enter a valid work email.";
  }

  if (!/^[a-z0-9-]{3,30}$/.test(state.workspace.trim())) {
    errors.workspace = "Use 3-30 chars: lowercase letters, numbers, dashes.";
  }

  const seats = parseSeatCount(state.seats);
  if (seats === null || seats < 1 || seats > 500) {
    errors.seats = "Seats must be an integer between 1 and 500.";
  }

  if (!state.termsAccepted) {
    errors.terms = "Accept terms before submitting.";
  }

  return errors;
}

function completionPercent(state: Readonly<State>): number {
  let complete = 0;
  if (state.name.trim().length >= 2) complete += 1;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) complete += 1;
  if (/^[a-z0-9-]{3,30}$/.test(state.workspace.trim())) complete += 1;

  const seats = parseSeatCount(state.seats);
  if (seats !== null && seats >= 1 && seats <= 500) complete += 1;
  if (state.termsAccepted) complete += 1;

  return Math.round((complete / 5) * 100);
}

const toastCreatedAt = new Map<string, number>();
let toastCounter = 0;

function dismissToast(id: string): void {
  toastCreatedAt.delete(id);
  app.update((state) => ({
    ...state,
    toasts: removeToast(state.toasts, id),
  }));
}

function notify(type: Toast["type"], message: string, duration = 2200): void {
  const id = `toast-${String(Date.now())}-${String(toastCounter++)}`;
  const createdAt = Date.now();
  toastCreatedAt.set(id, createdAt);
  const toast: Toast = { id, type, message, duration };
  app.update((state) => ({
    ...state,
    toasts: addToast(state.toasts, toast),
  }));
}

function switchMode(mode: KeyMode): void {
  if (app.getMode() === mode) return;
  app.setMode(mode);
  app.update((state) => ({
    ...state,
    mode,
    status: `${mode} mode`,
  }));
}

function jumpToSection(section: number): void {
  const nextSection = clamp(section, 0, sections.length - 1);
  const nextLabel = sections[nextSection]?.label ?? "Section";
  app.update((state) => ({
    ...state,
    section: nextSection,
    status: `Focused ${nextLabel}`,
  }));
}

function moveSection(delta: number): void {
  app.update((state) => {
    const nextSection = clamp(state.section + delta, 0, sections.length - 1);
    if (nextSection === state.section) return state;
    const nextLabel = sections[nextSection]?.label ?? "Section";
    return {
      ...state,
      section: nextSection,
      status: `Focused ${nextLabel}`,
    };
  });
}

function saveDraft(): void {
  const stamp = nowLabel();
  app.update((state) => ({
    ...state,
    status: `Draft saved at ${stamp}`,
  }));
  notify("info", "Draft saved");
}

function resetForm(): void {
  app.update((state) => ({
    ...initialState,
    mode: state.mode,
    toasts: state.toasts,
    showHelp: false,
    status: "Form reset to defaults",
  }));
  notify("warning", "Form reset");
}

function submitForm(): void {
  const toast = {
    type: "success" as Toast["type"],
    message: "Provisioning request submitted.",
  };

  app.update((state) => {
    const errors = getValidationErrors(state);
    const errorCount = Object.keys(errors).length;
    if (errorCount > 0) {
      toast.type = "error";
      toast.message = "Fix validation errors before submit.";
      return {
        ...state,
        section: 3,
        status: `Submission blocked (${String(errorCount)} validation errors)`,
      };
    }

    toast.type = "success";
    toast.message = "Provisioning request submitted.";
    return {
      ...state,
      section: 3,
      status: `Submitted at ${nowLabel()}`,
    };
  });

  notify(toast.type, toast.message, 2800);
}

function renderSectionFields(state: Readonly<State>, errors: ValidationErrors): readonly VNode[] {
  const section = currentSection(state);

  if (section === "profile") {
    return [
      ui.field({
        label: "Owner name",
        required: true,
        hint: "The primary contact for this workspace.",
        ...withError(errors.name),
        children: ui.input({
          id: "name",
          value: state.name,
          onInput: (value) => app.update((s) => ({ ...s, name: value })),
        }),
      }),
      ui.field({
        label: "Work email",
        required: true,
        hint: "Used for alerts, invoices, and security notices.",
        ...withError(errors.email),
        children: ui.input({
          id: "email",
          value: state.email,
          onInput: (value) => app.update((s) => ({ ...s, email: value })),
        }),
      }),
      ui.field({
        label: "Company",
        hint: "Optional, but used for invoice naming.",
        children: ui.input({
          id: "company",
          value: state.company,
          onInput: (value) => app.update((s) => ({ ...s, company: value })),
        }),
      }),
      ui.field({
        label: "Role",
        hint: "Example: Platform Engineer, CTO, Ops Lead.",
        children: ui.input({
          id: "role",
          value: state.role,
          onInput: (value) => app.update((s) => ({ ...s, role: value })),
        }),
      }),
    ];
  }

  if (section === "workspace") {
    return [
      ui.field({
        label: "Workspace slug",
        required: true,
        hint: "Lowercase letters, numbers, dashes.",
        ...withError(errors.workspace),
        children: ui.input({
          id: "workspace",
          value: state.workspace,
          onInput: (value) => app.update((s) => ({ ...s, workspace: value })),
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
        label: "Billing cycle",
        children: ui.select({
          id: "billing",
          value: state.billing,
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual (2 months free)" },
          ],
          onChange: (value) => app.update((s) => ({ ...s, billing: value as BillingCycle })),
        }),
      }),
      ui.field({
        label: "Seats",
        required: true,
        hint: "Valid range: 1-500 seats.",
        ...withError(errors.seats),
        children: ui.input({
          id: "seats",
          value: state.seats,
          onInput: (value) => app.update((s) => ({ ...s, seats: value })),
        }),
      }),
      ui.field({
        label: "Primary region",
        children: ui.select({
          id: "region",
          value: state.region,
          options: [
            { value: "us-east", label: "US East (N. Virginia)" },
            { value: "us-west", label: "US West (Oregon)" },
            { value: "eu-central", label: "EU Central (Frankfurt)" },
            { value: "ap-south", label: "AP South (Mumbai)" },
          ],
          onChange: (value) => app.update((s) => ({ ...s, region: value })),
        }),
      }),
    ];
  }

  if (section === "security") {
    return [
      ui.field({
        label: "Identity defaults",
        hint: "SSO is recommended for teams above 20 seats.",
        children: ui.checkbox({
          id: "sso-required",
          label: "Require SSO for all project members",
          checked: state.ssoRequired,
          onChange: (checked) => app.update((s) => ({ ...s, ssoRequired: checked })),
        }),
      }),
      ui.field({
        label: "Audit notes",
        hint: "Internal notes for policy and compliance reviewers.",
        children: ui.input({
          id: "audit-notes",
          value: state.auditNotes,
          onInput: (value) => app.update((s) => ({ ...s, auditNotes: value })),
        }),
      }),
      ui.field({
        label: "Provisioning notes",
        hint: "These notes are included in the handoff ticket.",
        children: ui.input({
          id: "notes",
          value: state.notes,
          onInput: (value) => app.update((s) => ({ ...s, notes: value })),
        }),
      }),
    ];
  }

  return [
    ui.field({
      label: "Final confirmation",
      required: true,
      hint: "Required to submit provisioning.",
      ...withError(errors.terms),
      children: ui.checkbox({
        id: "terms-accepted",
        label: "I confirm pricing, policy, and data residency terms.",
        checked: state.termsAccepted,
        onChange: (checked) => app.update((s) => ({ ...s, termsAccepted: checked })),
      }),
    }),
    ui.field({
      label: "Submission notes",
      hint: "Optional context for onboarding reviewers.",
      children: ui.input({
        id: "submit-notes",
        value: state.notes,
        onInput: (value) => app.update((s) => ({ ...s, notes: value })),
      }),
    }),
  ];
}

app.view((state) => {
  const errors = getValidationErrors(state);
  const errorCount = Object.keys(errors).length;
  const completion = completionPercent(state);
  const activeSection = sections[state.section];
  const sectionLabel = activeSection?.label ?? "Profile";
  const sectionHint = activeSection?.hint ?? "Owner identity and contact channels.";
  const seatCount = parseSeatCount(state.seats);

  return ui.layers([
    ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
        ui.row({ gap: 2, items: "center" }, [
          ui.text(`Mode: ${state.mode.toUpperCase()}`, {
            fg: state.mode === "insert" ? colors.ok : colors.warn,
            bold: true,
          }),
          ui.text(`Completion: ${String(completion)}%`, {
            fg: completion === 100 ? colors.ok : colors.accent,
          }),
          ui.text(`Errors: ${String(errorCount)}`, {
            fg: errorCount === 0 ? colors.ok : colors.danger,
          }),
        ]),
      ]),

      ui.row({ flex: 1, gap: 1, items: "stretch" }, [
        panel(
          "Sections",
          [
            ui.column(
              { gap: 1 },
              sections.map((section, index) => {
                const active = index === state.section;
                return ui.column(
                  {
                    key: section.id,
                    gap: 0,
                    style: active
                      ? { bg: colors.inkSoft, fg: colors.accent }
                      : { fg: colors.muted },
                  },
                  [
                    ui.text(`${active ? ">" : " "} ${section.label}`, { bold: active }),
                    ui.text(`  ${section.hint}`, { fg: colors.muted }),
                  ],
                );
              }),
            ),
          ],
          1,
        ),

        panel(
          `Form Editor: ${sectionLabel}`,
          [
            ui.column({ gap: 1 }, [
              ui.text(sectionHint, { fg: colors.muted }),
              ...renderSectionFields(state, errors),
            ]),
          ],
          2,
        ),

        panel(
          "Review",
          [
            ui.column({ gap: 1 }, [
              ui.text("Summary", { fg: colors.accent, bold: true }),
              ui.text(`Owner: ${state.name || "-"}`),
              ui.text(`Email: ${state.email || "-"}`),
              ui.text(`Workspace: ${state.workspace || "-"}`),
              ui.text(`Plan: ${state.plan} (${state.billing})`),
              ui.text(`Seats: ${seatCount !== null ? String(seatCount) : "-"}`),
              ui.text(`Region: ${state.region}`),
              ui.text(`SSO required: ${state.ssoRequired ? "Yes" : "No"}`),
              ui.text(`Terms accepted: ${state.termsAccepted ? "Yes" : "No"}`),
              ui.divider({ char: "-" }),
              ui.text(state.status, {
                fg: errorCount === 0 ? colors.ok : colors.warn,
              }),
              ui.row({ gap: 1 }, [
                ui.button({ id: "save-draft", label: "Save Draft", onPress: () => saveDraft() }),
                ui.button({ id: "submit-form", label: "Submit", onPress: () => submitForm() }),
              ]),
              ui.button({ id: "reset-form", label: "Reset Form", onPress: () => resetForm() }),
            ]),
          ],
          1,
        ),
      ]),

      ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
        ui.row({ justify: "between", items: "center" }, [
          ui.text(
            state.mode === "insert"
              ? "Insert mode: type fields directly"
              : "Command mode: chords active",
          ),
          ui.row({ gap: 1 }, [
            ui.kbd("tab"),
            ui.text("Focus"),
            ui.kbd("esc"),
            ui.text("Command mode"),
            ui.kbd("i"),
            ui.text("Insert mode"),
            ui.kbd("g p"),
            ui.text("Jump section"),
            ui.kbd("z s"),
            ui.text("Save"),
            ui.kbd("q"),
            ui.text("Quit"),
          ]),
        ]),
      ]),
    ]),
    state.showHelp
      ? ui.modal({
          id: "help-modal",
          title: "Controls and Chords",
          width: 72,
          backdrop: "dim",
          content: ui.column({ gap: 1 }, [
            ui.text("Insert mode", { fg: colors.accent, bold: true }),
            ui.text("esc -> command mode, ctrl+s save, ctrl+r reset, ctrl+enter submit"),
            ui.divider({ char: "-" }),
            ui.text("Command mode", { fg: colors.accent, bold: true }),
            ui.text("i -> insert mode"),
            ui.text("g p / g w / g s / g r -> jump Profile/Workspace/Security/Review"),
            ui.text("z s -> save draft, z r -> reset form, enter -> submit"),
            ui.divider({ char: "-" }),
            ui.text("Global"),
            ui.text("? toggles this overlay, q exits"),
          ]),
          actions: [
            ui.button({
              id: "close-help",
              label: "Close",
              onPress: () => app.update((s) => ({ ...s, showHelp: false })),
            }),
          ],
          onClose: () => app.update((s) => ({ ...s, showHelp: false })),
          initialFocus: "close-help",
        })
      : null,
    ui.toastContainer({
      toasts: state.toasts,
      position: "bottom-right",
      maxVisible: 4,
      frameStyle: {
        background: colors.panelAlt,
        foreground: colors.muted,
        border: colors.accent,
      },
      onDismiss: (id) => dismissToast(id),
    }),
  ]);
});

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
  "?": () => app.update((state) => ({ ...state, showHelp: !state.showHelp })),
});

app.modes({
  insert: {
    parent: "default",
    bindings: {
      escape: () => switchMode("command"),
      "ctrl+s": () => saveDraft(),
      "ctrl+r": () => resetForm(),
      "ctrl+down": () => moveSection(1),
      "ctrl+up": () => moveSection(-1),
      "ctrl+enter": () => submitForm(),
    },
  },
  command: {
    parent: "default",
    bindings: {
      i: () => switchMode("insert"),
      h: () => moveSection(-1),
      l: () => moveSection(1),
      "g p": () => jumpToSection(0),
      "g w": () => jumpToSection(1),
      "g s": () => jumpToSection(2),
      "g r": () => jumpToSection(3),
      "z s": () => saveDraft(),
      "z r": () => resetForm(),
      enter: () => submitForm(),
    },
  },
});

app.setMode("insert");

const toastSweepTimer = setInterval(() => {
  const now = Date.now();
  app.update((state) => {
    const filteredToasts = filterExpiredToasts(state.toasts, now, toastCreatedAt);
    if (filteredToasts.length === state.toasts.length) return state;

    const activeIds = new Set(filteredToasts.map((toast) => toast.id));
    for (const id of toastCreatedAt.keys()) {
      if (!activeIds.has(id)) toastCreatedAt.delete(id);
    }

    return {
      ...state,
      toasts: filteredToasts,
    };
  });
}, 250);

try {
  await app.start();
} finally {
  clearInterval(toastSweepTimer);
}
