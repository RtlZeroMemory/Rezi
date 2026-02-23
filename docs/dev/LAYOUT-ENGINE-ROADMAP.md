# Rezi Layout Engine Roadmap

This document tracks the layout-engine parity roadmap toward Yoga/CSS-Flexbox-level behavior.

## Scope

The roadmap covers intrinsic sizing, stack/flex behavior, text wrapping, overlay constraints, absolute positioning, grid placement/spans, and layout stability hashing.

## EPIC Status

1. EPIC 0: Intrinsic sizing foundation
- Status: implemented.
- Added min-content and max-content measurement helpers in `packages/core/src/layout/engine/intrinsic.ts`.
- Integrated intrinsic min/max behavior into advanced stack flex planning for shrink floors and `flexBasis: "auto"`.

2. EPIC 7: Box children gap control
- Status: implemented.
- Box synthetic column now honors `box.gap` instead of hardcoded `0`.

3. EPIC 3: Per-child alignment (`alignSelf`)
- Status: implemented.
- Added `alignSelf` support in constraints and stack alignment paths (wrap + non-wrap).

4. EPIC 4: Constraint-driven overlay sizing
- Status: implemented.
- Modal/CommandPalette/ToolApprovalDialog/ToastContainer now accept sizing overrides (`width`/`height`/min constraints where applicable).

5. EPIC 1: Flex shrink + basis
- Status: implemented.
- Added shrink algorithm and support for `flexShrink` + `flexBasis`.
- Preserved legacy behavior when advanced flex props are not used.

6. EPIC 2: Text wrapping in layout/render
- Status: implemented.
- Added wrapped text measurement and rendering with grapheme-aware hard breaks.
- Added `TextProps.wrap`.

7. EPIC 5: Absolute positioning
- Status: implemented.
- Added `position: "absolute"` with `top/right/bottom/left`.
- Absolute children are removed from flow and laid out in a dedicated pass.

8. EPIC 6: Grid enhancements (`colSpan`, `rowSpan`, explicit placement)
- Status: implemented.
- Grid placement now supports explicit placement plus auto-placement over an occupancy map.
- Added spanning behavior and preserved child output order.

9. EPIC 8: Stability signature coverage expansion
- Status: implemented.
- Extended layout stability signatures to: `grid`, `table`, `tabs`, `accordion`, `modal`, `virtualList`, `splitPane`, `breadcrumb`, `pagination` (plus transparent overlay wrappers `focusZone` / `focusTrap`).

## Gap Status (Post-EPIC)

1. Gap 1: Unified integer remainder distribution
- Status: implemented.
- Added shared deterministic utility: `packages/core/src/layout/engine/distributeInteger.ts`.
- Integrated into layout percentage/grid paths and split-pane percent sizing.
- Deterministic policy: floor base shares, then remainder by largest fractional part, ties by lower index.

2. Gap 2: Fluid responsive interpolation
- Status: implemented.
- Added `fluid(min, max, options?)` in `packages/core/src/layout/responsive.ts` with floor interpolation and clamped bounds.
- Integrated in `resolveResponsiveValue(...)`, including nested responsive maps.
- Exported from public entrypoint (`packages/core/src/index.ts`).

3. Gap 3: Cross-axis feedback loop protocol
- Status: implemented.
- Stack constraint measure/layout now uses a bounded max-2-pass cross-axis feedback protocol when child cross-size depends on final main allocation.
- Applied in both wrap and non-wrap paths, including flex shrink + wrapped text interactions.

## Verification

- Full suite target command: `node scripts/run-tests.mjs`
- Core typecheck target: `npx tsc --noEmit -p packages/core/tsconfig.json`
