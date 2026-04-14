import { assert, test } from "@rezi-ui/testkit";
import { createTreeStateStore } from "../../runtime/localState.js";
import type { FlattenedNode } from "../../widgets/tree.js";
import type { FileNode } from "../../widgets/types.js";
import { makeFileNodeFlatCache, readFileNodeFlatCache } from "../widgetRenderer/fileNodeCache.js";

function makeData(leafPath: string): FileNode {
  return Object.freeze({
    name: "root",
    path: "/",
    type: "directory" as const,
    children: Object.freeze([
      Object.freeze({ name: leafPath.slice(1), path: leafPath, type: "file" as const }),
    ]),
  });
}

function makeFlatNodes(data: FileNode): readonly FlattenedNode<FileNode>[] {
  const root = data;
  const leaf = data.children?.[0];
  if (!leaf) return Object.freeze([]);
  return Object.freeze([
    {
      node: root,
      depth: 0,
      siblingIndex: 0,
      siblingCount: 1,
      key: root.path,
      parentKey: null,
      hasChildren: true,
      ancestorIsLast: Object.freeze([]),
    },
    {
      node: leaf,
      depth: 1,
      siblingIndex: 0,
      siblingCount: 1,
      key: leaf.path,
      parentKey: root.path,
      hasChildren: false,
      ancestorIsLast: Object.freeze([true]),
    },
  ] satisfies readonly FlattenedNode<FileNode>[]);
}

test("fileNodeCache returns cached flat nodes while data and expanded refs stay stable", () => {
  const treeStore = createTreeStateStore();
  const data = makeData("/old.txt");
  const expanded = Object.freeze(["/"]);
  const flatNodes = makeFlatNodes(data);

  treeStore.set("picker", {
    flatCache: makeFileNodeFlatCache(data, expanded, flatNodes),
  });

  const cached = readFileNodeFlatCache(treeStore.get("picker"), data, expanded);
  assert.equal(cached, flatNodes);
});

test("fileNodeCache invalidates when data or expanded refs change", () => {
  const treeStore = createTreeStateStore();
  const data = makeData("/old.txt");
  const expanded = Object.freeze(["/"]);
  const flatNodes = makeFlatNodes(data);

  treeStore.set("picker", {
    flatCache: makeFileNodeFlatCache(data, expanded, flatNodes),
  });

  const nextData = makeData("/new.txt");
  const nextExpanded = Object.freeze(["/"]);

  assert.equal(readFileNodeFlatCache(treeStore.get("picker"), nextData, expanded), null);
  assert.equal(readFileNodeFlatCache(treeStore.get("picker"), data, nextExpanded), null);
  assert.equal(readFileNodeFlatCache(treeStore.get("picker"), data, expanded), flatNodes);
});
