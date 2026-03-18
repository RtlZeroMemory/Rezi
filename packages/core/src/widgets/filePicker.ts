import type { FlattenedNode } from "./tree.js";
import type { FileNode } from "./types.js";

const PATH_SEPARATOR = "/";
const EMPTY_BOOL_ARRAY: readonly boolean[] = Object.freeze([]);
const EMPTY_VISIBLE_FILE_PICKER_NODES: readonly VisibleFilePickerNode[] = Object.freeze([]);

type VisibleFilePickerNode = Readonly<{
  node: FileNode;
  hasChildren: boolean;
  children: readonly VisibleFilePickerNode[];
}>;

export function normalizeFilePickerFilter(filter: string | undefined): string | null {
  if (typeof filter !== "string") return null;
  const trimmed = filter.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimLeadingPathSeparators(path: string): string {
  let start = 0;
  while (start < path.length && path[start] === PATH_SEPARATOR) {
    start++;
  }
  return start === 0 ? path : path.slice(start);
}

function escapeRegExpChar(ch: string): string {
  switch (ch) {
    case "\\":
    case "^":
    case "$":
    case ".":
    case "+":
    case "(":
    case ")":
    case "|":
    case "{":
    case "}":
    case "[":
    case "]":
      return `\\${ch}`;
    default:
      return ch;
  }
}

function compileFilePickerGlob(pattern: string): RegExp {
  let source = "^";

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === undefined) continue;
    if (ch === "*") {
      let starCount = 1;
      while (pattern[i + 1] === "*") {
        starCount++;
        i++;
      }
      source += starCount > 1 ? ".*" : "[^/]*";
      continue;
    }
    if (ch === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegExpChar(ch);
  }

  source += "$";
  return new RegExp(source);
}

function createFilePickerFilterMatcher(
  filter: string | undefined,
): ((node: FileNode) => boolean) | null {
  const normalizedFilter = normalizeFilePickerFilter(filter);
  if (normalizedFilter === null) return null;

  const pattern = compileFilePickerGlob(normalizedFilter);
  return (node) => {
    const rawPath = node.path;
    const relativePath = trimLeadingPathSeparators(rawPath);
    return pattern.test(node.name) || pattern.test(relativePath) || pattern.test(rawPath);
  };
}

function isHiddenFileNode(node: FileNode): boolean {
  return node.name.startsWith(".");
}

function buildVisibleFilePickerTree(
  nodes: readonly FileNode[],
  matcher: ((node: FileNode) => boolean) | null,
  includeHidden: boolean,
): readonly VisibleFilePickerNode[] {
  const visible: VisibleFilePickerNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node === undefined) continue;
    if (!includeHidden && isHiddenFileNode(node)) continue;

    const visibleChildren =
      node.children && node.children.length > 0
        ? buildVisibleFilePickerTree(node.children, matcher, includeHidden)
        : EMPTY_VISIBLE_FILE_PICKER_NODES;
    const hasChildren =
      node.type === "directory" && (matcher === null || visibleChildren.length > 0);

    const matchesSelf = matcher === null || matcher(node);
    const keep =
      matcher === null
        ? true
        : node.type === "directory"
          ? matchesSelf || visibleChildren.length > 0
          : matchesSelf;

    if (!keep) continue;

    visible.push(
      Object.freeze({
        node,
        hasChildren,
        children: visibleChildren,
      }),
    );
  }

  return visible.length === 0 ? EMPTY_VISIBLE_FILE_PICKER_NODES : Object.freeze(visible);
}

function appendVisibleFilePickerNodes(
  entries: readonly VisibleFilePickerNode[],
  depth: number,
  parentKey: string | null,
  ancestorIsLast: readonly boolean[],
  expandedLookup: ReadonlySet<string>,
  result: FlattenedNode<FileNode>[],
): void {
  const siblingCount = entries.length;

  for (let i = 0; i < siblingCount; i++) {
    const entry = entries[i];
    if (!entry) continue;

    const key = entry.node.path;
    const hasChildren = entry.hasChildren;
    const isLast = i === siblingCount - 1;
    const nextAncestorIsLast = Object.freeze([...ancestorIsLast, isLast]);

    const flatNode: FlattenedNode<FileNode> = Object.freeze({
      node: entry.node,
      depth,
      siblingIndex: i,
      siblingCount,
      key,
      parentKey,
      hasChildren,
      ancestorIsLast: nextAncestorIsLast,
    });

    result.push(flatNode);

    if (entry.children.length > 0 && expandedLookup.has(key)) {
      appendVisibleFilePickerNodes(
        entry.children,
        depth + 1,
        key,
        nextAncestorIsLast,
        expandedLookup,
        result,
      );
    }
  }
}

export function flattenVisibleFilePickerNodes(
  data: FileNode | readonly FileNode[],
  expanded: readonly string[],
  filter: string | undefined,
  showHidden: boolean | undefined,
  expandedSet?: ReadonlySet<string>,
): readonly FlattenedNode<FileNode>[] {
  const roots: readonly FileNode[] = Array.isArray(data) ? data : [data];
  const visibleRoots = buildVisibleFilePickerTree(
    roots,
    createFilePickerFilterMatcher(filter),
    showHidden === true,
  );
  const expandedLookup = expandedSet ?? new Set(expanded);
  const result: FlattenedNode<FileNode>[] = [];

  appendVisibleFilePickerNodes(visibleRoots, 0, null, EMPTY_BOOL_ARRAY, expandedLookup, result);

  return Object.freeze(result);
}
