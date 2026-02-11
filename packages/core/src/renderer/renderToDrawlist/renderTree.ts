import type { DrawlistBuilderV1 } from "../../index.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import type {
  TableStateStore,
  TreeStateStore,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import type { Theme } from "../../theme/theme.js";
import type { CommandItem } from "../../widgets/types.js";
import type { IdRectIndex } from "./indices.js";
import type { ResolvedTextStyle } from "./textStyle.js";
import type {
  CodeEditorRenderCache,
  CursorInfo,
  DiffRenderCache,
  LogsConsoleRenderCache,
  TableRenderCache,
} from "./types.js";
import { renderBasicWidget } from "./widgets/basic.js";
import { renderCollectionWidget } from "./widgets/collections.js";
import { renderContainerWidget } from "./widgets/containers.js";
import { renderEditorWidget } from "./widgets/editors.js";
import { renderFileWidgets } from "./widgets/files.js";
import { renderOverlayWidget } from "./widgets/overlays.js";

type RenderNodeTask = RuntimeInstance | null;
type ClipRect = Readonly<Rect>;
export type RenderTreeOptions = Readonly<{ damageRect?: Rect | undefined }>;

export type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

function rectIntersects(a: Rect, b: Rect): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function renderTree(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  layoutTree: LayoutTree,
  idRectIndex: IdRectIndex,
  viewport: Readonly<{ cols: number; rows: number }>,
  theme: Theme,
  tick: number,
  inheritedStyle: ResolvedTextStyle,
  tree: RuntimeInstance,
  cursorInfo: CursorInfo | undefined,
  virtualListStore: VirtualListStateStore | undefined,
  tableStore: TableStateStore | undefined,
  treeStore: TreeStateStore | undefined,
  loadedTreeChildrenById: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>> | undefined,
  commandPaletteItemsById: ReadonlyMap<string, readonly CommandItem[]> | undefined,
  commandPaletteLoadingById: ReadonlyMap<string, boolean> | undefined,
  toolApprovalFocusedActionById: ReadonlyMap<string, "allow" | "deny" | "allowSession"> | undefined,
  dropdownSelectedIndexById: ReadonlyMap<string, number> | undefined,
  diffViewerFocusedHunkById: ReadonlyMap<string, number> | undefined,
  diffViewerExpandedHunksById: ReadonlyMap<string, ReadonlySet<number>> | undefined,
  tableRenderCacheById: ReadonlyMap<string, TableRenderCache> | undefined,
  logsConsoleRenderCacheById: ReadonlyMap<string, LogsConsoleRenderCache> | undefined,
  diffRenderCacheById: ReadonlyMap<string, DiffRenderCache> | undefined,
  codeEditorRenderCacheById: ReadonlyMap<string, CodeEditorRenderCache> | undefined,
  opts: RenderTreeOptions | undefined = undefined,
): ResolvedCursor | null {
  let resolvedCursor: ResolvedCursor | null = null;
  const damageRect = opts?.damageRect;

  const nodeStack: RenderNodeTask[] = [tree];
  const styleStack: ResolvedTextStyle[] = [inheritedStyle];
  const layoutStack: LayoutTree[] = [layoutTree];
  const clipStack: (ClipRect | undefined)[] = [undefined];

  while (nodeStack.length > 0) {
    const nodeOrPop = nodeStack.pop();
    if (nodeOrPop === null) {
      builder.popClip();
      continue;
    }
    if (!nodeOrPop) continue;
    const parentStyle = styleStack.pop();
    if (!parentStyle) continue;
    const layoutNode = layoutStack.pop();
    if (!layoutNode) continue;
    const currentClip = clipStack.pop();

    const node = nodeOrPop;
    const vnode = node.vnode;
    const rect: Rect = layoutNode.rect;
    if (damageRect && !rectIntersects(rect, damageRect)) continue;

    // Depth-first preorder: render node, then its children.
    switch (vnode.kind) {
      // Containers
      case "row":
      case "column":
      case "box":
      case "modal":
      case "focusZone":
      case "focusTrap":
      case "layers":
      case "layer":
      case "panelGroup":
      case "resizablePanel":
      case "splitPane": {
        renderContainerWidget(
          builder,
          rect,
          currentClip,
          viewport,
          theme,
          parentStyle,
          node,
          layoutNode,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          damageRect,
        );
        break;
      }

      // Basic widgets
      case "text":
      case "divider":
      case "button":
      case "input":
      case "select":
      case "checkbox":
      case "radioGroup":
      case "field":
      case "spacer":
      case "richText":
      case "badge":
      case "spinner":
      case "progress":
      case "skeleton":
      case "icon":
      case "kbd":
      case "status":
      case "tag":
      case "gauge":
      case "empty":
      case "errorDisplay":
      case "callout":
      case "sparkline":
      case "barChart":
      case "miniChart": {
        const nextCursor = renderBasicWidget(
          builder,
          focusState,
          rect,
          theme,
          tick,
          parentStyle,
          node,
          layoutNode,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          currentClip,
          cursorInfo,
        );
        if (nextCursor) resolvedCursor = nextCursor;
        break;
      }

      // Collections
      case "virtualList":
      case "table":
      case "tree": {
        renderCollectionWidget(
          builder,
          focusState,
          rect,
          theme,
          tick,
          parentStyle,
          node,
          nodeStack,
          styleStack,
          virtualListStore,
          tableStore,
          treeStore,
          loadedTreeChildrenById,
          tableRenderCacheById,
        );
        break;
      }

      // Files
      case "filePicker":
      case "fileTreeExplorer": {
        renderFileWidgets(
          builder,
          focusState,
          rect,
          theme,
          tick,
          parentStyle,
          node,
          nodeStack,
          styleStack,
          treeStore,
        );
        break;
      }

      // Overlays
      case "dropdown":
      case "commandPalette":
      case "toolApprovalDialog":
      case "toastContainer": {
        const nextCursor = renderOverlayWidget(
          builder,
          focusState,
          rect,
          viewport,
          theme,
          parentStyle,
          node,
          nodeStack,
          styleStack,
          idRectIndex,
          cursorInfo,
          commandPaletteItemsById,
          commandPaletteLoadingById,
          toolApprovalFocusedActionById,
          dropdownSelectedIndexById,
        );
        if (nextCursor) resolvedCursor = nextCursor;
        break;
      }

      // Editors
      case "codeEditor":
      case "diffViewer":
      case "logsConsole": {
        const nextCursor = renderEditorWidget(
          builder,
          focusState,
          rect,
          theme,
          parentStyle,
          node,
          nodeStack,
          styleStack,
          cursorInfo,
          diffViewerFocusedHunkById,
          diffViewerExpandedHunksById,
          logsConsoleRenderCacheById,
          diffRenderCacheById,
          codeEditorRenderCacheById,
        );
        if (nextCursor) resolvedCursor = nextCursor;
        break;
      }

      default:
        break;
    }
  }

  return resolvedCursor;
}
