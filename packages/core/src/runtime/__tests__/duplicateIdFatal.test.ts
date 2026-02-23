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
    'Duplicate interactive widget id "dup". First: <button>, second: <button>. Hint: Use ctx.id() inside defineWidget to generate unique IDs for list items.',
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
    'Duplicate interactive widget id "dup". First: <filePicker>, second: <filePicker>. Hint: Use ctx.id() inside defineWidget to generate unique IDs for list items.',
  );
});

test("reused interactive id index is cleared at the start of each commit cycle", () => {
  const allocator = createInstanceIdAllocator(1);
  const interactiveIdIndex = new Map<string, string>();

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
