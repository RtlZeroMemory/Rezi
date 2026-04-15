import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_MOD_CTRL,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { Rect } from "../../layout/types.js";
import { createTreeStateStore } from "../../runtime/localState.js";
import type { FileNode, FilePickerProps, FileTreeExplorerProps } from "../../widgets/types.js";
import {
  routeFilePickerKeyDown,
  routeFileTreeExplorerKeyDown,
} from "../widgetRenderer/filePickerRouting.js";
import { routeFilePickerMouseClick } from "../widgetRenderer/mouseRouting.js";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function mouseDown(x: number, y: number, mods = 0): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x,
    y,
    mouseKind: 3,
    mods,
    buttons: 1,
    wheelX: 0,
    wheelY: 0,
  };
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
      onChange: (path, next) => toggled.push(`${path}:${String(next)}`),
      onPress: (path) => opened.push(path),
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
      onChange: (path, next) => toggled.push(`${path}:${String(next)}`),
      onPress: (path) => opened.push(path),
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

  test("multi-select uses selectedPath as the active keyboard target before selection", () => {
    const treeStore = createTreeStateStore();
    const opened: string[] = [];
    const selectionChanges: string[][] = [];

    const props: FilePickerProps = {
      id: "fp-multi-keyboard",
      rootPath: "/",
      data: createFileTreeData(),
      expandedPaths: Object.freeze(["/"]),
      multiSelect: true,
      selectedPath: "/b.txt",
      selection: Object.freeze(["/a.txt"]),
      onSelect: () => {},
      onChange: () => {},
      onPress: (path) => opened.push(path),
      onSelectionChange: (paths) => selectionChanges.push([...paths]),
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_SPACE), props, treeStore), true);
    assert.deepEqual(selectionChanges, [["/a.txt", "/b.txt"]]);

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), props, treeStore), true);
    assert.deepEqual(opened, ["/b.txt"]);
  });

  test("mouse multi-select uses selectedPath as the shift anchor and ctrl toggles", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const selectionChanges: string[][] = [];
    const rectById = new Map<string, Rect>([["fp-multi-mouse", { x: 0, y: 0, w: 20, h: 6 }]]);
    const data = Object.freeze([
      Object.freeze({ name: "a.txt", path: "/a.txt", type: "file" as const }),
      Object.freeze({ name: "b.txt", path: "/b.txt", type: "file" as const }),
      Object.freeze({ name: "c.txt", path: "/c.txt", type: "file" as const }),
    ]);

    const ctrlProps: FilePickerProps = {
      id: "fp-multi-mouse",
      rootPath: "/",
      data,
      expandedPaths: Object.freeze([]),
      multiSelect: true,
      selectedPath: "/a.txt",
      selection: Object.freeze(["/a.txt"]),
      onSelect: (path) => selected.push(path),
      onChange: () => {},
      onPress: () => {},
      onSelectionChange: (paths) => selectionChanges.push([...paths]),
    };

    assert.equal(
      routeFilePickerMouseClick(mouseDown(0, 1, ZR_MOD_CTRL), {
        mouseTargetId: ctrlProps.id,
        filePickerById: new Map([[ctrlProps.id, ctrlProps]]),
        rectById,
        treeStore,
        pressedFilePicker: null,
        setPressedFilePicker: () => {},
        lastFilePickerClick: null,
        setLastFilePickerClick: () => {},
      }),
      true,
    );
    assert.deepEqual(selected, ["/b.txt"]);
    assert.deepEqual(selectionChanges, [["/a.txt", "/b.txt"]]);
    assert.equal(treeStore.get(ctrlProps.id).focusedKey, "/b.txt");

    const shiftProps: FilePickerProps = {
      ...ctrlProps,
      selectedPath: "/b.txt",
      selection: Object.freeze(["/a.txt", "/b.txt"]),
    };

    assert.equal(
      routeFilePickerMouseClick(mouseDown(0, 2, ZR_MOD_SHIFT), {
        mouseTargetId: shiftProps.id,
        filePickerById: new Map([[shiftProps.id, shiftProps]]),
        rectById,
        treeStore,
        pressedFilePicker: null,
        setPressedFilePicker: () => {},
        lastFilePickerClick: null,
        setLastFilePickerClick: () => {},
      }),
      true,
    );
    assert.deepEqual(selected, ["/b.txt", "/c.txt"]);
    assert.deepEqual(selectionChanges, [
      ["/a.txt", "/b.txt"],
      ["/a.txt", "/b.txt", "/c.txt"],
    ]);
  });

  test("filter and showHidden update the visible routing surface", () => {
    const treeStore = createTreeStateStore();
    const selected: string[] = [];
    const opened: string[] = [];
    const data = Object.freeze([
      Object.freeze({ name: ".env", path: "/.env", type: "file" as const }),
      Object.freeze({
        name: "src",
        path: "/src",
        type: "directory" as const,
        children: Object.freeze([
          Object.freeze({ name: "index.ts", path: "/src/index.ts", type: "file" as const }),
        ]),
      }),
      Object.freeze({ name: "notes.md", path: "/notes.md", type: "file" as const }),
    ]);

    const filteredProps: FilePickerProps = {
      id: "fp-filter-surface",
      rootPath: "/",
      data,
      expandedPaths: Object.freeze(["/src"]),
      filter: "*.ts",
      onSelect: (path) => selected.push(path),
      onChange: () => {},
      onPress: (path) => opened.push(path),
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_DOWN), filteredProps, treeStore), true);
    assert.deepEqual(selected, ["/src"]);
    assert.equal(treeStore.get(filteredProps.id).focusedKey, "/src");
    treeStore.set(filteredProps.id, { focusedKey: null });

    const hiddenProps: FilePickerProps = {
      id: filteredProps.id,
      rootPath: filteredProps.rootPath,
      data,
      expandedPaths: filteredProps.expandedPaths,
      showHidden: true,
      selectedPath: "/.env",
      onSelect: filteredProps.onSelect,
      onChange: filteredProps.onChange,
      onPress: filteredProps.onPress,
    };

    assert.equal(routeFilePickerKeyDown(keyDown(ZR_KEY_ENTER), hiddenProps, treeStore), true);
    assert.deepEqual(opened, ["/.env"]);
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
      onChange: (node, next) => toggled.push(`${node.path}:${String(next)}`),
      onPress: (node) => activated.push(node.path),
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
      onChange: (node, next) => toggled.push(`${node.path}:${String(next)}`),
      onPress: (node) => activated.push(node.path),
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
});
