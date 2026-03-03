import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("file widgets - VNode construction", () => {
  const data = {
    name: "root",
    path: "/",
    type: "directory",
    children: [
      { name: "src", path: "/src", type: "directory", children: [] },
      { name: "README.md", path: "/README.md", type: "file", status: "modified" },
    ],
  } as const;

  test("filePicker creates VNode with all props", () => {
    const vnode = ui.filePicker({
      id: "picker",
      rootPath: "/",
      data,
      selectedPath: "/README.md",
      expandedPaths: ["/", "/src"],
      modifiedPaths: ["/README.md"],
      stagedPaths: ["/src/index.ts"],
      filter: "*.ts",
      showHidden: false,
      multiSelect: true,
      selection: ["/README.md"],
      onSelect: () => undefined,
      onChange: () => undefined,
      onPress: () => undefined,
      onSelectionChange: () => undefined,
    });

    assert.equal(vnode.kind, "filePicker");
    assert.equal(vnode.props.id, "picker");
    assert.equal(vnode.props.expandedPaths.length, 2);
    assert.equal(vnode.props.multiSelect, true);
  });

  test("fileTreeExplorer creates VNode and defaults optional fields to undefined", () => {
    const vnode = ui.fileTreeExplorer({
      id: "explorer",
      data,
      expanded: ["/"],
      onChange: () => undefined,
      onSelect: () => undefined,
      onPress: () => undefined,
    });

    assert.equal(vnode.kind, "fileTreeExplorer");
    assert.equal(vnode.props.id, "explorer");
    assert.equal(vnode.props.expanded.length, 1);
    assert.equal(vnode.props.selected, undefined);
    assert.equal(vnode.props.focused, undefined);
  });
});
