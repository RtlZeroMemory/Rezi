/**
 * Gallery Scenes - deterministic widget compositions for visual testing.
 *
 * Each scene is a pure function returning a VNode tree. Scenes are addressable
 * by name for both interactive gallery browsing and headless snapshot capture.
 */

import { type VNode, rgb, ui } from "@rezi-ui/core";

// ---------------------------------------------------------------------------
// Scene: Button Matrix
// ---------------------------------------------------------------------------

export function buttonMatrix(): VNode {
  const variants = ["solid", "soft", "outline", "ghost"] as const;
  const tones = ["default", "primary", "danger", "success", "warning"] as const;
  const sizes = ["sm", "md", "lg"] as const;

  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Button Matrix", { style: { bold: true } }),
    ui.text("Variants × Tones", { style: { dim: true } }),
    ui.divider(),
    ...variants.map((variant) =>
      ui.column({ gap: 0, key: variant }, [
        ui.text(`variant: ${variant}`, { style: { bold: true, dim: true } }),
        ui.row({ gap: 2, key: `${variant}-row` }, [
          ...tones.map((tone) =>
            ui.button({
              id: `btn-${variant}-${tone}`,
              label: tone,
              dsVariant: variant,
              dsTone: tone,
              dsSize: "md",
              key: `${variant}-${tone}`,
            }),
          ),
        ]),
      ]),
    ),
    ui.divider(),
    ui.text("Sizes", { style: { bold: true, dim: true } }),
    ui.row({ gap: 2 }, [
      ...sizes.map((size) =>
        ui.button({
          id: `btn-size-${size}`,
          label: `Size: ${size}`,
          dsVariant: "solid",
          dsTone: "primary",
          dsSize: size,
          key: `size-${size}`,
        }),
      ),
    ]),
    ui.divider(),
    ui.text("States", { style: { bold: true, dim: true } }),
    ui.row({ gap: 2 }, [
      ui.button({ id: "btn-default", label: "Default", dsVariant: "solid" }),
      ui.button({ id: "btn-disabled", label: "Disabled", dsVariant: "solid", disabled: true }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Input Showcase
// ---------------------------------------------------------------------------

export function inputShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Input Showcase", { style: { bold: true } }),
    ui.divider(),
    ui.text("Standard Input", { style: { dim: true } }),
    ui.input({ id: "input-default", value: "Hello world" }),
    ui.text("Empty with Placeholder", { style: { dim: true } }),
    ui.input({ id: "input-placeholder", value: "", placeholder: "Type here..." }),
    ui.text("Disabled Input", { style: { dim: true } }),
    ui.input({ id: "input-disabled", value: "Cannot edit", disabled: true }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Typography
// ---------------------------------------------------------------------------

export function typographyShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Typography", { style: { bold: true } }),
    ui.divider(),
    ui.text("Title Role — Bold Primary", { variant: "heading" }),
    ui.text("Label Role — Bold Primary", { variant: "label" }),
    ui.text("Body Role — Regular Primary"),
    ui.text("Caption Role — Dim Secondary", { variant: "caption" }),
    ui.text("Code Role — Monospace Accent", { variant: "code" }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Surfaces and Elevation
// ---------------------------------------------------------------------------

export function surfaceShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Surfaces & Elevation", { style: { bold: true } }),
    ui.divider(),
    ui.text("Level 0: Base Background"),
    ui.box({ border: "rounded", p: 1, key: "surface-1" }, [ui.text("Level 1: Elevated (Card)")]),
    ui.box({ border: "single", p: 1, key: "surface-2" }, [ui.text("Level 2: Overlay (Dropdown)")]),
    ui.box({ border: "heavy", p: 1, shadow: true, key: "surface-3" }, [
      ui.text("Level 3: Modal (with shadow)"),
    ]),
    // Shadow extends beyond the box rect; leave one row so footer divider does not crowd it.
    ui.spacer({ size: 1 }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Badges and Tags
// ---------------------------------------------------------------------------

export function badgeShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Badges & Tags", { style: { bold: true } }),
    ui.divider(),
    ui.row({ gap: 2 }, [
      ui.badge("default", { key: "b-default" }),
      ui.badge("success", { variant: "success", key: "b-success" }),
      ui.badge("warning", { variant: "warning", key: "b-warning" }),
      ui.badge("error", { variant: "error", key: "b-error" }),
      ui.badge("info", { variant: "info", key: "b-info" }),
    ]),
    ui.text("Tags", { style: { dim: true } }),
    ui.row({ gap: 1 }, [
      ui.tag("TypeScript", { key: "t-ts" }),
      ui.tag("Rezi", { key: "t-rezi" }),
      ui.tag("TUI", { key: "t-tui" }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Progress and Indicators
// ---------------------------------------------------------------------------

export function progressShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Progress & Indicators", { style: { bold: true } }),
    ui.divider(),
    ui.text("Progress Bars", { style: { dim: true } }),
    ui.progress(0.25, { key: "p-25" }),
    ui.progress(0.5, { key: "p-50" }),
    ui.progress(0.75, { key: "p-75" }),
    ui.progress(1.0, { key: "p-100" }),
    ui.text("Gauge", { style: { dim: true } }),
    ui.gauge(0.42, { key: "gauge" }),
    ui.text("Sparkline", { style: { dim: true } }),
    ui.sparkline([1, 3, 5, 7, 5, 3, 1, 4, 8, 2], { key: "spark" }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Callouts
// ---------------------------------------------------------------------------

export function calloutShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Callouts", { style: { bold: true } }),
    ui.divider(),
    ui.callout("This is an informational message.", { variant: "info", key: "c-info" }),
    ui.callout("Operation completed successfully.", { variant: "success", key: "c-success" }),
    ui.callout("Please review before continuing.", { variant: "warning", key: "c-warning" }),
    ui.callout("An error occurred during processing.", { variant: "error", key: "c-error" }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Checkboxes and Radio
// ---------------------------------------------------------------------------

export function checkboxShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Checkboxes & Radio Groups", { style: { bold: true } }),
    ui.divider(),
    ui.checkbox({ id: "cb-1", checked: true, label: "Checked item" }),
    ui.checkbox({ id: "cb-2", checked: false, label: "Unchecked item" }),
    ui.checkbox({ id: "cb-3", checked: true, label: "Disabled checked", disabled: true }),
    ui.divider(),
    ui.radioGroup({
      id: "rg-1",
      value: "b",
      options: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
        { value: "c", label: "Option C" },
      ],
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Dividers and Spacing
// ---------------------------------------------------------------------------

export function dividerShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Dividers & Spacing", { style: { bold: true } }),
    ui.divider(),
    ui.text("Above divider"),
    ui.divider({ char: "-" }),
    ui.text("Below dashed divider"),
    ui.spacer({ size: 2 }),
    ui.text("After 2-cell spacer"),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Select
// ---------------------------------------------------------------------------

export function selectShowcase(): VNode {
  const options = [
    { value: "us", label: "United States" },
    { value: "uk", label: "United Kingdom" },
    { value: "ca", label: "Canada" },
  ] as const;
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Select Inputs", { style: { bold: true } }),
    ui.divider(),
    ui.text("With selected value", { style: { dim: true } }),
    ui.select({
      id: "select-country",
      value: "uk",
      options,
      placeholder: "Choose a country",
    }),
    ui.text("Placeholder state", { style: { dim: true } }),
    ui.select({
      id: "select-empty",
      value: "",
      options,
      placeholder: "Choose a country",
    }),
    ui.text("Disabled", { style: { dim: true } }),
    ui.select({
      id: "select-disabled",
      value: "",
      options,
      placeholder: "Choose a country",
      disabled: true,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Navigation Widgets
// ---------------------------------------------------------------------------

export function navigationShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Navigation Widgets", { style: { bold: true } }),
    ui.divider(),
    ui.text("Tabs", { style: { dim: true } }),
    ui.tabs({
      id: "nav-tabs",
      tabs: [
        { key: "overview", label: "Overview", content: ui.text("Overview tab content") },
        { key: "alerts", label: "Alerts", content: ui.text("Alerts tab content") },
        { key: "history", label: "History", content: ui.text("History tab content") },
      ],
      activeTab: "overview",
      onChange: () => {},
      dsVariant: "outline",
      dsTone: "primary",
      dsSize: "md",
    }),
    ui.text("Accordion", { style: { dim: true } }),
    ui.accordion({
      id: "nav-accordion",
      items: [
        { key: "one", title: "Section One", content: ui.text("First section content") },
        { key: "two", title: "Section Two", content: ui.text("Second section content") },
      ],
      expanded: ["one"],
      onChange: () => {},
      dsVariant: "soft",
      dsTone: "primary",
      dsSize: "md",
    }),
    ui.row({ gap: 2 }, [
      ui.breadcrumb({
        id: "nav-breadcrumb",
        items: [{ label: "Home" }, { label: "Workspaces" }, { label: "Rezi" }],
        dsVariant: "ghost",
        dsTone: "primary",
      }),
      ui.spacer({ flex: 1 }),
      ui.pagination({
        id: "nav-pagination",
        page: 2,
        totalPages: 8,
        onChange: () => {},
        dsVariant: "soft",
        dsTone: "primary",
      }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Table
// ---------------------------------------------------------------------------

type TeamRow = Readonly<{
  id: string;
  name: string;
  role: string;
  status: "ok" | "warn" | "error";
  score: number;
}>;

const TEAM_ROWS: readonly TeamRow[] = [
  { id: "r1", name: "Alex Rivera", role: "Engineer", status: "ok", score: 97 },
  { id: "r2", name: "Sam Patel", role: "Designer", status: "warn", score: 81 },
  { id: "r3", name: "Mina Park", role: "PM", status: "ok", score: 92 },
  { id: "r4", name: "Chris Longname-For-Overflow", role: "QA", status: "error", score: 64 },
];

function statusVariant(value: unknown): "success" | "warning" | "error" {
  if (value === "warn") return "warning";
  if (value === "error") return "error";
  return "success";
}

export function tableShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Table", { style: { bold: true } }),
    ui.divider(),
    ui.table<TeamRow>({
      id: "team-table",
      columns: [
        { key: "name", header: "Name", flex: 2, overflow: "middle" },
        { key: "role", header: "Role", width: 12, overflow: "ellipsis" },
        {
          key: "status",
          header: "Status",
          width: 10,
          render: (value) => ui.badge(String(value), { variant: statusVariant(value) }),
        },
        { key: "score", header: "Score", width: 7, align: "right" },
      ],
      data: TEAM_ROWS,
      getRowKey: (row) => row.id,
      selectionMode: "single",
      selection: ["r2"],
      borderStyle: { variant: "rounded" },
      stripeStyle: {
        even: rgb(15, 20, 25),
        odd: rgb(20, 26, 34),
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Modal
// ---------------------------------------------------------------------------

export function modalShowcase(): VNode {
  return ui.layers([
    ui.column({ gap: 1, p: 1 }, [
      ui.text("Modal Overlay", { style: { bold: true } }),
      ui.divider(),
      ui.text("Background content remains mounted under modal.", { style: { dim: true } }),
      ui.text("This scene validates layering, backdrop, and action alignment."),
    ]),
    ui.modal({
      id: "modal-demo",
      title: "Deploy Changes",
      width: 50,
      backdrop: "dim",
      content: ui.column({ gap: 1 }, [
        ui.text("A deployment is ready for production."),
        ui.text("Do you want to continue?", { style: { dim: true } }),
      ]),
      actions: [
        ui.button({
          id: "modal-cancel",
          label: "Cancel",
          dsVariant: "ghost",
        }),
        ui.button({
          id: "modal-deploy",
          label: "Deploy",
          dsVariant: "solid",
          dsTone: "primary",
        }),
      ],
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Scoped Theme Overrides
// ---------------------------------------------------------------------------

export function themedOverrideShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Scoped Theme Overrides", { style: { bold: true } }),
    ui.divider(),
    ui.text("Global theme content", { style: { dim: true } }),
    ui.row({ gap: 1 }, [
      ui.box({ border: "rounded", p: 1, flex: 1 }, [
        ui.text("App section"),
        ui.button({ id: "global-cta", label: "Global CTA", intent: "primary" }),
      ]),
      ui.themed(
        {
          colors: {
            bg: {
              base: { r: 238, g: 242, b: 247 },
              elevated: { r: 232, g: 237, b: 244 },
              subtle: { r: 220, g: 228, b: 238 },
            },
            fg: {
              primary: { r: 28, g: 36, b: 49 },
              secondary: { r: 63, g: 78, b: 97 },
              muted: { r: 99, g: 113, b: 131 },
              inverse: { r: 245, g: 248, b: 252 },
            },
            accent: {
              primary: { r: 64, g: 120, b: 255 },
            },
            border: {
              subtle: { r: 187, g: 198, b: 213 },
              default: { r: 157, g: 173, b: 193 },
            },
          },
        },
        [
          ui.box({ border: "rounded", p: 1, flex: 1 }, [
            ui.text("Scoped section"),
            ui.button({ id: "scoped-cta", label: "Scoped CTA", intent: "primary" }),
          ]),
        ],
      ),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Theme Transition
// ---------------------------------------------------------------------------

export function themeTransitionShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Theme Transition", { style: { bold: true } }),
    ui.divider(),
    ui.text("Interactive gallery: press 't' to cycle themes.", { style: { dim: true } }),
    ui.text("Set AppConfig.themeTransitionFrames > 0 to interpolate between themes."),
    ui.row({ gap: 2 }, [
      ui.button({ id: "theme-a", label: "Theme A", intent: "primary" }),
      ui.button({ id: "theme-b", label: "Theme B", dsVariant: "outline", dsTone: "success" }),
      ui.button({ id: "theme-c", label: "Theme C", dsVariant: "outline", dsTone: "warning" }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Scrollbars
// ---------------------------------------------------------------------------

const SCROLLBAR_VARIANTS = ["minimal", "classic", "modern", "dots", "thin"] as const;

export function scrollbarShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Scrollbars", { style: { bold: true } }),
    ui.divider(),
    ...SCROLLBAR_VARIANTS.map((variant) =>
      ui.column({ gap: 0, key: `sb-${variant}` }, [
        ui.text(`variant: ${variant}`, { style: { bold: true, dim: true } }),
        ui.column(
          {
            width: 18,
            height: 3,
            overflow: "scroll",
            scrollY: 1,
            scrollbarVariant: variant,
            key: `sb-column-${variant}`,
          },
          [
            ui.box({ border: "none", mb: -4, mr: -2 }, [
              ui.text(`Line 1 (${variant})`),
              ui.text(`Line 2 (${variant})`),
              ui.text(`Line 3 (${variant})`),
            ]),
          ],
        ),
      ]),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Status Indicators
// ---------------------------------------------------------------------------

export function statusShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Status Indicators", { style: { bold: true } }),
    ui.divider(),
    ui.row({ gap: 3 }, [
      ui.status("online", { key: "s-online" }),
      ui.status("away", { key: "s-away" }),
      ui.status("busy", { key: "s-busy" }),
      ui.status("offline", { key: "s-offline" }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Keyboard Shortcuts
// ---------------------------------------------------------------------------

export function kbdShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Keyboard Shortcuts", { style: { bold: true } }),
    ui.divider(),
    ui.row({ gap: 2 }, [
      ui.kbd("Ctrl+C", { key: "k-cc" }),
      ui.kbd("Ctrl+V", { key: "k-cv" }),
      ui.kbd("Ctrl+Shift+P", { key: "k-csp" }),
      ui.kbd("Esc", { key: "k-esc" }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Scene: Empty States
// ---------------------------------------------------------------------------

export function emptyStateShowcase(): VNode {
  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Empty States", { style: { bold: true } }),
    ui.divider(),
    ui.empty("No items yet", {
      description: "Add your first item to get started",
      key: "empty-1",
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Scene Registry
// ---------------------------------------------------------------------------

export type Scene = {
  name: string;
  title: string;
  navLabel: string;
  render: () => VNode;
};

export const scenes: readonly Scene[] = [
  { name: "button-matrix", title: "Button Matrix", navLabel: "Buttons", render: buttonMatrix },
  { name: "input-showcase", title: "Input Showcase", navLabel: "Inputs", render: inputShowcase },
  {
    name: "navigation",
    title: "Navigation Widgets",
    navLabel: "Nav",
    render: navigationShowcase,
  },
  { name: "typography", title: "Typography", navLabel: "Type", render: typographyShowcase },
  {
    name: "surfaces",
    title: "Surfaces & Elevation",
    navLabel: "Surfaces",
    render: surfaceShowcase,
  },
  { name: "badges", title: "Badges & Tags", navLabel: "Badges", render: badgeShowcase },
  {
    name: "progress",
    title: "Progress & Indicators",
    navLabel: "Progress",
    render: progressShowcase,
  },
  { name: "callouts", title: "Callouts", navLabel: "Callouts", render: calloutShowcase },
  { name: "checkboxes", title: "Checkboxes & Radio", navLabel: "Checks", render: checkboxShowcase },
  { name: "dividers", title: "Dividers & Spacing", navLabel: "Dividers", render: dividerShowcase },
  { name: "select", title: "Select Inputs", navLabel: "Select", render: selectShowcase },
  { name: "table", title: "Table", navLabel: "Table", render: tableShowcase },
  { name: "modal", title: "Modal Overlay", navLabel: "Modal", render: modalShowcase },
  {
    name: "themed-override",
    title: "Scoped Theme Overrides",
    navLabel: "Themed",
    render: themedOverrideShowcase,
  },
  {
    name: "theme-transition",
    title: "Theme Transition",
    navLabel: "Theme FX",
    render: themeTransitionShowcase,
  },
  { name: "scrollbars", title: "Scrollbars", navLabel: "Scrollbars", render: scrollbarShowcase },
  { name: "status", title: "Status Indicators", navLabel: "Status", render: statusShowcase },
  { name: "kbd", title: "Keyboard Shortcuts", navLabel: "Keys", render: kbdShowcase },
  { name: "empty-states", title: "Empty States", navLabel: "Empty", render: emptyStateShowcase },
];

export function getScene(name: string): Scene | undefined {
  return scenes.find((s) => s.name === name);
}
