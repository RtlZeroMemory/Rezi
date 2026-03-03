import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout } from "../layout.js";

function mustLayout(vnode: VNode, maxW: number, maxH: number) {
  const res = layout(vnode, 0, 0, maxW, maxH, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

describe("splitPane collapse", () => {
  test("collapsed index forces panel to minSize (default 0)", () => {
    const sp = {
      kind: "splitPane",
      props: {
        id: "sp",
        direction: "horizontal",
        sizes: Object.freeze([50, 50]),
        onChange: () => {},
        collapsible: true,
        collapsed: Object.freeze([0]),
      },
      children: Object.freeze([
        { kind: "divider", props: {} },
        { kind: "divider", props: {} },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(sp, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    // dividerSize default = 1, so panel widths must sum to 99.
    assert.equal(c0.rect.w, 0);
    assert.equal(c1.rect.x, 1);
    assert.equal(c1.rect.w, 99);
  });

  test("collapsed index uses provided minSizes[index]", () => {
    const sp = {
      kind: "splitPane",
      props: {
        id: "sp",
        direction: "horizontal",
        sizes: Object.freeze([50, 50]),
        minSizes: Object.freeze([10, 0]),
        onChange: () => {},
        collapsible: true,
        collapsed: Object.freeze([0]),
      },
      children: Object.freeze([
        { kind: "divider", props: {} },
        { kind: "divider", props: {} },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(sp, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.equal(c0.rect.w, 10);
    assert.equal(c1.rect.x, 11);
    assert.equal(c1.rect.w, 89);
  });

  test("collapsed list is ignored when collapsible is false", () => {
    const sp = {
      kind: "splitPane",
      props: {
        id: "sp",
        direction: "horizontal",
        sizes: Object.freeze([50, 50]),
        onChange: () => {},
        collapsible: false,
        collapsed: Object.freeze([0]),
      },
      children: Object.freeze([
        { kind: "divider", props: {} },
        { kind: "divider", props: {} },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(sp, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.ok(c0.rect.w > 0, "panel should not be collapsed when collapsible=false");
    assert.ok(c1.rect.w > 0);
  });
});
