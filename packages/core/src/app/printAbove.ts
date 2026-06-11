/**
 * One-off rendering of a widget tree into scrollback-commit drawlist bytes.
 *
 * `app.printAbove(view)` renders a standalone VNode tree at the current
 * viewport width and a measured (or explicit) row count, producing ZRDL bytes
 * the backend commits into terminal scrollback above the inline region.
 */
import { ZrUiError } from "../abi.js";
import { type DrawlistBuilder, createDrawlistBuilder } from "../drawlist/index.js";
import { layout, measure } from "../layout/layout.js";
import { renderToDrawlist } from "../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../runtime/commit.js";
import { createInstanceIdAllocator } from "../runtime/instance.js";
import type { Theme } from "../theme/theme.js";
import type { VNode } from "../widgets/types.js";

/** Engine bound for one committed block (zr_config.h ZR_COMMIT_ROWS_MAX). */
export const PRINT_ABOVE_MAX_ROWS = 1024;

export type PrintAboveRender = Readonly<{
  bytes: Uint8Array;
  rows: number;
}>;

/**
 * Render `view` to drawlist bytes sized `cols x rows`.
 *
 * Rows default to the tree's measured natural height at the given width
 * (clamped to [1, PRINT_ABOVE_MAX_ROWS]); pass `rowsOverride` to pin a height.
 * Mirrors the testkit render pipeline: commit -> layout -> renderToDrawlist.
 */
export function renderViewForScrollback(
  view: VNode,
  cols: number,
  theme: Theme,
  rowsOverride?: number,
): PrintAboveRender {
  if (!Number.isInteger(cols) || cols < 1) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `printAbove: invalid viewport cols (${String(cols)})`,
    );
  }

  let rows: number;
  if (rowsOverride !== undefined) {
    if (
      !Number.isInteger(rowsOverride) ||
      rowsOverride < 1 ||
      rowsOverride > PRINT_ABOVE_MAX_ROWS
    ) {
      throw new ZrUiError(
        "ZRUI_INVALID_PROPS",
        `printAbove: rows must be an integer in [1, ${String(PRINT_ABOVE_MAX_ROWS)}]`,
      );
    }
    rows = rowsOverride;
  } else {
    const measured = measure(view, cols, PRINT_ABOVE_MAX_ROWS, "column");
    if (!measured.ok) {
      throw new ZrUiError(
        "ZRUI_INVALID_PROPS",
        `printAbove: measure failed: ${measured.fatal.code}: ${measured.fatal.detail}`,
      );
    }
    rows = Math.max(1, Math.min(PRINT_ABOVE_MAX_ROWS, measured.value.h));
  }

  const committed = commitVNodeTree(null, view, { allocator: createInstanceIdAllocator(1) });
  if (!committed.ok) {
    throw new ZrUiError(
      committed.fatal.code,
      `printAbove: commit failed: ${committed.fatal.detail}`,
    );
  }
  const root = committed.value.root;

  const layoutRes = layout(root.vnode, 0, 0, cols, rows, "column");
  if (!layoutRes.ok) {
    throw new ZrUiError(
      layoutRes.fatal.code,
      `printAbove: layout failed: ${layoutRes.fatal.detail}`,
    );
  }

  const builder: DrawlistBuilder = createDrawlistBuilder();
  renderToDrawlist({
    tree: root,
    layout: layoutRes.value,
    viewport: { cols, rows },
    focusState: Object.freeze({ focusedId: null }),
    builder,
    theme,
  });

  const built = builder.build();
  if (!built.ok) {
    throw new ZrUiError(
      "ZRUI_DRAWLIST_BUILD_ERROR",
      `printAbove: drawlist build failed: ${built.error.code}: ${built.error.detail}`,
    );
  }
  return Object.freeze({ bytes: built.bytes, rows });
}
