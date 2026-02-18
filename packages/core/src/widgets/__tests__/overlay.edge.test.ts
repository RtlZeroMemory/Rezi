import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { ZR_KEY_ESCAPE } from "../../keybindings/keyCodes.js";
import type { LayoutTree } from "../../layout/engine/types.js";
import { layoutOverlays, measureOverlays } from "../../layout/kinds/overlays.js";
import { calculateAnchorPosition } from "../../layout/positioning.js";
import { routeDropdownKey, routeLayerEscape } from "../../runtime/router.js";
import { TOAST_HEIGHT } from "../toast.js";
import type { DropdownItem } from "../types.js";

function keyEvent(key: number): ZrevEvent {
  return { kind: "key", key, action: "down", mods: 0, timeMs: 0 };
}

function makeVNode(
  kind: VNode["kind"],
  props: { text?: unknown } & Record<string, unknown> = {},
): VNode {
  if (kind === "text") {
    return { kind: "text", text: String(props.text ?? "x"), props } as unknown as VNode;
  }
  return { kind, props, children: Object.freeze([]) } as unknown as VNode;
}

function okTree(vnode: VNode, x: number, y: number, w: number, h: number): LayoutTree {
  return {
    vnode,
    rect: { x, y, w, h },
    children: Object.freeze([]),
  };
}

const measureNode = (vnode: VNode, maxW: number, maxH: number) => {
  const rawW = (vnode.props as { testW?: unknown }).testW;
  const rawH = (vnode.props as { testH?: unknown }).testH;
  const w =
    typeof rawW === "number" ? Math.min(maxW, Math.max(0, Math.trunc(rawW))) : Math.max(1, maxW);
  const h =
    typeof rawH === "number" ? Math.min(maxH, Math.max(0, Math.trunc(rawH))) : Math.max(1, maxH);
  return { ok: true as const, value: { w, h } };
};

const layoutNode = (
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  _axis: "row" | "column",
  forcedW?: number | null,
  forcedH?: number | null,
) => {
  const w = forcedW ?? maxW;
  const h = forcedH ?? maxH;
  return { ok: true as const, value: okTree(vnode, x, y, w, h) };
};

describe("overlay.edge - layout sizing and clamping", () => {
  test("measureOverlays toast height is tied to TOAST_HEIGHT", () => {
    const vnode = makeVNode("toastContainer", { maxVisible: 4 });
    const result = measureOverlays(vnode, 80, 40, "column", measureNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.h, 4 * TOAST_HEIGHT);
  });

  test("layoutOverlays top-left toast container stays at origin", () => {
    const vnode = makeVNode("toastContainer", { maxVisible: 2, position: "top-left" });
    const result = layoutOverlays(vnode, 0, 0, 80, 24, 80, 24, "column", measureNode, layoutNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(result.value.rect, { x: 0, y: 0, w: 40, h: 2 * TOAST_HEIGHT });
  });

  test("layoutOverlays bottom-right toast container clamps to viewport", () => {
    const vnode = makeVNode("toastContainer", { maxVisible: 10, position: "bottom-right" });
    const result = layoutOverlays(vnode, 0, 0, 30, 5, 30, 5, "column", measureNode, layoutNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.rect.x + result.value.rect.w <= 30, true);
    assert.equal(result.value.rect.y + result.value.rect.h <= 5, true);
  });

  test("measureOverlays commandPalette returns zero size when closed", () => {
    const vnode = makeVNode("commandPalette", { open: false });
    const result = measureOverlays(vnode, 80, 24, "column", measureNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(result.value, { w: 0, h: 0 });
  });

  test("layoutOverlays commandPalette open is clamped within viewport", () => {
    const vnode = makeVNode("commandPalette", { open: true, maxVisible: 10 });
    const result = layoutOverlays(vnode, 0, 0, 40, 12, 40, 12, "column", measureNode, layoutNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.rect.x >= 0, true);
    assert.equal(result.value.rect.y >= 0, true);
    assert.equal(result.value.rect.x + result.value.rect.w <= 40, true);
    assert.equal(result.value.rect.y + result.value.rect.h <= 12, true);
  });

  test("layoutOverlays modal width=auto stays centered and bounded", () => {
    const content = makeVNode("text", { testW: 120, testH: 8, text: "content" });
    const actionA = makeVNode("text", { testW: 8, testH: 1, text: "ok" });
    const actionB = makeVNode("text", { testW: 12, testH: 1, text: "cancel" });

    const vnode = makeVNode("modal", {
      title: "A very long modal title",
      width: "auto",
      maxWidth: 50,
      content,
      actions: [actionA, actionB],
    });

    const result = layoutOverlays(vnode, 0, 0, 60, 20, 60, 20, "column", measureNode, layoutNode);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.rect.w <= 50, true);
    assert.equal(result.value.rect.x >= 0, true);
    assert.equal(result.value.rect.x + result.value.rect.w <= 60, true);
  });
});

describe("overlay.edge - cross-overlay escape ordering", () => {
  test("closeOnEscape=false lets dropdown consume escape", () => {
    const layerResult = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", false]]),
      onClose: new Map([["modal", () => undefined]]),
    });

    const dropdownResult = routeDropdownKey(keyEvent(ZR_KEY_ESCAPE), {
      dropdownId: "dd",
      items: [{ id: "a", label: "A" } satisfies DropdownItem],
      selectedIndex: 0,
    });

    assert.equal(layerResult.consumed, false);
    assert.equal(dropdownResult.consumed, true);
    assert.equal(dropdownResult.shouldClose, true);
  });

  test("closeOnEscape=true consumes at layer level before dropdown", () => {
    let closed = false;
    const layerResult = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", true]]),
      onClose: new Map([
        [
          "modal",
          () => {
            closed = true;
          },
        ],
      ]),
    });

    assert.equal(layerResult.consumed, true);
    assert.equal(layerResult.closedLayerId, "modal");
    assert.equal(closed, true);
  });

  test("rapid escape routing remains deterministic", () => {
    const closed: string[] = [];
    const ctx = {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", true]]),
      onClose: new Map([["modal", () => closed.push("modal")]]),
    };

    const a = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), ctx);
    const b = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), ctx);
    const c = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), ctx);

    assert.deepEqual(
      [a.closedLayerId, b.closedLayerId, c.closedLayerId],
      ["modal", "modal", "modal"],
    );
    assert.deepEqual(closed, ["modal", "modal", "modal"]);
  });

  test("anchor positioning clamps overlays near viewport edge", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 100, y: 100, w: 5, h: 1 },
      overlaySize: { w: 20, h: 10 },
      position: "below-end",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      flip: true,
    });

    assert.equal(result.rect.x + result.rect.w <= 80, true);
    assert.equal(result.rect.y + result.rect.h <= 24, true);
  });
});
