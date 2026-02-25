import assert from "node:assert/strict";
import test from "node:test";

import {
  appendChild,
  createHostContainer,
  createHostNode,
  insertBefore,
  removeChild,
} from "../../reconciler/types.js";

test("appendChild attaches child and sets parent for host node", () => {
  const parent = createHostNode("ink-box", {});
  const child = createHostNode("ink-text", {});

  appendChild(parent, child);

  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0], child);
  assert.equal(child.parent, parent);
});

test("appendChild to container keeps parent null", () => {
  const container = createHostContainer();
  const child = createHostNode("ink-box", {});

  appendChild(container, child);

  assert.equal(container.children.length, 1);
  assert.equal(child.parent, null);
});

test("removeChild detaches existing child", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", {});
  const childB = createHostNode("ink-text", {});

  appendChild(parent, childA);
  appendChild(parent, childB);

  removeChild(parent, childA);

  assert.deepEqual(parent.children, [childB]);
  assert.equal(childA.parent, null);
  assert.equal(childB.parent, parent);
});

test("insertBefore inserts in front of target child", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });
  const childC = createHostNode("ink-text", { id: "c" });

  appendChild(parent, childA);
  appendChild(parent, childC);

  insertBefore(parent, childB, childC);

  assert.deepEqual(parent.children, [childA, childB, childC]);
  assert.equal(childB.parent, parent);
});

test("insertBefore appends when target is missing", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });
  const missing = createHostNode("ink-text", { id: "missing" });

  appendChild(parent, childA);
  insertBefore(parent, childB, missing);

  assert.deepEqual(parent.children, [childA, childB]);
});
