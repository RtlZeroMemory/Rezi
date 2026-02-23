import { assert, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import { flushMicrotasks } from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { VNode } from "../../index.js";
import { measure } from "../../layout/layout.js";
import { commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";
import { reconcileChildren } from "../reconcile.js";

function button(id: string): VNode {
  return { kind: "button", props: { id, label: "Button" } };
}

function checkbox(id: string): VNode {
  return { kind: "checkbox", props: { id, checked: false } } as unknown as VNode;
}

function textVNode(text: string, key: string): VNode {
  return { kind: "text", text, props: { key } };
}

test("duplicate id diagnostics include both widget kinds", () => {
  const allocator = createInstanceIdAllocator(1);
  const tree: VNode = {
    kind: "column",
    props: {},
    children: [button("dup"), checkbox("dup")],
  };

  const res = commitVNodeTree(null, tree, { allocator });
  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_DUPLICATE_ID");
  assert.equal(res.fatal.detail.includes('"dup"'), true);
  assert.equal(res.fatal.detail.includes("First: <button>"), true);
  assert.equal(res.fatal.detail.includes("second: <checkbox>"), true);
});

test("duplicate key diagnostics include key value and parent context", () => {
  const allocator = createInstanceIdAllocator(1);
  const res = reconcileChildren(99, [], [textVNode("a", "dup"), textVNode("b", "dup")], allocator, {
    kind: "column",
    id: "rows",
  });

  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_DUPLICATE_KEY");
  assert.equal(res.fatal.detail.includes('Duplicate key "dup"'), true);
  assert.equal(res.fatal.detail.includes("<column#rows>"), true);
  assert.equal(res.fatal.detail.includes("children=2"), true);
});

test("invalid props diagnostics include prop name and widget kind", () => {
  const vnode = {
    kind: "box",
    props: { width: false, border: "none" },
    children: [],
  } as unknown as VNode;

  const res = measure(vnode, 80, 24, "column");
  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
  assert.equal(res.fatal.detail.includes('Invalid prop "width" on <box>'), true);
  assert.equal(res.fatal.detail.includes("got boolean (false)"), true);
});

test("render-phase update diagnostics remain catchable as ZrUiError with code", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  const caught: ZrUiError[] = [];

  app.draw((g) => {
    try {
      app.update((s) => s);
    } catch (error: unknown) {
      if (error instanceof ZrUiError) caught.push(error);
    }
    g.clear();
  });

  await app.start();
  await flushMicrotasks(3);

  assert.equal(caught.length, 1);
  for (const error of caught) {
    assert.equal(error.code, "ZRUI_UPDATE_DURING_RENDER");
    assert.equal(error.message.includes("Hint:"), true);
  }

  app.dispose();
});
