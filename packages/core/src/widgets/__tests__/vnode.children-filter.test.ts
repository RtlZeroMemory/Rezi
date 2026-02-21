import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../types.js";
import { ui } from "../ui.js";

function text(value: string): VNode {
  return ui.text(value);
}

function childrenOf(vnode: VNode): readonly VNode[] {
  switch (vnode.kind) {
    case "box":
    case "row":
    case "column":
    case "grid":
    case "focusZone":
    case "focusTrap":
    case "layers":
      return vnode.children;
    default:
      throw new Error(`expected vnode with children, got ${vnode.kind}`);
  }
}

describe("vnode children filtering", () => {
  test("box removes null/false/undefined children", () => {
    const vnode = ui.box({}, [null, text("a"), false, undefined, text("b")]);
    const children = childrenOf(vnode);
    assert.equal(children.length, 2);
    assert.equal(children[0]?.kind, "text");
    assert.equal(children[1]?.kind, "text");
  });

  test("row preserves relative order after filtering", () => {
    const vnode = ui.row({}, [false, text("first"), undefined, text("second"), null]);
    const children = childrenOf(vnode);
    assert.equal(children.length, 2);
    if (children[0]?.kind !== "text") return;
    if (children[1]?.kind !== "text") return;
    assert.equal(children[0].text, "first");
    assert.equal(children[1].text, "second");
  });

  test("column with empty children array yields zero children", () => {
    const vnode = ui.column({}, []);
    assert.equal(childrenOf(vnode).length, 0);
  });

  test("grid varargs removes null/false/undefined", () => {
    const vnode = ui.grid({ columns: 2 }, null, text("x"), false, undefined, text("y"));
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("vstack children-only overload filters children", () => {
    const vnode = ui.vstack([text("a"), null, false, undefined, text("b")]);
    assert.equal(childrenOf(vnode).length, 2);
    assert.equal((vnode.props as { gap?: number }).gap, 1);
  });

  test("vstack gap overload filters children", () => {
    const vnode = ui.vstack(2, [text("a"), false, text("b"), undefined]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("hstack children-only overload filters children", () => {
    const vnode = ui.hstack([text("a"), null, undefined, false, text("b")]);
    assert.equal(childrenOf(vnode).length, 2);
    assert.equal((vnode.props as { gap?: number }).gap, 1);
  });

  test("spaced stack helpers default to gap=1", () => {
    const vertical = ui.spacedVStack([text("a"), text("b")]);
    const horizontal = ui.spacedHStack([text("a"), text("b")]);
    assert.equal((vertical.props as { gap?: number }).gap, 1);
    assert.equal((horizontal.props as { gap?: number }).gap, 1);
  });

  test("hstack props overload filters children", () => {
    const vnode = ui.hstack({ key: "row", gap: 1 }, [text("a"), false, undefined, text("b")]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("focusZone filters children", () => {
    const vnode = ui.focusZone({ id: "zone" }, [text("a"), undefined, false, text("b")]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("focusTrap filters children", () => {
    const vnode = ui.focusTrap({ id: "trap", active: true }, [text("a"), null, false, text("b")]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("layers children-only overload filters children", () => {
    const vnode = ui.layers([text("base"), null, false, undefined, text("overlay")]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("layers props overload filters children", () => {
    const vnode = ui.layers({ key: "stack" }, [text("base"), null, text("overlay"), false]);
    assert.equal(childrenOf(vnode).length, 2);
  });

  test("all null/false/undefined children produce empty list", () => {
    const vnode = ui.box({}, [null, false, undefined, null, false]);
    assert.equal(childrenOf(vnode).length, 0);
  });

  test("sparse arrays produce compact output with no holes", () => {
    const sparse: Array<VNode | undefined | false | null> = [];
    sparse[0] = text("a");
    sparse[3] = text("b");
    const vnode = ui.column({}, sparse);
    const children = childrenOf(vnode);
    assert.equal(children.length, 2);
    assert.equal(0 in children, true);
    assert.equal(1 in children, true);
  });

  test("nested child arrays are flattened", () => {
    const vnode = ui.box({}, [
      text("a"),
      [null, text("b"), [false, text("c"), undefined]],
      text("d"),
    ]);
    const children = childrenOf(vnode);
    assert.equal(children.length, 4);
    assert.deepEqual(
      children.map((child) => (child.kind === "text" ? child.text : "")),
      ["a", "b", "c", "d"],
    );
  });

  test("nested arrays with only falsy values collapse to zero children", () => {
    const vnode = ui.layers([
      [null, false, undefined],
      [false, [undefined, null]],
    ]);
    assert.equal(childrenOf(vnode).length, 0);
  });
});
