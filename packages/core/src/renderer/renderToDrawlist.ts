/**
 * packages/core/src/renderer/renderToDrawlist.ts — Widget tree to drawlist renderer.
 *
 * Facade file: public import path and signature are stable.
 * Internal implementation lives in `./renderToDrawlist/*`.
 *
 * @see docs/guide/runtime-and-layout.md
 */

import type { DrawlistBuilderV1, DrawlistBuilderV2 } from "../index.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import { indexIdRects, indexLayoutRects } from "./renderToDrawlist/indices.js";
import { renderTree } from "./renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "./renderToDrawlist/textStyle.js";
import type { RenderToDrawlistParams } from "./renderToDrawlist/types.js";

export type {
  CursorInfo,
  RenderToDrawlistParams,
  TableRenderCache,
  LogsConsoleRenderCache,
  DiffRenderCache,
  CodeEditorRenderCache,
} from "./renderToDrawlist/types.js";

/**
 * Check if a builder supports v2 cursor commands.
 */
function isV2Builder(builder: DrawlistBuilderV1): builder is DrawlistBuilderV2 {
  return typeof (builder as DrawlistBuilderV2).setCursor === "function";
}

/**
 * Render a committed runtime tree to a drawlist.
 *
 * Traverses the tree in deterministic order, emitting drawing commands
 * for each widget based on its layout rect and focus state.
 *
 * When cursorInfo is provided and the builder supports v2, emits SET_CURSOR
 * for the focused input widget.
 */
export function renderToDrawlist(params: RenderToDrawlistParams): void {
  const theme = params.theme ?? defaultTheme;
  const tick =
    typeof params.tick === "number" && Number.isFinite(params.tick) && params.tick >= 0
      ? Math.trunc(params.tick)
      : 0;
  // Clear the framebuffer each frame to a deterministic base style so terminals
  // with non-black defaults don't leak through when the UI doesn't explicitly
  // paint every cell.
  params.builder.clearTo(params.viewport.cols, params.viewport.rows, DEFAULT_BASE_STYLE);

  const layoutIndex = params.layoutIndex ?? indexLayoutRects(params.layout, params.tree);
  const idRectIndex = params.idRectIndex ?? indexIdRects(params.tree, layoutIndex);

  /* Deterministic order: traverse the committed instance tree. */
  const resolvedCursor = renderTree(
    params.builder,
    params.focusState,
    params.layout,
    idRectIndex,
    params.viewport,
    theme,
    tick,
    DEFAULT_BASE_STYLE,
    params.tree,
    params.cursorInfo,
    params.virtualListStore,
    params.tableStore,
    params.treeStore,
    params.loadedTreeChildrenById,
    params.commandPaletteItemsById,
    params.commandPaletteLoadingById,
    params.toolApprovalFocusedActionById,
    params.dropdownSelectedIndexById,
    params.diffViewerFocusedHunkById,
    params.diffViewerExpandedHunksById,
    params.tableRenderCacheById,
    params.logsConsoleRenderCacheById,
    params.diffRenderCacheById,
    params.codeEditorRenderCacheById,
    undefined,
    params.terminalProfile,
  );

  /* v2 cursor protocol: emit SET_CURSOR for focused input */
  if (resolvedCursor && isV2Builder(params.builder)) {
    params.builder.setCursor({
      x: resolvedCursor.x,
      y: resolvedCursor.y,
      shape: resolvedCursor.shape,
      visible: true,
      blink: resolvedCursor.blink,
    });
  } else if (params.cursorInfo && isV2Builder(params.builder)) {
    /* No focused input: hide cursor */
    params.builder.hideCursor();
  }
}
