import type { DrawlistBuilderV1 } from "../../../index.js";
import { measureTextCells } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { TreeLocalState, TreeStateStore } from "../../../runtime/localState.js";
import type { Theme } from "../../../theme/theme.js";
import { type FlattenedNode, flattenTree, getTreeLinePrefix } from "../../../widgets/tree.js";
import type { FileNode, FilePickerProps, FileTreeExplorerProps } from "../../../widgets/types.js";
import { asTextStyle } from "../../styles.js";
import { isVisibleRect } from "../indices.js";
import { renderVNodeSimple } from "../simpleVNode.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";
import {
  focusIndicatorEnabled,
  readFocusConfig,
  resolveFocusIndicatorStyle,
  resolveFocusedContentStyle,
} from "./focusConfig.js";

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();

function clampScrollTop(scrollTop: number, totalHeight: number, viewportHeight: number): number {
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0;
  if (scrollTop >= maxScrollTop) return maxScrollTop;
  return scrollTop;
}

function clampIndexScrollTop(scrollTop: number, totalRows: number, viewportHeight: number): number {
  return Math.trunc(clampScrollTop(scrollTop, totalRows, viewportHeight));
}

export function includesString(list: readonly string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === value) return true;
  }
  return false;
}

export function getExpandedSet(
  treeStore: TreeStateStore | undefined,
  treeId: string,
  state: TreeLocalState,
  expandedRef: readonly string[],
): ReadonlySet<string> {
  if (state.expandedSetRef === expandedRef && state.expandedSet) {
    return state.expandedSet;
  }
  const nextSet = expandedRef.length === 0 ? EMPTY_STRING_SET : new Set(expandedRef);
  if (treeStore) {
    treeStore.set(treeId, { expandedSetRef: expandedRef, expandedSet: nextSet });
  }
  return nextSet;
}

export function getTreePrefixes(
  treeStore: TreeStateStore | undefined,
  treeId: string,
  state: TreeLocalState,
  flatNodes: readonly FlattenedNode<unknown>[],
  showLines: boolean,
  indentSize: number,
): readonly string[] {
  const cached = state.prefixCache;
  if (
    cached &&
    cached.flatNodesRef === (flatNodes as readonly unknown[]) &&
    cached.showLines === showLines &&
    cached.indentSize === indentSize
  ) {
    return cached.prefixes;
  }

  const prefixes = new Array<string>(flatNodes.length);
  for (let i = 0; i < flatNodes.length; i++) {
    const fn = flatNodes[i];
    prefixes[i] = fn ? getTreeLinePrefix(fn, showLines, indentSize) : "";
  }
  const frozen = Object.freeze(prefixes);
  const nextCache = Object.freeze({
    flatNodesRef: flatNodes as readonly unknown[],
    showLines,
    indentSize,
    prefixes: frozen,
  });
  if (treeStore) {
    treeStore.set(treeId, { prefixCache: nextCache });
  }
  return frozen;
}

export function renderFileWidgets(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  rect: Rect,
  theme: Theme,
  tick: number,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  treeStore: TreeStateStore | undefined,
): void {
  const vnode = node.vnode;

  switch (vnode.kind) {
    case "filePicker": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as FilePickerProps;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusHighlight = focusIndicatorEnabled(focusConfig);
      const selectionStyle = asTextStyle(props.selectionStyle, theme);

      const state: TreeLocalState = treeStore
        ? treeStore.get(props.id)
        : {
            focusedKey: null,
            loadingKeys: new Set<string>(),
            scrollTop: 0,
            viewportHeight: rect.h,
            flatCache: null,
            expandedSetRef: undefined,
            expandedSet: undefined,
            prefixCache: null,
          };

      const expandedSet = getExpandedSet(treeStore, props.id, state, props.expandedPaths);
      if (treeStore) {
        treeStore.set(props.id, { viewportHeight: rect.h });
      }

      const cached = state.flatCache;
      const canReuseFlatCache =
        cached &&
        cached.kind === "fileNode" &&
        cached.dataRef === props.data &&
        cached.expandedRef === props.expandedPaths;
      const flatNodes: readonly FlattenedNode<FileNode>[] = canReuseFlatCache
        ? (cached.flatNodes as readonly FlattenedNode<FileNode>[])
        : flattenTree(
            props.data,
            (n) => n.path,
            (n) => n.children,
            (n) => n.type === "directory",
            props.expandedPaths,
            expandedSet,
          );

      if (treeStore && !canReuseFlatCache) {
        treeStore.set(props.id, {
          flatCache: Object.freeze({
            kind: "fileNode",
            dataRef: props.data,
            expandedRef: props.expandedPaths,
            getKeyRef: null,
            getChildrenRef: null,
            hasChildrenRef: null,
            flatNodes: flatNodes as readonly unknown[],
          }),
        });
      }

      const widgetFocused = focusState.focusedId === props.id;
      const focusedKey = widgetFocused
        ? (state.focusedKey ??
          props.selectedPath ??
          props.selection?.[0] ??
          flatNodes[0]?.key ??
          null)
        : null;

      const prefixes = getTreePrefixes(
        treeStore,
        props.id,
        state,
        flatNodes as readonly FlattenedNode<unknown>[],
        true,
        2,
      );
      const selectionSet =
        props.multiSelect === true && (props.selection?.length ?? 0) > 0
          ? new Set(props.selection ?? EMPTY_STRING_ARRAY)
          : null;
      const stagedSet =
        props.stagedPaths && props.stagedPaths.length > 0 ? new Set(props.stagedPaths) : null;
      const modifiedSet =
        props.modifiedPaths && props.modifiedPaths.length > 0 ? new Set(props.modifiedPaths) : null;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      nodeStack.push(null);

      const effectiveScrollTop = clampIndexScrollTop(state.scrollTop, flatNodes.length, rect.h);
      const startIndex = Math.max(0, effectiveScrollTop);
      const endIndex = Math.min(flatNodes.length, startIndex + rect.h);

      for (let i = startIndex; i < endIndex; i++) {
        const fn = flatNodes[i];
        if (!fn) continue;

        const yRow = rect.y + (i - effectiveScrollTop);

        const isSelected =
          props.multiSelect === true
            ? selectionSet !== null
              ? selectionSet.has(fn.key)
              : includesString(props.selection, fn.key)
            : props.selectedPath === fn.key;
        const isFocused = widgetFocused && focusedKey === fn.key;
        const focusedRowStyle = resolveFocusedContentStyle(
          resolveFocusIndicatorStyle(
            parentStyle,
            theme,
            focusConfig,
            mergeTextStyle(parentStyle, { bg: theme.colors.info }),
          ),
          theme,
          focusConfig,
        );
        const selectedRowStyle = selectionStyle
          ? mergeTextStyle(parentStyle, selectionStyle)
          : mergeTextStyle(parentStyle, { bg: theme.colors.secondary });
        const rowStyle =
          isFocused && showFocusHighlight
            ? focusedRowStyle
            : isSelected
              ? selectedRowStyle
              : parentStyle;
        const rowBg = rowStyle.bg ?? parentStyle.bg;

        if (isFocused && showFocusHighlight) {
          builder.fillRect(rect.x, yRow, rect.w, 1, { bg: rowBg });
        } else if (isSelected) {
          builder.fillRect(rect.x, yRow, rect.w, 1, { bg: rowBg });
        }

        const prefix = prefixes[i] ?? "";
        builder.drawText(
          rect.x,
          yRow,
          prefix,
          mergeTextStyle(rowStyle, { fg: theme.colors.muted }),
        );

        const x0 = rect.x + measureTextCells(prefix);

        // Prefer ASCII for determinism + broad font support (some terminals render
        // triangle/emoji-like glyphs at ambiguous widths).
        const twisty = fn.hasChildren ? (expandedSet.has(fn.key) ? "- " : "+ ") : "  ";
        // Avoid emoji: wide/ambiguous glyphs can break deterministic cell rendering.
        const icon = fn.node.type === "directory" ? "D " : "F ";
        const checkbox = props.multiSelect === true ? (isSelected ? "[x] " : "[ ] ") : "";

        builder.drawText(x0, yRow, `${checkbox}${twisty}${icon}${fn.node.name}`, rowStyle);

        const status =
          stagedSet !== null
            ? stagedSet.has(fn.key)
              ? "+"
              : modifiedSet?.has(fn.key)
                ? "M"
                : fn.node.status === "untracked"
                  ? "?"
                  : fn.node.status === "deleted"
                    ? "D"
                    : fn.node.status === "renamed"
                      ? "R"
                      : ""
            : includesString(props.stagedPaths, fn.key)
              ? "+"
              : includesString(props.modifiedPaths, fn.key)
                ? "M"
                : fn.node.status === "untracked"
                  ? "?"
                  : fn.node.status === "deleted"
                    ? "D"
                    : fn.node.status === "renamed"
                      ? "R"
                      : "";

        if (status && rect.w >= 2) {
          builder.drawText(
            rect.x + rect.w - 2,
            yRow,
            status,
            mergeTextStyle(rowStyle, { fg: theme.colors.muted }),
          );
        }
      }
      break;
    }
    case "fileTreeExplorer": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as FileTreeExplorerProps;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusHighlight = focusIndicatorEnabled(focusConfig);
      const selectionStyle = asTextStyle(props.selectionStyle, theme);

      const state: TreeLocalState = treeStore
        ? treeStore.get(props.id)
        : {
            focusedKey: null,
            loadingKeys: new Set<string>(),
            scrollTop: 0,
            viewportHeight: rect.h,
            flatCache: null,
            expandedSetRef: undefined,
            expandedSet: undefined,
            prefixCache: null,
          };

      const expandedSet = getExpandedSet(treeStore, props.id, state, props.expanded);
      if (treeStore) {
        treeStore.set(props.id, { viewportHeight: rect.h });
      }

      const cached = state.flatCache;
      const canReuseFlatCache =
        cached &&
        cached.kind === "fileNode" &&
        cached.dataRef === props.data &&
        cached.expandedRef === props.expanded;
      const flatNodes: readonly FlattenedNode<FileNode>[] = canReuseFlatCache
        ? (cached.flatNodes as readonly FlattenedNode<FileNode>[])
        : flattenTree(
            props.data,
            (n) => n.path,
            (n) => n.children,
            (n) => n.type === "directory",
            props.expanded,
            expandedSet,
          );

      if (treeStore && !canReuseFlatCache) {
        treeStore.set(props.id, {
          flatCache: Object.freeze({
            kind: "fileNode",
            dataRef: props.data,
            expandedRef: props.expanded,
            getKeyRef: null,
            getChildrenRef: null,
            hasChildrenRef: null,
            flatNodes: flatNodes as readonly unknown[],
          }),
        });
      }

      const widgetFocused = focusState.focusedId === props.id;
      const focusedKey = widgetFocused
        ? (props.focused ?? state.focusedKey ?? props.selected ?? null)
        : null;

      const prefixes = getTreePrefixes(
        treeStore,
        props.id,
        state,
        flatNodes as readonly FlattenedNode<unknown>[],
        true,
        props.indentSize ?? 2,
      );

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      nodeStack.push(null);

      const effectiveScrollTop = clampIndexScrollTop(state.scrollTop, flatNodes.length, rect.h);
      const startIndex = Math.max(0, effectiveScrollTop);
      const endIndex = Math.min(flatNodes.length, startIndex + rect.h);

      for (let i = startIndex; i < endIndex; i++) {
        const fn = flatNodes[i];
        if (!fn) continue;

        const yRow = rect.y + (i - effectiveScrollTop);

        const nodeState = Object.freeze({
          expanded: expandedSet.has(fn.key),
          selected: props.selected === fn.key,
          focused: focusedKey === fn.key,
          depth: fn.depth,
          isFirst: fn.siblingIndex === 0,
          isLast: fn.siblingIndex === fn.siblingCount - 1,
          hasChildren: fn.hasChildren,
        });
        const focusedRowStyle = resolveFocusedContentStyle(
          resolveFocusIndicatorStyle(
            parentStyle,
            theme,
            focusConfig,
            mergeTextStyle(parentStyle, { bg: theme.colors.info }),
          ),
          theme,
          focusConfig,
        );
        const selectedRowStyle = selectionStyle
          ? mergeTextStyle(parentStyle, selectionStyle)
          : mergeTextStyle(parentStyle, { bg: theme.colors.secondary });
        const rowStyle =
          nodeState.focused && showFocusHighlight
            ? focusedRowStyle
            : nodeState.selected
              ? selectedRowStyle
              : parentStyle;
        const rowBg = rowStyle.bg ?? parentStyle.bg;

        if (nodeState.focused && showFocusHighlight) {
          builder.fillRect(rect.x, yRow, rect.w, 1, { bg: rowBg });
        } else if (nodeState.selected) {
          builder.fillRect(rect.x, yRow, rect.w, 1, { bg: rowBg });
        }

        const prefix = prefixes[i] ?? "";
        builder.drawText(
          rect.x,
          yRow,
          prefix,
          mergeTextStyle(rowStyle, { fg: theme.colors.muted }),
        );
        const x0 = rect.x + measureTextCells(prefix);

        if (props.renderNode) {
          const nodeVNode = props.renderNode(fn.node, fn.depth, nodeState);
          renderVNodeSimple(
            builder,
            nodeVNode,
            x0,
            yRow,
            rect.w - (x0 - rect.x),
            1,
            nodeState.focused,
            tick,
            theme,
            rowStyle,
          );
        } else {
          const showIcons = props.showIcons !== false;
          const showStatus = props.showStatus !== false;
          // Prefer ASCII for determinism + broad font support (some terminals render
          // triangle/emoji-like glyphs at ambiguous widths).
          const twisty = fn.hasChildren ? (expandedSet.has(fn.key) ? "- " : "+ ") : "  ";
          // Avoid emoji: wide/ambiguous glyphs can break deterministic cell rendering.
          const icon = !showIcons ? "" : fn.node.type === "directory" ? "D " : "F ";
          const status =
            fn.node.status === "modified"
              ? "M"
              : fn.node.status === "staged"
                ? "+"
                : fn.node.status === "untracked"
                  ? "?"
                  : fn.node.status === "deleted"
                    ? "D"
                    : fn.node.status === "renamed"
                      ? "R"
                      : "";

          builder.drawText(x0, yRow, `${twisty}${icon}${fn.node.name}`, rowStyle);

          if (showStatus && status && rect.w >= 2) {
            builder.drawText(
              rect.x + rect.w - 2,
              yRow,
              status,
              mergeTextStyle(rowStyle, { fg: theme.colors.muted }),
            );
          }
        }
      }
      break;
    }
    default:
      break;
  }
}
