import { assert, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import type { FilePickerProps } from "../../widgets/types.js";
import { commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";

function button(id: string): VNode {
  return { kind: "button", props: { id, label: "x" } };
}

function box(children: readonly VNode[]): VNode {
  return { kind: "box", props: {}, children };
}

function column(children: readonly VNode[]): VNode {
  return { kind: "column", props: {}, children };
}

function filePicker(id: string): VNode {
  const props: FilePickerProps = {
    id,
    rootPath: "/",
    data: Object.freeze({ name: "a.txt", path: "/a.txt", type: "file" }),
    expandedPaths: Object.freeze([]),
    onSelect: () => {},
    onToggle: () => {},
    onOpen: () => {},
  };
  return { kind: "filePicker", props };
}

test("duplicate Button ids anywhere in the tree trigger deterministic fatal ZRUI_DUPLICATE_ID (#66)", () => {
  const allocator = createInstanceIdAllocator(1);

  const tree = column([button("dup"), box([button("dup")])]);
  const res = commitVNodeTree(null, tree, { allocator });

  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_DUPLICATE_ID");
  assert.equal(
    res.fatal.detail,
    'duplicate interactive id "dup" on instanceId=4 (already used by instanceId=2)',
  );
});

test("duplicate advanced widget ids trigger deterministic fatal ZRUI_DUPLICATE_ID (#136)", () => {
  const allocator = createInstanceIdAllocator(1);

  const tree = column([filePicker("dup"), box([filePicker("dup")])]);
  const res = commitVNodeTree(null, tree, { allocator });

  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_DUPLICATE_ID");
  assert.equal(
    res.fatal.detail,
    'duplicate interactive id "dup" on instanceId=4 (already used by instanceId=2)',
  );
});

test("reused interactive id index is cleared at the start of each commit cycle", () => {
  const allocator = createInstanceIdAllocator(1);
  const interactiveIdIndex = new Map<string, number>();

  const first = commitVNodeTree(null, column([button("stable")]), {
    allocator,
    interactiveIdIndex,
  });
  assert.equal(first.ok, true);

  if (first.ok) {
    const second = commitVNodeTree(first.value.root, column([button("stable")]), {
      allocator,
      interactiveIdIndex,
    });
    assert.equal(second.ok, true);
  }
});
