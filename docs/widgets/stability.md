# Widget Stability

Rezi uses stability tiers so teams can choose widgets with clear behavior guarantees.

## Tiers

- `stable`: behavior contract and deterministic tests exist; semver guarantees apply to the documented stable surface.
- `beta`: usable and tested for core invariants, but parts of the contract can still evolve.
- `experimental`: no compatibility guarantees; behavior and APIs can change quickly.

## Stable Guarantees

When a widget is marked `stable`, Rezi guarantees:

- deterministic behavior for documented keyboard, pointer, and editing contracts
- deterministic regression tests that pin those contracts in `packages/core/src/**/__tests__`
- no breaking changes to documented stable behavior in minor or patch releases
- any required stable-surface behavior change is treated as semver-major

## Daily Driver Status

These widgets are the EPIC-04 hardening targets and are currently `stable`.

| Widget | Tier | Contract coverage |
|--------|------|-------------------|
| [Input](input.md) | `stable` | Cursor/edit/paste/focus-capture contract tests in `packages/core/src/runtime/__tests__/inputEditor.contract.test.ts` |
| [Table](table.md) | `stable` | Selection/column-width/viewport/row-key tests in `packages/core/src/widgets/__tests__/table.golden.test.ts` and `packages/core/src/app/__tests__/table.renderCache.test.ts` |
| [Virtual List](virtual-list.md) | `stable` | Visible-range/overscan/scroll-clamp/navigation tests in `packages/core/src/widgets/__tests__/virtualList.contract.test.ts` |
| [Command Palette](command-palette.md) | `stable` | Async fetch ordering/stale-cancel/query/nav/escape tests in `packages/core/src/app/__tests__/commandPaletteRouting.test.ts` and `packages/core/src/widgets/__tests__/commandPalette.test.ts` |
| [File Picker](file-picker.md) | `stable` | Expand/collapse/selection/open/toggle contracts in `packages/core/src/app/__tests__/filePickerRouting.contracts.test.ts` |
| [File Tree Explorer](file-tree-explorer.md) | `stable` | Focus/activation/toggle/context-menu contracts in `packages/core/src/app/__tests__/fileTreeExplorer.contextMenu.test.ts` |

## Full Catalog Status

The full catalog is tiered below. `stable` is intentionally conservative and reserved for widgets with hardened behavior contracts.

| Category | Widget | Tier |
|----------|--------|------|
| Primitives | [Text](text.md) | `stable` |
| Primitives | [Box](box.md) | `stable` |
| Primitives | [Row / Column](stack.md) | `stable` |
| Primitives | [Spacer](spacer.md) | `stable` |
| Primitives | [Divider](divider.md) | `stable` |
| Indicators | [Icon](icon.md) | `beta` |
| Indicators | [Spinner](spinner.md) | `beta` |
| Indicators | [Progress](progress.md) | `beta` |
| Indicators | [Skeleton](skeleton.md) | `beta` |
| Indicators | [RichText](rich-text.md) | `beta` |
| Indicators | [Kbd](kbd.md) | `beta` |
| Indicators | [Badge](badge.md) | `beta` |
| Indicators | [Status](status.md) | `beta` |
| Indicators | [Tag](tag.md) | `beta` |
| Form Inputs | [Button](button.md) | `beta` |
| Form Inputs | [Input](input.md) | `stable` |
| Form Inputs | [Slider](slider.md) | `beta` |
| Form Inputs | [Checkbox](checkbox.md) | `beta` |
| Form Inputs | [Radio Group](radio-group.md) | `beta` |
| Form Inputs | [Select](select.md) | `beta` |
| Form Inputs | [Field](field.md) | `beta` |
| Data Display | [Table](table.md) | `stable` |
| Data Display | [Virtual List](virtual-list.md) | `stable` |
| Data Display | [Tree](tree.md) | `beta` |
| Overlays | [Layers](layers.md) | `beta` |
| Overlays | [Modal](modal.md) | `beta` |
| Overlays | [Dropdown](dropdown.md) | `beta` |
| Overlays | [Layer](layer.md) | `beta` |
| Overlays | [Toast](toast.md) | `beta` |
| Overlays | [Focus Zone](focus-zone.md) | `beta` |
| Overlays | [Focus Trap](focus-trap.md) | `beta` |
| Layout | [Split Pane](split-pane.md) | `beta` |
| Layout | [Panel Group](panel-group.md) | `beta` |
| Layout | [Resizable Panel](resizable-panel.md) | `beta` |
| Advanced | [Command Palette](command-palette.md) | `stable` |
| Advanced | [File Picker](file-picker.md) | `stable` |
| Advanced | [File Tree Explorer](file-tree-explorer.md) | `stable` |
| Advanced | [Code Editor](code-editor.md) | `beta` |
| Advanced | [Diff Viewer](diff-viewer.md) | `beta` |
| Advanced | [Logs Console](logs-console.md) | `beta` |
| Advanced | [Tool Approval Dialog](tool-approval-dialog.md) | `experimental` |
| Charts | [Gauge](gauge.md) | `beta` |
| Charts | [Sparkline](sparkline.md) | `beta` |
| Charts | [Bar Chart](bar-chart.md) | `beta` |
| Charts | [Mini Chart](mini-chart.md) | `beta` |
| Feedback | [Callout](callout.md) | `beta` |
| Feedback | [Error Display](error-display.md) | `beta` |
| Feedback | [Empty](empty.md) | `beta` |
