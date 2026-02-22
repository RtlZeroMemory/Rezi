import type { DrawlistBuilderV1 } from "../../index.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import type { InstanceId } from "../../runtime/instance.js";
import type {
  TableStateStore,
  TreeStateStore,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import type { TerminalProfile } from "../../terminalProfile.js";
import { mergeThemeOverride } from "../../theme/interop.js";
import type { Theme } from "../../theme/theme.js";
import type { CommandItem } from "../../widgets/types.js";
import { getRuntimeNodeDamageRect } from "./damageBounds.js";
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
import { renderNavigationWidget } from "./widgets/navigation.js";
import { renderOverlayWidget } from "./widgets/overlays.js";

type RenderNodeTask = RuntimeInstance | null;
type ClipRect = Readonly<Rect>;
const DEV_MODE =
  ((globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
    "development") !== "production";

function warnDev(message: string): void {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

export type RenderTreeOptions = Readonly<{
  damageRect?: Rect | undefined;
  skipCleanSubtrees?: boolean | undefined;
}>;

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

function usesVisibleOverflow(node: RuntimeInstance): boolean {
  const kind = node.vnode.kind;
  if (kind !== "row" && kind !== "column" && kind !== "grid" && kind !== "box") {
    return false;
  }
  if (node.children.length === 0) {
    return false;
  }
  const props = node.vnode.props as { overflow?: unknown };
  return props.overflow !== "hidden" && props.overflow !== "scroll";
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
  animatedRectByInstanceId: ReadonlyMap<InstanceId, Rect> | undefined,
  animatedOpacityByInstanceId: ReadonlyMap<InstanceId, number> | undefined,
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
  focusAnnouncement: string | null | undefined,
  opts: RenderTreeOptions | undefined = undefined,
  terminalProfile: TerminalProfile | undefined = undefined,
  pressedId: string | null = null,
): ResolvedCursor | null {
  let resolvedCursor: ResolvedCursor | null = null;
  let lastRenderedNodeKind = tree.vnode.kind;
  const damageRect = opts?.damageRect;
  const skipCleanSubtrees = opts?.skipCleanSubtrees ?? damageRect !== undefined;
  const hasAnimatedRects =
    animatedRectByInstanceId !== undefined && animatedRectByInstanceId.size > 0;
  const hasAnimatedOpacity =
    animatedOpacityByInstanceId !== undefined && animatedOpacityByInstanceId.size > 0;

  const nodeStack: RenderNodeTask[] = [tree];
  const styleStack: ResolvedTextStyle[] = [inheritedStyle];
  const layoutStack: LayoutTree[] = [layoutTree];
  const clipStack: (ClipRect | undefined)[] = [undefined];
  const themeByNode = new WeakMap<RuntimeInstance, Theme>();
  themeByNode.set(tree, theme);

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
    lastRenderedNodeKind = vnode.kind;
    const rect: Rect = hasAnimatedRects
      ? (animatedRectByInstanceId?.get(node.instanceId) ?? layoutNode.rect)
      : layoutNode.rect;
    if (skipCleanSubtrees && !node.dirty) continue;
    if (
      damageRect &&
      !rectIntersects(getRuntimeNodeDamageRect(node, rect), damageRect) &&
      !usesVisibleOverflow(node)
    ) {
      continue;
    }

    const currentTheme = themeByNode.get(node) ?? theme;
    let renderTheme = currentTheme;
    if (
      vnode.kind === "row" ||
      vnode.kind === "column" ||
      vnode.kind === "grid" ||
      vnode.kind === "box"
    ) {
      const props = vnode.props as { theme?: unknown };
      renderTheme = mergeThemeOverride(currentTheme, props.theme);
    }
    for (const child of node.children) {
      themeByNode.set(child, renderTheme);
    }

    // Depth-first preorder: render node, then its children.
    switch (vnode.kind) {
      // Containers
      case "row":
      case "column":
      case "grid":
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
          renderTheme,
          parentStyle,
          node,
          layoutNode,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          damageRect,
          skipCleanSubtrees,
          node.selfDirty,
          vnode.kind === "box"
            ? ((hasAnimatedOpacity
                ? (animatedOpacityByInstanceId?.get(node.instanceId) ?? undefined)
                : undefined) ??
                ((vnode.props as Readonly<{ opacity?: unknown }> | undefined)?.opacity as
                  | number
                  | undefined) ??
                undefined)
            : undefined,
        );
        break;
      }

      // Navigation widgets
      case "tabs":
      case "accordion":
      case "breadcrumb":
      case "pagination": {
        renderNavigationWidget(
          builder,
          rect,
          parentStyle,
          node,
          layoutNode,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          currentClip,
        );
        break;
      }

      // Basic widgets
      case "text":
      case "divider":
      case "button":
      case "input":
      case "focusAnnouncer":
      case "slider":
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
      case "link":
      case "canvas":
      case "image":
      case "lineChart":
      case "scatter":
      case "heatmap":
      case "sparkline":
      case "barChart":
      case "miniChart": {
        const nextCursor = renderBasicWidget(
          builder,
          focusState,
          pressedId,
          rect,
          renderTheme,
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
          focusAnnouncement,
          terminalProfile,
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
          renderTheme,
          tick,
          parentStyle,
          node,
          layoutNode,
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
          renderTheme,
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
          renderTheme,
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
          renderTheme,
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

  if (DEV_MODE && clipStack.length !== 0) {
    warnDev(
      `[rezi][render] clip stack imbalance after frame: depth=${String(
        clipStack.length,
      )}, lastNode=${lastRenderedNodeKind}.`,
    );
  }

  return resolvedCursor;
}
