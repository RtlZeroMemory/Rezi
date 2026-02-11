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

describe("panelGroup sizing hints", () => {
  test("resizablePanel defaultSize controls distribution (horizontal)", () => {
    const pg = {
      kind: "panelGroup",
      props: { id: "pg", direction: "horizontal" },
      children: Object.freeze([
        {
          kind: "resizablePanel",
          props: { defaultSize: 25 },
          children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
        },
        {
          kind: "resizablePanel",
          props: { defaultSize: 75 },
          children: Object.freeze([{ kind: "text", text: "B", props: {} }]),
        },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(pg, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.equal(c0.rect.x, 0);
    assert.equal(c0.rect.w, 25);
    assert.equal(c1.rect.x, 25);
    assert.equal(c1.rect.w, 75);
  });

  test("unspecified defaultSize takes remaining percent", () => {
    const pg = {
      kind: "panelGroup",
      props: { id: "pg", direction: "horizontal" },
      children: Object.freeze([
        {
          kind: "resizablePanel",
          props: { defaultSize: 25 },
          children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
        },
        {
          kind: "resizablePanel",
          props: {},
          children: Object.freeze([{ kind: "text", text: "B", props: {} }]),
        },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(pg, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.equal(c0.rect.w, 25);
    assert.equal(c1.rect.w, 75);
  });

  test("minSize clamps panel (and transfers space to siblings)", () => {
    const pg = {
      kind: "panelGroup",
      props: { id: "pg", direction: "horizontal" },
      children: Object.freeze([
        {
          kind: "resizablePanel",
          props: { defaultSize: 10, minSize: 20 },
          children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
        },
        {
          kind: "resizablePanel",
          props: { defaultSize: 90 },
          children: Object.freeze([{ kind: "text", text: "B", props: {} }]),
        },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(pg, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.equal(c0.rect.w, 20);
    assert.equal(c1.rect.w, 80);
  });

  test("maxSize clamps panel (and transfers remainder to siblings)", () => {
    const pg = {
      kind: "panelGroup",
      props: { id: "pg", direction: "horizontal" },
      children: Object.freeze([
        {
          kind: "resizablePanel",
          props: { defaultSize: 80, maxSize: 50 },
          children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
        },
        {
          kind: "resizablePanel",
          props: { defaultSize: 20 },
          children: Object.freeze([{ kind: "text", text: "B", props: {} }]),
        },
      ]),
    } as unknown as VNode;

    const tree = mustLayout(pg, 100, 10);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    assert.ok(c0 !== undefined && c1 !== undefined);
    if (!c0 || !c1) return;

    assert.equal(c0.rect.w, 50);
    assert.equal(c1.rect.w, 50);
  });
});
