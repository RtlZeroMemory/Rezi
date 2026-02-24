import { each, eachInline, ui, type RouteRenderContext, type VNode } from "@rezi-ui/core";
import { cargoSummary } from "../helpers/formatters.js";
import { sortedCargo } from "../helpers/state.js";
import { stylesForTheme, themeSpec } from "../theme.js";
import type { CargoItem, RouteDeps, StarshipState } from "../types.js";
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

function toHex(color: Readonly<{ r: number; g: number; b: number }>): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

export function renderCargoScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  const state = context.state;
  const styles = stylesForTheme(state.themeName);
  const colors = themeSpec(state.themeName).theme.colors;
  const cargo = sortedCargo(state);
  const summary = cargoSummary(cargo);

  const selected =
    (state.selectedCargoId && cargo.find((item) => item.id === state.selectedCargoId)) || cargo[0] || null;

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
        ? toHex(colors.error)
        : item.category === "medical"
          ? toHex(colors.success)
          : toHex(colors.accent.primary),
  }));

  const sortItems = [
    { id: "sort-name", label: "Sort by Name" },
    { id: "sort-category", label: "Sort by Category" },
    { id: "sort-quantity", label: "Sort by Quantity" },
    { id: "sort-priority", label: "Sort by Priority" },
  ] as const;

  return renderShell({
    title: "Cargo Hold",
    context,
    deps,
    body: ui.card(
      {
        title: "Manifest and Distribution",
        style: styles.panelStyle,
      },
      [
        ui.column({ gap: 1 }, [
          ui.panel("Cargo Controls", [
            ui.form([
              ui.field({
                label: "Category Filter",
                children: ui.radioGroup({
                  id: "cargo-category-filter",
                  value: state.cargoCategoryFilter,
                  direction: "horizontal",
                  options: [
                    { value: "all", label: "All" },
                    { value: "fuel", label: "Fuel" },
                    { value: "supplies", label: "Supplies" },
                    { value: "equipment", label: "Equipment" },
                    { value: "medical", label: "Medical" },
                    { value: "ordnance", label: "Ordnance" },
                  ],
                  onChange: (value) =>
                    deps.dispatch({
                      type: "set-cargo-category-filter",
                      category: value as StarshipState["cargoCategoryFilter"],
                    }),
                }),
              }),
            ]),
            ui.row({ gap: 1, wrap: true }, [
              ui.checkbox({
                id: "cargo-bulk-check",
                checked: state.cargoBulkChecked,
                label: "Enable bulk ops",
                onChange: (checked) => deps.dispatch({ type: "set-cargo-bulk-checked", checked }),
              }),
              ui.button({
                id: "cargo-sort-anchor",
                label: `Sort: ${state.cargoSortBy}`,
                intent: "secondary",
                onPress: () => {},
              }),
              ui.dropdown({
                id: "cargo-sort-dropdown",
                anchorId: "cargo-sort-anchor",
                position: "below-start",
                items: sortItems,
                onSelect: (item) => {
                  if (item.id === "sort-name") deps.dispatch({ type: "set-cargo-sort", sortBy: "name" });
                  if (item.id === "sort-category")
                    deps.dispatch({ type: "set-cargo-sort", sortBy: "category" });
                  if (item.id === "sort-quantity")
                    deps.dispatch({ type: "set-cargo-sort", sortBy: "quantity" });
                  if (item.id === "sort-priority")
                    deps.dispatch({ type: "set-cargo-sort", sortBy: "priority" });
                },
              }),
            ]),
          ]),
          ui.row({ gap: 1, wrap: true, items: "stretch" }, [
            ui.panel("Cargo Metrics", [
              ui.barChart(chartItems, { orientation: "horizontal", showValues: true }),
              ui.scatter({
                id: "cargo-scatter",
                width: 42,
                height: 10,
                points: scatterPoints,
                blitter: "braille",
                axes: {
                  x: { label: "Quantity", min: 0, max: 1000 },
                  y: { label: "Priority", min: 0, max: 100 },
                },
              }),
            ]),
            ui.panel("Manifest", [
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
                          gap: 1,
                          wrap: true,
                          ...(focused ? { style: { inverse: true } } : {}),
                        },
                        [
                          ui.text(`${String(index + 1).padStart(4, "0")}`),
                          ui.text(item.name),
                          ...eachInline(
                            [categoryLabel(item.category)],
                            (tag) => ui.tag(tag, { variant: categoryVariant(item.category) }),
                          { key: (_, i) => `${item.id}-tag-${i}` },
                        ),
                          ui.text(`Q${item.quantity}`, { variant: "code" }),
                          ui.text(`P${item.priority}`, { variant: "caption" }),
                        ],
                      ),
                    onScroll: (scrollTop) => deps.dispatch({ type: "set-cargo-scroll", scrollTop }),
                    onSelect: (item) => deps.dispatch({ type: "select-cargo", cargoId: item.id }),
                  }),
            ]),
          ]),
          ui.panel("Selected Cargo", [
            selected
              ? ui.column({ gap: 1 }, [
                  ui.row({ gap: 1, wrap: true }, [
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
                      deps.dispatch({
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
                    (line, index) => ui.text(line, { key: `${selected.id}-detail-${index}`, variant: "caption" }),
                    { key: (_, index) => `${selected?.id ?? "none"}-${index}` },
                  ),
                ])
              : ui.empty("No cargo item selected", {
                  description: "Select an item in the manifest",
                }),
          ]),
        ]),
      ],
    ),
  });
}
