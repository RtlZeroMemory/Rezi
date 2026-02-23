import { assert, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { createInstanceIdAllocator } from "../instance.js";
import { reconcileChildren } from "../reconcile.js";

function textVNode(text: string, key: string): VNode {
  return { kind: "text", text, props: { key } };
}

function spacerVNode(key: string): VNode {
  return { kind: "spacer", props: { key } };
}

test("duplicate sibling keys trigger deterministic fatal ZRUI_DUPLICATE_KEY (#65)", () => {
  const allocator = createInstanceIdAllocator(1);
  const nextChildren = [textVNode("a", "dup"), spacerVNode("dup")];

  const res = reconcileChildren(42, [], nextChildren, allocator, { kind: "column", id: "items" });
  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_DUPLICATE_KEY");
  assert.equal(
    res.fatal.detail,
    'Duplicate key "dup" under parent <column#items> (instanceId=42, children=2, child indices 0 and 1). Hint: Ensure each() key function returns unique values.',
  );
});
