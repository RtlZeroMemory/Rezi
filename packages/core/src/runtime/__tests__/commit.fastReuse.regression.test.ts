import { assert, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";

test("commit: leaf fast reuse does not ignore textOverflow changes", () => {
  const allocator = createInstanceIdAllocator(1);

  const v0 = ui.text("hello");
  const c0 = commitVNodeTree(null, v0, { allocator });
  if (!c0.ok) assert.fail(`commit failed: ${c0.fatal.code}: ${c0.fatal.detail}`);

  const v1 = ui.text("hello", { textOverflow: "ellipsis" });
  const c1 = commitVNodeTree(c0.value.root, v1, { allocator });
  if (!c1.ok) assert.fail(`commit failed: ${c1.fatal.code}: ${c1.fatal.detail}`);

  assert.notEqual(c1.value.root, c0.value.root);
  const nextProps = c1.value.root.vnode.props as { textOverflow?: unknown };
  assert.equal(nextProps.textOverflow, "ellipsis");
});

test("commit: leaf fast reuse does not ignore text id changes", () => {
  const allocator = createInstanceIdAllocator(1);

  const v0 = ui.text("hello", { id: "a" });
  const c0 = commitVNodeTree(null, v0, { allocator });
  if (!c0.ok) assert.fail(`commit failed: ${c0.fatal.code}: ${c0.fatal.detail}`);

  const v1 = ui.text("hello", { id: "b" });
  const c1 = commitVNodeTree(c0.value.root, v1, { allocator });
  if (!c1.ok) assert.fail(`commit failed: ${c1.fatal.code}: ${c1.fatal.detail}`);

  assert.notEqual(c1.value.root, c0.value.root);
  const nextProps = c1.value.root.vnode.props as { id?: unknown };
  assert.equal(nextProps.id, "b");
});

test("commit: leaf fast reuse records reusedInstanceIds", () => {
  const allocator = createInstanceIdAllocator(1);

  const v0 = ui.box({ border: "none" }, [ui.text("x")]);
  const c0 = commitVNodeTree(null, v0, { allocator });
  if (!c0.ok) assert.fail(`commit failed: ${c0.fatal.code}: ${c0.fatal.detail}`);

  const v1 = ui.box({ border: "none" }, [ui.text("x")]);
  const c1 = commitVNodeTree(c0.value.root, v1, { allocator });
  if (!c1.ok) assert.fail(`commit failed: ${c1.fatal.code}: ${c1.fatal.detail}`);

  const childId = c0.value.root.children[0]?.instanceId;
  assert.ok(childId !== undefined, "expected box child to exist");
  assert.ok(c1.value.reusedInstanceIds.includes(childId));
});

test("commit: container fast reuse does not ignore parent prop changes", () => {
  const allocator = createInstanceIdAllocator(1);

  const v0 = ui.box({ border: "none" }, [ui.text("x")]);
  const c0 = commitVNodeTree(null, v0, { allocator });
  if (!c0.ok) assert.fail(`commit failed: ${c0.fatal.code}: ${c0.fatal.detail}`);

  const v1 = ui.box({ border: "double" }, [ui.text("x")]);
  const c1 = commitVNodeTree(c0.value.root, v1, { allocator });
  if (!c1.ok) assert.fail(`commit failed: ${c1.fatal.code}: ${c1.fatal.detail}`);

  assert.notEqual(c1.value.root, c0.value.root);
  const nextBoxProps = c1.value.root.vnode.props as { border?: unknown };
  assert.equal(nextBoxProps.border, "double");

  // Child leaf is unchanged, so it should still be eligible for leaf fast reuse.
  assert.equal(c1.value.root.children[0], c0.value.root.children[0]);
});

test("commit: container fast reuse does not ignore inheritStyle changes", () => {
  const allocator = createInstanceIdAllocator(1);

  const v0 = ui.column({ inheritStyle: { fg: { r: 136, g: 136, b: 136 } } }, [ui.text("x")]);
  const c0 = commitVNodeTree(null, v0, { allocator });
  if (!c0.ok) assert.fail(`commit failed: ${c0.fatal.code}: ${c0.fatal.detail}`);

  const v1 = ui.column({ inheritStyle: { fg: { r: 0, g: 255, b: 0 } } }, [ui.text("x")]);
  const c1 = commitVNodeTree(c0.value.root, v1, { allocator });
  if (!c1.ok) assert.fail(`commit failed: ${c1.fatal.code}: ${c1.fatal.detail}`);

  assert.notEqual(c1.value.root, c0.value.root);
  const nextProps = c1.value.root.vnode.props as { inheritStyle?: { fg?: unknown } };
  assert.deepEqual(nextProps.inheritStyle?.fg, { r: 0, g: 255, b: 0 });
  assert.equal(c1.value.root.children[0], c0.value.root.children[0]);
});
