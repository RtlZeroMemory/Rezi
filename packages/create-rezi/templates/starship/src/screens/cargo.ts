import { defineWidget, each, eachInline, ui, type RouteRenderContext, type VNode } from "@rezi-ui/core";
import { padLabel, resolveLayout } from "../helpers/layout.js";
import { cargoSummary } from "../helpers/formatters.js";
import { sortedCargo } from "../helpers/state.js";
import { SPACE, themeTokens, toHex } from "../theme.js";
import type { CargoItem, RouteDeps, StarshipState } from "../types.js";
import { sectionHeader, surfacePanel } from "./primitives.js";
import { renderShell } from "./shell.js";

function categoryVariant(category: CargoItem["category"]): "info" | "success" | "warning" | "error" {
  if (category === "fuel") return "warning";
  if (category === "medical") return "success";
  if (category === "ordnance") return "error";
  return "info";
}

function categoryLabel(category: CargoItem["category"]): string {
  if (category === "fuel") return "Fuel";
  if (category === "supplies") return "Supplies";
  if (category === "equipment") return "Equipment";
  if (category === "medical") return "Medical";
  return "Ordnance";
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function renderCargoScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  return renderShell({
    title: "Cargo Hold",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
      CargoDeck({
        key: "cargo-deck",
        state: context.state,
        dispatch: deps.dispatch,
      }),
    ]),
  });
}

type CargoDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

const CargoDeck = defineWidget<CargoDeckProps>((props, ctx): VNode => {
  const state = props.state;
  const tokens = themeTokens(state.themeName);
  const layout = resolveLayout({
    width: state.viewportCols,
    height: state.viewportRows,
  });
  const chartWidth = clamp(Math.floor(layout.width * (layout.wide ? 0.5 : 0.9)), 28, 132);
  const cargo = sortedCargo(state);
  const summary = cargoSummary(cargo);
  const totalItems = cargo.length;
  const averagePriority =
    cargo.length === 0
      ? 0
      : cargo.reduce((sum, item) => sum + item.priority, 0) / Math.max(1, cargo.length);
  const selected =
    (state.selectedCargoId && cargo.find((item) => item.id === state.selectedCargoId)) || cargo[0] || null;
  const nameWidth = Math.max(12, Math.min(24, chartWidth - 14));
  const showMetricsPanel = !layout.hideNonCritical && layout.height >= 40;
  const showSelectedPanel = !layout.hideNonCritical && layout.height >= 48;

  const chartItems = [
    { label: "Fuel", value: summary.byCategory.fuel, variant: "warning" as const },
    { label: "Supplies", value: summary.byCategory.supplies, variant: "info" as const },
    { label: "Equip", value: summary.byCategory.equipment, variant: "default" as const },
    { label: "Medical", value: summary.byCategory.medical, variant: "success" as const },
    { label: "Ordn", value: summary.byCategory.ordnance, variant: "error" as const },
  ] as const;

  const scatterPoints = cargo.slice(0, 160).map((item, index) => ({
    x: item.quantity,
    y: Math.min(item.priority * 20 + (index % 7), 100),
    color:
      item.category === "ordnance"
        ? toHex(tokens.accent.danger)
        : item.category === "medical"
          ? toHex(tokens.accent.success)
          : toHex(tokens.accent.info),
  }));

  const sortButton = (
    id: string,
    label: string,
    sortBy: StarshipState["cargoSortBy"],
  ): VNode =>
    ui.button({
      id,
      label,
      intent: state.cargoSortBy === sortBy ? "primary" : "secondary",
      dsSize: "sm",
      onPress: () => props.dispatch({ type: "set-cargo-sort", sortBy }),
    });

  if (layout.height <= 28) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [
      surfacePanel(tokens, "Cargo Snapshot", [
        sectionHeader(tokens, "Compact Cargo View", "Expand terminal height for full manifest + charts"),
        ui.row({ gap: SPACE.xs, wrap: true }, [
          ui.badge(`Items ${totalItems}`, { variant: "info" }),
          ui.badge(`Units ${summary.totalQuantity}`, { variant: "success" }),
          ui.badge(`Priority ${averagePriority.toFixed(1)}`, { variant: "warning" }),
        ]),
        selected
          ? ui.row({ gap: SPACE.xs, wrap: true }, [
              ui.text(selected.name, { variant: "label" }),
              ui.tag(categoryLabel(selected.category), {
                variant: categoryVariant(selected.category),
              }),
              ui.text(`Q${selected.quantity}`, { variant: "code" }),
              ui.text(`P${selected.priority}`, { variant: "code" }),
              ui.text(`B${selected.bay}`, { variant: "code" }),
            ])
          : ui.text("No cargo selected", { variant: "caption" }),
        ui.row({ gap: SPACE.xs, wrap: true }, [
          sortButton("cargo-sort-name-compact", "Name", "name"),
          sortButton("cargo-sort-quantity-compact", "Qty", "quantity"),
          sortButton("cargo-sort-priority-compact", "Priority", "priority"),
        ]),
      ]),
    ]);
  }

  const manifestPanel = surfacePanel(tokens, "Manifest", [
    sectionHeader(tokens, "Cargo Items", "Aligned numeric columns + alternating rows"),
    cargo.length === 0
      ? ui.empty("No cargo matches the active filter", {
          description: "Adjust category or sort settings",
        })
      : ui.virtualList<CargoItem>({
          id: "cargo-virtual-list",
          items: cargo,
          itemHeight: 1,
          overscan: 5,
          renderItem: (item, index, focused) =>
            ui.row(
              {
                key: item.id,
                gap: SPACE.xs,
                wrap: false,
                style: focused
                  ? { bg: tokens.state.selectedBg, fg: tokens.state.selectedText, bold: true }
                  : index % 2 === 0
                    ? { bg: tokens.bg.panel.base, fg: tokens.text.primary }
                    : { bg: tokens.table.rowAltBg, fg: tokens.text.primary },
              },
              [
                ui.text(String(index + 1).padStart(4, "0"), { variant: "code" }),
                ui.text(padLabel(item.name, nameWidth)),
                ...(layout.width >= 100
                  ? eachInline(
                      [categoryLabel(item.category)],
                      (tag) => ui.tag(tag, { variant: categoryVariant(item.category) }),
                      { key: (_, i) => `${item.id}-tag-${i}` },
                    )
                  : [
                      ui.text(categoryLabel(item.category).slice(0, 3), {
                        variant: "caption",
                        style: { fg: tokens.text.muted },
                      }),
                    ]),
                ui.spacer({ flex: 1 }),
                ui.text(String(item.quantity).padStart(6, " "), { variant: "code" }),
                ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
                ui.text(`P${item.priority}`.padStart(3, " "), { variant: "code" }),
                ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
                ui.text(`B${item.bay}`.padStart(3, " "), { variant: "code" }),
              ],
            ),
          onScroll: (scrollTop) => props.dispatch({ type: "set-cargo-scroll", scrollTop }),
          onSelect: (item) => props.dispatch({ type: "select-cargo", cargoId: item.id }),
          selectionStyle: {
            bg: tokens.table.rowSelectedBg,
            fg: tokens.state.selectedText,
            bold: true,
          },
        }),
  ]);

  const metricsPanel = surfacePanel(tokens, "Cargo Metrics", [
    sectionHeader(tokens, "Capacity and Distribution", "Panels stretch with viewport"),
    ui.barChart(chartItems, { orientation: "horizontal", showValues: true }),
    ui.scatter({
      id: "cargo-scatter",
      width: Math.max(32, chartWidth + 6),
      height: 10,
      points: scatterPoints,
      blitter: "braille",
      axes: {
        x: { label: "Quantity", min: 0, max: 1000 },
        y: { label: "Priority", min: 0, max: 100 },
      },
    }),
  ]);

  const controlsPanel = surfacePanel(
    tokens,
    "Cargo Controls",
    [
      sectionHeader(tokens, "Manifest Filters", "Inline controls avoid overlay collisions"),
      ui.row({ gap: SPACE.md, wrap: !layout.wide, items: "start" }, [
        ui.box(
          {
            border: "none",
            p: 0,
            gap: SPACE.sm,
            ...(layout.wide ? { flex: 2 } : {}),
          },
          [
            ui.form([
              ui.field({
                label: "Category Filter",
                children: ui.radioGroup({
                  id: "cargo-category-filter",
                  value: state.cargoCategoryFilter,
                  direction: layout.hideNonCritical ? "vertical" : "horizontal",
                  options: [
                    { value: "all", label: "All" },
                    { value: "fuel", label: "Fuel" },
                    { value: "supplies", label: "Supplies" },
                    { value: "equipment", label: "Equipment" },
                    { value: "medical", label: "Medical" },
                    { value: "ordnance", label: "Ordnance" },
                  ],
                  onChange: (value) =>
                    props.dispatch({
                      type: "set-cargo-category-filter",
                      category: value as StarshipState["cargoCategoryFilter"],
                    }),
                }),
              }),
            ]),
            ui.row({ gap: SPACE.sm, wrap: true }, [
              ui.checkbox({
                id: "cargo-bulk-check",
                checked: state.cargoBulkChecked,
                label: "Enable bulk ops",
                onChange: (checked) => props.dispatch({ type: "set-cargo-bulk-checked", checked }),
              }),
              sortButton("cargo-sort-name", "Name", "name"),
              sortButton("cargo-sort-category", "Category", "category"),
              sortButton("cargo-sort-quantity", "Quantity", "quantity"),
              sortButton("cargo-sort-priority", "Priority", "priority"),
            ]),
            ...(!showSelectedPanel && selected
              ? [
                  ui.row({ gap: SPACE.sm, wrap: true }, [
                    ui.text("Selected", { variant: "caption", style: { fg: tokens.text.muted } }),
                    ui.badge(selected.name, { variant: "info" }),
                    ui.tag(categoryLabel(selected.category), {
                      variant: categoryVariant(selected.category),
                    }),
                    ui.text(`Q${selected.quantity}`, { variant: "code" }),
                    ui.text(`P${selected.priority}`, { variant: "code" }),
                    ui.text(`B${selected.bay}`, { variant: "code" }),
                  ]),
                ]
              : []),
          ],
        ),
        ...(layout.wide
          ? [
              ui.box(
                {
                  border: "none",
                  p: 0,
                  flex: 1,
                },
                [
                  surfacePanel(
                    tokens,
                    "Cargo Snapshot",
                    [
                      ui.row({ gap: SPACE.xs, wrap: true }, [
                        ui.badge(`Items ${totalItems}`, { variant: "info" }),
                        ui.badge(`Units ${summary.totalQuantity}`, { variant: "success" }),
                        ui.badge(`Avg P ${averagePriority.toFixed(1)}`, { variant: "warning" }),
                      ]),
                      ...chartItems.map((item) =>
                        ui.row({ key: `cargo-summary-${item.label}`, gap: SPACE.xs, wrap: false }, [
                          ui.text(item.label, {
                            variant: "caption",
                            style: { fg: tokens.text.muted },
                          }),
                          ui.spacer({ flex: 1 }),
                          ui.tag(String(item.value), { variant: item.variant }),
                        ]),
                      ),
                    ],
                    {
                      tone: "inset",
                      p: SPACE.sm,
                      gap: SPACE.sm,
                    },
                  ),
                ],
              ),
            ]
          : []),
      ]),
    ],
    { tone: "base" },
  );

  return ui.column({ gap: SPACE.sm, width: "full" }, [
    controlsPanel,
    showMetricsPanel
      ? ui.row({ gap: SPACE.sm, wrap: true, items: "stretch" }, [
          ui.box({ border: "none", p: 0, flex: 2 }, [metricsPanel]),
          ui.box({ border: "none", p: 0, flex: 3 }, [manifestPanel]),
        ])
      : manifestPanel,
    ...(showSelectedPanel
      ? [
          surfacePanel(
            tokens,
            "Selected Cargo",
            [
              selected
                ? ui.column({ gap: SPACE.sm }, [
                    ui.row({ gap: SPACE.sm, wrap: true }, [
                      ui.badge(selected.name, { variant: "info" }),
                      ui.tag(categoryLabel(selected.category), {
                        variant: categoryVariant(selected.category),
                      }),
                    ]),
                    ui.slider({
                      id: "cargo-priority-slider",
                      value: selected.priority,
                      min: 1,
                      max: 5,
                      step: 1,
                      label: "Priority",
                      onChange: (priority) =>
                        props.dispatch({
                          type: "set-cargo-priority",
                          cargoId: selected.id,
                          priority,
                        }),
                    }),
                    ui.field({
                      label: "Bay Assignment",
                      children: ui.select({
                        id: "cargo-bay-select",
                        value: String(selected.bay),
                        options: Array.from({ length: 12 }, (_, index) => ({
                          value: String(index + 1),
                          label: `Bay ${index + 1}`,
                        })),
                        onChange: () => {},
                      }),
                    }),
                    each(
                      [
                        `Quantity: ${selected.quantity}`,
                        `Priority: ${selected.priority}`,
                        `Bay: ${selected.bay}`,
                      ],
                      (line, index) =>
                        ui.text(line, { key: `${selected.id}-detail-${index}`, variant: "caption" }),
                      { key: (_, index) => `${selected?.id ?? "none"}-${index}` },
                    ),
                  ])
                : ui.empty("No cargo item selected", {
                    description: "Select an item in the manifest",
                  }),
            ],
            { tone: "elevated" },
          ),
        ]
      : []),
  ]);
});
