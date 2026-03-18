import type { TreeFlatCache, TreeLocalState } from "../../runtime/localState.js";
import { normalizeFilePickerFilter } from "../../widgets/filePicker.js";
import type { FlattenedNode } from "../../widgets/tree.js";
import type { FileNode } from "../../widgets/types.js";

const FILE_NODE_KIND_DIR = "directory" as const;

export function fileNodeGetKey(n: FileNode): string {
  return n.path;
}

export function fileNodeGetChildren(n: FileNode): readonly FileNode[] | undefined {
  return n.children;
}

export function fileNodeHasChildren(n: FileNode): boolean {
  return n.type === FILE_NODE_KIND_DIR;
}

export function makeFileNodeFlatCache(
  dataRef: FileNode | readonly FileNode[],
  expandedRef: readonly string[],
  flatNodes: readonly FlattenedNode<FileNode>[],
): TreeFlatCache {
  return Object.freeze({
    kind: "fileNode",
    dataRef,
    expandedRef,
    getKeyRef: null,
    getChildrenRef: null,
    hasChildrenRef: null,
    flatNodes: flatNodes as readonly unknown[],
  });
}

export function makeFilePickerFlatCache(
  dataRef: FileNode | readonly FileNode[],
  expandedRef: readonly string[],
  filter: string | undefined,
  showHidden: boolean | undefined,
  flatNodes: readonly FlattenedNode<FileNode>[],
): TreeFlatCache {
  const normalizedFilter = normalizeFilePickerFilter(filter) ?? undefined;

  return Object.freeze({
    kind: "fileNode",
    dataRef,
    expandedRef,
    filterRef: normalizedFilter,
    showHiddenRef: showHidden === true,
    getKeyRef: null,
    getChildrenRef: null,
    hasChildrenRef: null,
    flatNodes: flatNodes as readonly unknown[],
  });
}

export function readFileNodeFlatCache(
  state: TreeLocalState,
  dataRef: FileNode | readonly FileNode[],
  expandedRef: readonly string[],
): readonly FlattenedNode<FileNode>[] | null {
  const cache = state.flatCache;
  if (!cache) return null;
  if (cache.kind !== "fileNode") return null;
  if (cache.dataRef !== dataRef) return null;
  if (cache.expandedRef !== expandedRef) return null;
  return cache.flatNodes as readonly FlattenedNode<FileNode>[];
}

export function readFilePickerFlatCache(
  state: TreeLocalState,
  dataRef: FileNode | readonly FileNode[],
  expandedRef: readonly string[],
  filter: string | undefined,
  showHidden: boolean | undefined,
): readonly FlattenedNode<FileNode>[] | null {
  const cache = state.flatCache;
  if (!cache) return null;
  if (cache.kind !== "fileNode") return null;
  if (cache.dataRef !== dataRef) return null;
  if (cache.expandedRef !== expandedRef) return null;
  if (cache.filterRef !== (normalizeFilePickerFilter(filter) ?? undefined)) return null;
  if (cache.showHiddenRef !== (showHidden === true)) return null;
  return cache.flatNodes as readonly FlattenedNode<FileNode>[];
}
