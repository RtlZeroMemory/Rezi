import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_SPACE } from "../../keybindings/keyCodes.js";
import type { TreeLocalState, TreeStateStore } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import { type FlattenedNode, flattenTree } from "../../widgets/tree.js";
import type { FilePickerProps, FileTreeExplorerProps } from "../../widgets/types.js";
import {
  fileNodeGetChildren,
  fileNodeGetKey,
  fileNodeHasChildren,
  makeFileNodeFlatCache,
  readFileNodeFlatCache,
} from "./fileNodeCache.js";

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

export type FilePickerSelectionResult = Readonly<{
  selection: readonly string[];
  changed: boolean;
}>;

function samePathArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function getFilePickerActiveKey(
  state: TreeLocalState,
  fp: Pick<FilePickerProps, "selectedPath" | "selection">,
  fallbackKey: string | null,
): string | null {
  return state.focusedKey ?? fp.selectedPath ?? fp.selection?.[0] ?? fallbackKey;
}

export function toggleFilePickerSelection(
  currentSelection: readonly string[] | undefined,
  path: string,
): FilePickerSelectionResult {
  const prev = currentSelection ?? EMPTY_STRING_ARRAY;
  const isSelected = prev.includes(path);
  const next = isSelected ? prev.filter((entry) => entry !== path) : [...prev, path];
  return Object.freeze({
    selection: Object.freeze(next),
    changed: true,
  });
}

export function computeFilePickerMouseSelection(
  currentSelection: readonly string[] | undefined,
  path: string,
  flatNodes: readonly FlattenedNode<unknown>[],
  modifiers: Readonly<{ shift: boolean; ctrl: boolean }>,
  anchorPath: string | null,
): FilePickerSelectionResult {
  const prev = currentSelection ?? EMPTY_STRING_ARRAY;

  if (modifiers.shift && anchorPath !== null) {
    const startIndex = flatNodes.findIndex((node) => node.key === anchorPath);
    const endIndex = flatNodes.findIndex((node) => node.key === path);
    if (startIndex !== -1 && endIndex !== -1) {
      const rangeStart = Math.min(startIndex, endIndex);
      const rangeEnd = Math.max(startIndex, endIndex);
      const selectionSet = new Set(prev);
      for (let i = rangeStart; i <= rangeEnd; i++) {
        const nextNode = flatNodes[i];
        if (nextNode) selectionSet.add(nextNode.key);
      }
      const next = [...selectionSet];
      return Object.freeze({
        selection: Object.freeze(next),
        changed: !samePathArray(prev, next),
      });
    }
  }

  if (modifiers.ctrl) {
    return toggleFilePickerSelection(prev, path);
  }

  const next = Object.freeze([path]);
  return Object.freeze({
    selection: next,
    changed: !samePathArray(prev, next),
  });
}

export function routeFileTreeExplorerKeyDown(
  event: ZrevEvent,
  fte: FileTreeExplorerProps,
  treeStore: TreeStateStore,
): boolean {
  const state: TreeLocalState = treeStore.get(fte.id);
  const expandedSet =
    state.expandedSetRef === fte.expanded && state.expandedSet
      ? state.expandedSet
      : new Set(fte.expanded);
  if (state.expandedSetRef !== fte.expanded) {
    treeStore.set(fte.id, { expandedSetRef: fte.expanded, expandedSet });
  }
  const flatNodes =
    readFileNodeFlatCache(state, fte.data, fte.expanded) ??
    (() => {
      const next = flattenTree(
        fte.data,
        fileNodeGetKey,
        fileNodeGetChildren,
        fileNodeHasChildren,
        fte.expanded,
        expandedSet,
      );
      treeStore.set(fte.id, {
        flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
      });
      return next;
    })();

  const routingFocusedKey = state.focusedKey ?? fte.focused ?? fte.selected ?? null;
  const routingState =
    routingFocusedKey === state.focusedKey
      ? state
      : Object.freeze({ ...state, focusedKey: routingFocusedKey });

  const r = routeTreeKey(event, {
    treeId: fte.id,
    flatNodes,
    expanded: fte.expanded,
    state: routingState,
    keyboardNavigation: true,
  });

  if (!r.consumed) return false;

  if (r.nextFocusedKey !== undefined || r.nextScrollTop !== undefined) {
    const patch: { focusedKey?: string | null; scrollTop?: number } = {};
    if (r.nextFocusedKey !== undefined) patch.focusedKey = r.nextFocusedKey;
    if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
    treeStore.set(fte.id, patch);
  }

  if (r.nodeToSelect) {
    const found = flatNodes.find((n) => n.key === r.nodeToSelect);
    if (found) fte.onSelect(found.node);
  }

  if (r.nodeToActivate) {
    const found = flatNodes.find((n) => n.key === r.nodeToActivate);
    if (found) fte.onPress(found.node);
  }

  if (r.nextExpanded !== undefined) {
    const prev = expandedSet;
    const next = new Set(r.nextExpanded);
    const diffs: string[] = [];
    for (const k of next) if (!prev.has(k)) diffs.push(k);
    for (const k of prev) if (!next.has(k)) diffs.push(k);

    for (const k of diffs) {
      const found = flatNodes.find((n) => n.key === k);
      if (found) fte.onChange(found.node, next.has(k));
    }
  }

  return true;
}

export function routeFilePickerKeyDown(
  event: ZrevEvent,
  fp: FilePickerProps,
  treeStore: TreeStateStore,
): boolean {
  const state: TreeLocalState = treeStore.get(fp.id);
  const expandedSet =
    state.expandedSetRef === fp.expandedPaths && state.expandedSet
      ? state.expandedSet
      : new Set(fp.expandedPaths);
  if (state.expandedSetRef !== fp.expandedPaths) {
    treeStore.set(fp.id, { expandedSetRef: fp.expandedPaths, expandedSet });
  }
  const flatNodes =
    readFileNodeFlatCache(state, fp.data, fp.expandedPaths) ??
    (() => {
      const next = flattenTree(
        fp.data,
        fileNodeGetKey,
        fileNodeGetChildren,
        fileNodeHasChildren,
        fp.expandedPaths,
        expandedSet,
      );
      treeStore.set(fp.id, {
        flatCache: makeFileNodeFlatCache(fp.data, fp.expandedPaths, next),
      });
      return next;
    })();

  const focusedKey = getFilePickerActiveKey(state, fp, flatNodes[0]?.key ?? null);
  const routingFocusedKey = getFilePickerActiveKey(state, fp, null);
  const routingState =
    routingFocusedKey === state.focusedKey
      ? state
      : Object.freeze({ ...state, focusedKey: routingFocusedKey });

  // Space toggles selection in multi-select mode.
  if (
    event.kind === "key" &&
    event.key === ZR_KEY_SPACE &&
    fp.multiSelect === true &&
    focusedKey &&
    fp.onSelectionChange
  ) {
    const nextSelection = toggleFilePickerSelection(fp.selection, focusedKey);
    fp.onSelectionChange(nextSelection.selection);
    return true;
  }

  const r = routeTreeKey(event, {
    treeId: fp.id,
    flatNodes,
    expanded: fp.expandedPaths,
    state: routingState,
    keyboardNavigation: true,
  });

  if (!r.consumed) return false;

  if (r.nextFocusedKey !== undefined || r.nextScrollTop !== undefined) {
    const patch: { focusedKey?: string | null; scrollTop?: number } = {};
    if (r.nextFocusedKey !== undefined) patch.focusedKey = r.nextFocusedKey;
    if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
    treeStore.set(fp.id, patch);
  }

  if (r.nodeToSelect) {
    fp.onSelect(r.nodeToSelect);
  }

  if (r.nodeToActivate) {
    const found = flatNodes.find((n) => n.key === r.nodeToActivate);
    if (found) {
      if (found.node.type === "directory") {
        const isExpanded = fp.expandedPaths.includes(found.key);
        fp.onChange(found.key, !isExpanded);
      } else {
        fp.onPress(found.key);
      }
    }
  }

  if (r.nextExpanded !== undefined) {
    const prev = expandedSet;
    const next = new Set(r.nextExpanded);
    const diffs: string[] = [];
    for (const k of next) if (!prev.has(k)) diffs.push(k);
    for (const k of prev) if (!next.has(k)) diffs.push(k);
    for (const k of diffs) {
      fp.onChange(k, next.has(k));
    }
  }

  return true;
}
