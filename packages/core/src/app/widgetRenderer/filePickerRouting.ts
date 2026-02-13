import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_SPACE } from "../../keybindings/keyCodes.js";
import type { TreeLocalState, TreeStateStore } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import { flattenTree } from "../../widgets/tree.js";
import type { FilePickerProps, FileTreeExplorerProps } from "../../widgets/types.js";
import {
  fileNodeGetChildren,
  fileNodeGetKey,
  fileNodeHasChildren,
  makeFileNodeFlatCache,
  readFileNodeFlatCache,
} from "./fileNodeCache.js";

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
    if (found) fte.onActivate(found.node);
  }

  if (r.nextExpanded !== undefined) {
    const prev = expandedSet;
    const next = new Set(r.nextExpanded);
    const diffs: string[] = [];
    for (const k of next) if (!prev.has(k)) diffs.push(k);
    for (const k of prev) if (!next.has(k)) diffs.push(k);

    for (const k of diffs) {
      const found = flatNodes.find((n) => n.key === k);
      if (found) fte.onToggle(found.node, next.has(k));
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

  const focusedKey =
    state.focusedKey ?? fp.selectedPath ?? fp.selection?.[0] ?? flatNodes[0]?.key ?? null;
  const routingFocusedKey = state.focusedKey ?? fp.selectedPath ?? fp.selection?.[0] ?? null;
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
    const s = new Set(fp.selection ?? []);
    if (s.has(focusedKey)) s.delete(focusedKey);
    else s.add(focusedKey);
    fp.onSelectionChange(Object.freeze(Array.from(s)));
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
        fp.onToggle(found.key, !isExpanded);
      } else {
        fp.onOpen(found.key);
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
      fp.onToggle(k, next.has(k));
    }
  }

  return true;
}
