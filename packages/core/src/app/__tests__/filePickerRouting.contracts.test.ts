import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
} from "../../keybindings/keyCodes.js";
import { createTreeStateStore } from "../../runtime/localState.js";
import type { FileNode, FilePickerProps, FileTreeExplorerProps } from "../../widgets/types.js";
import {
  routeFilePickerKeyDown,
  routeFileTreeExplorerKeyDown,
} from "../widgetRenderer/filePickerRouting.js";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function createFileTreeData(): FileNode {
  return Object.freeze({
    name: "root",
    path: "/",
    type: "directory" as const,
    children: Object.freeze([
      Object.freeze({ name: "a.txt", path: "/a.txt", type: "file" as const }),
      Object.freeze({
        name: "dir",
        path: "/dir",
        type: "directory" as const,
        children: Object.freeze([
          Object.freeze({ name: "inner.txt", path: "/dir/inner.txt", type: "file" as const }),
        ]),
      }),
      Object.freeze({ name: "b.txt", path: "/b.txt", type: "file" as const }),
    ]),
  });
}

describe("file picker routing contracts", () => {
  test("uses selectedPath as initial keyboard focus for Enter and ArrowDown", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const toggled: string[] = [];
    const opened: string[] = [];

    const props: FilePickerProps = {
      id: "fp-fallback",
      rootPath: "/",
      data: createFileTreeData(),
      expandedPaths: Object.freeze(["/"]),
      selectedPath: "/a.txt",
      onSelect: (path) => selected.push(path),
      onToggle: (path, next) => toggled.push(`${path}:${String(next)}`),
      onOpen: (path) => opened.push(path),
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), props, treeStore), true);
    assert.deepEqual(opened, ["/a.txt"]);
    assert.deepEqual(selected, []);
    assert.deepEqual(toggled, []);

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_DOWN), props, treeStore), true);
    assert.deepEqual(selected, ["/dir"]);
    assert.equal(treeStore.get(props.id).focusedKey, "/dir");
  });

  test("expand/collapse + activate callbacks are deterministic", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const toggled: string[] = [];
    const opened: string[] = [];

    const collapsedProps: FilePickerProps = {
      id: "fp-callbacks",
      rootPath: "/",
      data: createFileTreeData(),
      expandedPaths: Object.freeze(["/"]),
      selectedPath: "/dir",
      onSelect: (path) => selected.push(path),
      onToggle: (path, next) => toggled.push(`${path}:${String(next)}`),
      onOpen: (path) => opened.push(path),
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_RIGHT), collapsedProps, treeStore), true);
    assert.deepEqual(toggled, ["/dir:true"]);
    assert.deepEqual(opened, []);
    assert.deepEqual(selected, []);

    const expandedProps: FilePickerProps = {
      ...collapsedProps,
      expandedPaths: Object.freeze(["/", "/dir"]),
    };
    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_LEFT), expandedProps, treeStore), true);
    assert.deepEqual(toggled, ["/dir:true", "/dir:false"]);

    const fileProps: FilePickerProps = {
      ...collapsedProps,
      selectedPath: "/b.txt",
    };
    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), fileProps, treeStore), true);
    assert.deepEqual(opened, ["/b.txt"]);
    assert.deepEqual(toggled, ["/dir:true", "/dir:false"]);

    treeStore.set(collapsedProps.id, { focusedKey: "/b.txt" });
    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_DOWN), collapsedProps, treeStore), true);
    assert.deepEqual(selected, []);
  });

  test("stale flat-cache data is ignored after data identity changes", () => {
    const treeStore = createTreeStateStore();
    const opened: string[] = [];
    const makeData = (leafPath: string): FileNode =>
      Object.freeze({
        name: "root",
        path: "/",
        type: "directory" as const,
        children: Object.freeze([
          Object.freeze({ name: leafPath.slice(1), path: leafPath, type: "file" as const }),
        ]),
      });

    const first: FilePickerProps = {
      id: "fp-stale",
      rootPath: "/",
      data: makeData("/old.txt"),
      expandedPaths: Object.freeze(["/"]),
      selectedPath: "/old.txt",
      onSelect: () => {},
      onToggle: () => {},
      onOpen: (path) => opened.push(path),
    };

    const second: FilePickerProps = {
      ...first,
      data: makeData("/new.txt"),
      selectedPath: "/new.txt",
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), first, treeStore), true);
    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), second, treeStore), true);
    assert.deepEqual(opened, ["/old.txt", "/new.txt"]);
  });
});

describe("file tree explorer routing contracts", () => {
  test("uses focused/selected fallback for Enter and ArrowDown", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const toggled: string[] = [];
    const activated: string[] = [];

    const props: FileTreeExplorerProps = {
      id: "fte-fallback",
      data: createFileTreeData(),
      expanded: Object.freeze(["/"]),
      focused: "/a.txt",
      selected: "/dir",
      onSelect: (node) => selected.push(node.path),
      onToggle: (node, next) => toggled.push(`${node.path}:${String(next)}`),
      onActivate: (node) => activated.push(node.path),
    };

    assert.equal(routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_ENTER), props, treeStore), true);
    assert.deepEqual(activated, ["/a.txt"]);
    assert.deepEqual(selected, []);
    assert.deepEqual(toggled, []);

    assert.equal(routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_DOWN), props, treeStore), true);
    assert.deepEqual(selected, ["/dir"]);
    assert.equal(treeStore.get(props.id).focusedKey, "/dir");
  });

  test("expand/collapse + activate callbacks are deterministic", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const toggled: string[] = [];
    const activated: string[] = [];

    const collapsedProps: FileTreeExplorerProps = {
      id: "fte-callbacks",
      data: createFileTreeData(),
      expanded: Object.freeze(["/"]),
      selected: "/dir",
      onSelect: (node) => selected.push(node.path),
      onToggle: (node, next) => toggled.push(`${node.path}:${String(next)}`),
      onActivate: (node) => activated.push(node.path),
    };

    assert.equal(
      routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_RIGHT), collapsedProps, treeStore),
      true,
    );
    assert.deepEqual(toggled, ["/dir:true"]);
    assert.deepEqual(activated, []);
    assert.deepEqual(selected, []);

    const expandedProps: FileTreeExplorerProps = {
      ...collapsedProps,
      expanded: Object.freeze(["/", "/dir"]),
    };
    assert.equal(
      routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_LEFT), expandedProps, treeStore),
      true,
    );
    assert.deepEqual(toggled, ["/dir:true", "/dir:false"]);

    const fileProps: FileTreeExplorerProps = {
      ...collapsedProps,
      selected: "/b.txt",
    };
    assert.equal(routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_ENTER), fileProps, treeStore), true);
    assert.deepEqual(activated, ["/b.txt"]);
    assert.deepEqual(toggled, ["/dir:true", "/dir:false"]);

    treeStore.set(collapsedProps.id, { focusedKey: "/b.txt" });
    assert.equal(
      routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_DOWN), collapsedProps, treeStore),
      true,
    );
    assert.deepEqual(selected, []);
  });

  test("stale flat-cache data is ignored after data identity changes", () => {
    const treeStore = createTreeStateStore();
    const activated: string[] = [];
    const makeData = (leafPath: string): FileNode =>
      Object.freeze({
        name: "root",
        path: "/",
        type: "directory" as const,
        children: Object.freeze([
          Object.freeze({ name: leafPath.slice(1), path: leafPath, type: "file" as const }),
        ]),
      });

    const first: FileTreeExplorerProps = {
      id: "fte-stale",
      data: makeData("/old.txt"),
      expanded: Object.freeze(["/"]),
      selected: "/old.txt",
      onSelect: () => {},
      onToggle: () => {},
      onActivate: (node) => activated.push(node.path),
    };

    const second: FileTreeExplorerProps = {
      ...first,
      data: makeData("/new.txt"),
      selected: "/new.txt",
    };

    assert.equal(routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_ENTER), first, treeStore), true);
    assert.equal(routeFileTreeExplorerKeyDown(keyDown(ZR_KEY_ENTER), second, treeStore), true);
    assert.deepEqual(activated, ["/old.txt", "/new.txt"]);
  });
});
