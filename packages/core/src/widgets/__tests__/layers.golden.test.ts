/**
 * packages/core/src/widgets/__tests__/layers.golden.test.ts — Golden tests for layer system.
 *
 * Tests cover:
 *   1. Modal centered on screen
 *   2. Dropdown positions below anchor, flips near bottom edge
 *   3. Backdrop click triggers onClose
 *   4. ESC closes topmost layer
 *   5. Focus trapped in modal
 *
 * @see docs/widgets/layers.md (GitHub issue #117)
 */

import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import { ZR_KEY_DOWN, ZR_KEY_ENTER, ZR_KEY_ESCAPE, ZR_KEY_UP } from "../../keybindings/keyCodes.js";
import {
  calculateAnchorPosition,
  calculateCenteredPosition,
  calculateModalSize,
} from "../../layout/positioning.js";
import {
  closeTopmostLayer,
  createLayerRegistry,
  createLayerStackState,
  getBackdrops,
  getTopmostLayerId,
  hitTestLayers,
  popLayer,
  pushLayer,
} from "../../runtime/layers.js";
import { routeDropdownKey, routeLayerEscape } from "../../runtime/router.js";
import { ui } from "../ui.js";

type FixtureRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type LayerHitFixtureCase = Readonly<{
  name: string;
  layers: readonly Readonly<{
    id: string;
    zIndex: number;
    rect: FixtureRect;
    modal: boolean;
    backdrop: "none" | "dim" | "opaque";
  }>[];
  point: Readonly<{ x: number; y: number }>;
  expected: Readonly<{
    layerId: string | null;
    blocked: boolean;
    blockingLayerId: string | null;
  }>;
}>;

type LayerHitFixture = Readonly<{ schemaVersion: 1; cases: readonly LayerHitFixtureCase[] }>;

async function loadLayerHitFixture(): Promise<LayerHitFixture> {
  const bytes = await readFixture("routing/layer_hit_overlap.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as LayerHitFixture;
}

/* ========== Layer Registry Tests ========== */

describe("Layer Registry - Basic Operations", () => {
  test("registers a layer", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal1",
      rect: { x: 10, y: 5, w: 40, h: 10 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    const layer = registry.get("modal1");
    assert.ok(layer);
    assert.equal(layer.id, "modal1");
    assert.equal(layer.modal, true);
  });

  test("unregisters a layer", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal1",
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.unregister("modal1");

    assert.equal(registry.get("modal1"), undefined);
  });

  test("getAll returns layers sorted by z-index", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "layer2",
      zIndex: 50,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "layer3",
      zIndex: 200,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const layers = registry.getAll();
    assert.equal(layers.length, 3);
    assert.equal(layers[0]?.id, "layer2"); // z=50
    assert.equal(layers[1]?.id, "layer1"); // z=100
    assert.equal(layers[2]?.id, "layer3"); // z=200
  });

  test("equal z-index keeps deterministic registration order", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "first",
      zIndex: 120,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "second",
      zIndex: 120,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const layers = registry.getAll();
    assert.equal(layers.length, 2);
    assert.equal(layers[0]?.id, "first");
    assert.equal(layers[1]?.id, "second");

    const topmost = registry.getTopmost();
    assert.ok(topmost);
    assert.equal(topmost.id, "second");
  });

  test("re-registering equal z-index layer moves it to top deterministically", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "a",
      zIndex: 120,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });
    registry.register({
      id: "b",
      zIndex: 120,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const before = hitTestLayers(registry, 2, 2);
    assert.equal(before.layer?.id, "b");

    registry.unregister("a");
    registry.register({
      id: "a",
      zIndex: 120,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const after = hitTestLayers(registry, 2, 2);
    assert.equal(after.layer?.id, "a");
  });

  test("getTopmost returns highest z-index layer", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "layer2",
      zIndex: 200,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const topmost = registry.getTopmost();
    assert.ok(topmost);
    assert.equal(topmost.id, "layer2");
  });

  test("getTopmostModal returns highest modal layer", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "modal1",
      zIndex: 150,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    registry.register({
      id: "layer2",
      zIndex: 200,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const topmostModal = registry.getTopmostModal();
    assert.ok(topmostModal);
    assert.equal(topmostModal.id, "modal1");
  });
});

/* ========== Layer Stack State Tests ========== */

describe("Layer Stack State", () => {
  test("creates empty state", () => {
    const state = createLayerStackState();

    assert.deepEqual(state.stack, []);
    assert.equal(state.closeCallbacks.size, 0);
  });

  test("pushLayer adds to stack", () => {
    let state = createLayerStackState();

    state = pushLayer(state, "layer1");
    state = pushLayer(state, "layer2");

    assert.deepEqual(state.stack, ["layer1", "layer2"]);
  });

  test("pushLayer moves existing layer to top", () => {
    let state = createLayerStackState();

    state = pushLayer(state, "layer1");
    state = pushLayer(state, "layer2");
    state = pushLayer(state, "layer1");

    assert.deepEqual(state.stack, ["layer2", "layer1"]);
  });

  test("pushLayer stores onClose callback", () => {
    let state = createLayerStackState();
    const onClose = () => {};

    state = pushLayer(state, "layer1", onClose);

    assert.equal(state.closeCallbacks.get("layer1"), onClose);
  });

  test("popLayer removes from stack", () => {
    let state = createLayerStackState();

    state = pushLayer(state, "layer1");
    state = pushLayer(state, "layer2");

    const result = popLayer(state, "layer1");

    assert.deepEqual(result.state.stack, ["layer2"]);
  });

  test("popLayer returns onClose callback", () => {
    let state = createLayerStackState();
    const onClose = () => {};

    state = pushLayer(state, "layer1", onClose);

    const result = popLayer(state, "layer1");

    assert.equal(result.onClose, onClose);
  });

  test("getTopmostLayerId returns last in stack", () => {
    let state = createLayerStackState();

    state = pushLayer(state, "layer1");
    state = pushLayer(state, "layer2");

    assert.equal(getTopmostLayerId(state), "layer2");
  });

  test("getTopmostLayerId returns null for empty stack", () => {
    const state = createLayerStackState();

    assert.equal(getTopmostLayerId(state), null);
  });

  test("closeTopmostLayer removes and calls callback", () => {
    let state = createLayerStackState();
    let closeCalled = false;

    state = pushLayer(state, "layer1", () => {
      closeCalled = true;
    });

    const result = closeTopmostLayer(state);

    assert.equal(result.closed, true);
    assert.equal(result.closedLayerId, "layer1");
    assert.equal(closeCalled, true);
    assert.deepEqual(result.state.stack, []);
  });
});

/* ========== Hit Testing Tests ========== */

describe("Layer Hit Testing", () => {
  test("layer_hit_overlap.json", async () => {
    const f = await loadLayerHitFixture();
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      const registry = createLayerRegistry();

      for (const layer of c.layers) {
        registry.register({
          id: layer.id,
          zIndex: layer.zIndex,
          rect: layer.rect,
          backdrop: layer.backdrop,
          modal: layer.modal,
          closeOnEscape: true,
        });
      }

      const result = hitTestLayers(registry, c.point.x, c.point.y);
      assert.equal(result.layer?.id ?? null, c.expected.layerId, `${c.name}: layerId`);
      assert.equal(result.blocked, c.expected.blocked, `${c.name}: blocked`);
      assert.equal(
        result.blockingLayer?.id ?? null,
        c.expected.blockingLayerId,
        `${c.name}: blockingLayerId`,
      );
    }
  });

  test("hit test finds layer containing point", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const result = hitTestLayers(registry, 15, 12);

    assert.ok(result.layer);
    assert.equal(result.layer.id, "layer1");
    assert.equal(result.blocked, false);
  });

  test("hit test returns topmost layer at point", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "layer2",
      zIndex: 200,
      rect: { x: 15, y: 12, w: 10, h: 5 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    // Point in both layers
    const result = hitTestLayers(registry, 18, 14);

    assert.ok(result.layer);
    assert.equal(result.layer.id, "layer2");
  });

  test("modal blocks input to lower layers", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "modal1",
      zIndex: 200,
      rect: { x: 30, y: 10, w: 20, h: 10 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    // Point in layer1 but modal is above
    const result = hitTestLayers(registry, 15, 12);

    assert.equal(result.layer, null);
    assert.equal(result.blocked, true);
    assert.ok(result.blockingLayer);
    assert.equal(result.blockingLayer.id, "modal1");
  });

  test("point outside all layers not blocked without modal backdrop", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const result = hitTestLayers(registry, 5, 5);

    assert.equal(result.layer, null);
    assert.equal(result.blocked, false);
  });

  test("modal without backdrop still blocks input outside", () => {
    const registry = createLayerRegistry();

    // Non-modal layer at z=100
    registry.register({
      id: "layer1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    // Modal layer at z=200 with NO backdrop (backdrop: "none")
    // This should still block input to lower layers
    registry.register({
      id: "modal1",
      zIndex: 200,
      rect: { x: 50, y: 10, w: 20, h: 10 },
      backdrop: "none", // No visual backdrop
      modal: true, // But still modal - should block
      closeOnEscape: true,
    });

    // Point outside modal but inside layer1 - should be blocked by modal
    const result1 = hitTestLayers(registry, 15, 12);
    assert.equal(result1.layer, null);
    assert.equal(result1.blocked, true);
    assert.ok(result1.blockingLayer);
    assert.equal(result1.blockingLayer.id, "modal1");

    // Point completely outside all layers - should also be blocked by modal
    const result2 = hitTestLayers(registry, 5, 5);
    assert.equal(result2.layer, null);
    assert.equal(result2.blocked, true);
    assert.ok(result2.blockingLayer);
    assert.equal(result2.blockingLayer.id, "modal1");

    // Point inside the modal - not blocked, modal is the hit target
    const result3 = hitTestLayers(registry, 55, 12);
    assert.ok(result3.layer);
    assert.equal(result3.layer.id, "modal1");
    assert.equal(result3.blocked, false);
  });

  test("equal-z modal re-registration updates blocking order deterministically", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal",
      zIndex: 140,
      rect: { x: 20, y: 0, w: 8, h: 6 },
      backdrop: "none",
      modal: true,
      closeOnEscape: true,
    });
    registry.register({
      id: "content",
      zIndex: 140,
      rect: { x: 0, y: 0, w: 12, h: 8 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const before = hitTestLayers(registry, 3, 3);
    assert.equal(before.layer?.id ?? null, "content");
    assert.equal(before.blocked, false);

    registry.unregister("modal");
    registry.register({
      id: "modal",
      zIndex: 140,
      rect: { x: 20, y: 0, w: 8, h: 6 },
      backdrop: "none",
      modal: true,
      closeOnEscape: true,
    });

    const after = hitTestLayers(registry, 3, 3);
    assert.equal(after.layer, null);
    assert.equal(after.blocked, true);
    assert.equal(after.blockingLayer?.id ?? null, "modal");
  });
});

/* ========== Positioning Tests ========== */

describe("Anchor Positioning", () => {
  test("positions below-start", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 5, w: 20, h: 1 },
      overlaySize: { w: 30, h: 10 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.equal(result.rect.x, 10);
    assert.equal(result.rect.y, 6);
    assert.equal(result.position, "below-start");
    assert.equal(result.flippedVertical, false);
  });

  test("positions below-center", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 5, w: 20, h: 1 },
      overlaySize: { w: 10, h: 5 },
      position: "below-center",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.equal(result.rect.x, 15); // 10 + (20 - 10) / 2
    assert.equal(result.rect.y, 6);
    assert.equal(result.position, "below-center");
  });

  test("positions above-start", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 15, w: 20, h: 1 },
      overlaySize: { w: 30, h: 5 },
      position: "above-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.equal(result.rect.x, 10);
    assert.equal(result.rect.y, 10); // 15 - 5
    assert.equal(result.position, "above-start");
  });

  test("flips from below to above when near bottom edge", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 18, w: 20, h: 1 },
      overlaySize: { w: 30, h: 10 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    // Should flip to above because below would overflow
    assert.equal(result.position, "above-start");
    assert.equal(result.flippedVertical, true);
    assert.equal(result.rect.y, 8); // 18 - 10
  });

  test("flips from above to below when near top edge", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 3, w: 20, h: 1 },
      overlaySize: { w: 30, h: 10 },
      position: "above-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    // Should flip to below because above would overflow
    assert.equal(result.position, "below-start");
    assert.equal(result.flippedVertical, true);
    assert.equal(result.rect.y, 4); // 3 + 1
  });

  test("respects gap option", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 5, w: 20, h: 1 },
      overlaySize: { w: 30, h: 10 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      gap: 2,
    });

    assert.equal(result.rect.y, 8); // 5 + 1 + 2 gap
  });

  test("clamps to viewport when flip not possible", () => {
    // Very large overlay that can't fit either way
    const result = calculateAnchorPosition({
      anchor: { x: 5, y: 5, w: 20, h: 1 },
      overlaySize: { w: 100, h: 30 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    // Should be clamped to viewport bounds
    assert.ok(result.rect.x >= 0);
    assert.ok(result.rect.x + result.rect.w <= 80);
    assert.ok(result.rect.y >= 0);
    assert.ok(result.rect.y + result.rect.h <= 24);
  });
});

describe("Modal Centering", () => {
  test("centers modal in viewport", () => {
    const result = calculateCenteredPosition({
      modalSize: { w: 40, h: 10 },
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.equal(result.x, 20); // (80 - 40) / 2
    assert.equal(result.y, 7); // (24 - 10) / 2
    assert.equal(result.w, 40);
    assert.equal(result.h, 10);
  });

  test("clamps modal to viewport", () => {
    const result = calculateCenteredPosition({
      modalSize: { w: 100, h: 30 },
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.equal(result.x, 0);
    assert.equal(result.y, 0);
    assert.equal(result.w, 80);
    assert.equal(result.h, 24);
  });

  test("handles non-zero viewport offset", () => {
    const result = calculateCenteredPosition({
      modalSize: { w: 20, h: 10 },
      viewport: { x: 10, y: 5, width: 60, height: 20 },
    });

    assert.equal(result.x, 30); // 10 + (60 - 20) / 2
    assert.equal(result.y, 10); // 5 + (20 - 10) / 2
  });
});

describe("Modal Size Calculation", () => {
  test("calculates size with title and actions", () => {
    const result = calculateModalSize({
      contentSize: { w: 30, h: 5 },
      hasTitle: true,
      hasActions: true,
      viewportWidth: 80,
    });

    // Content + border (2) + padding (2) + title (1) + actions (2)
    assert.ok(result.w >= 30);
    assert.ok(result.h >= 5 + 2 + 1 + 2);
  });

  test("respects explicit width", () => {
    const result = calculateModalSize({
      contentSize: { w: 30, h: 5 },
      hasTitle: false,
      hasActions: false,
      width: 50,
      viewportWidth: 80,
    });

    assert.equal(result.w, 50);
  });

  test("respects maxWidth", () => {
    const result = calculateModalSize({
      contentSize: { w: 100, h: 5 },
      hasTitle: false,
      hasActions: false,
      maxWidth: 40,
      viewportWidth: 80,
    });

    assert.ok(result.w <= 40);
  });

  test("constrains to viewport", () => {
    const result = calculateModalSize({
      contentSize: { w: 100, h: 5 },
      hasTitle: false,
      hasActions: false,
      viewportWidth: 80,
    });

    assert.ok(result.w <= 76); // 80 - 4 margin
  });
});

/* ========== Layer Routing Tests ========== */

describe("Layer ESC Routing", () => {
  const escEvent = {
    kind: "key" as const,
    key: ZR_KEY_ESCAPE,
    mods: 0,
    action: "down" as const,
    timeMs: 0,
  };
  const otherEvent = {
    kind: "key" as const,
    key: ZR_KEY_ENTER,
    mods: 0,
    action: "down" as const,
    timeMs: 0,
  };

  test("ESC closes topmost layer with closeOnEscape", () => {
    let closedLayer: string | null = null;

    const result = routeLayerEscape(escEvent, {
      layerStack: ["modal1", "modal2"],
      closeOnEscape: new Map([
        ["modal1", true],
        ["modal2", true],
      ]),
      onClose: new Map([
        [
          "modal2",
          () => {
            closedLayer = "modal2";
          },
        ],
      ]),
    });

    assert.equal(result.closedLayerId, "modal2");
    assert.equal(result.consumed, true);
    assert.equal(closedLayer, "modal2");
  });

  test("ESC skips layers with closeOnEscape=false", () => {
    let closedLayer: string | null = null;

    const result = routeLayerEscape(escEvent, {
      layerStack: ["modal1", "modal2"],
      closeOnEscape: new Map([
        ["modal1", true],
        ["modal2", false],
      ]),
      onClose: new Map([
        [
          "modal1",
          () => {
            closedLayer = "modal1";
          },
        ],
      ]),
    });

    assert.equal(result.closedLayerId, "modal1");
    assert.equal(closedLayer, "modal1");
  });

  test("non-ESC key is not consumed", () => {
    const result = routeLayerEscape(otherEvent, {
      layerStack: ["modal1"],
      closeOnEscape: new Map([["modal1", true]]),
      onClose: new Map(),
    });

    assert.equal(result.consumed, false);
    assert.equal(result.closedLayerId, undefined);
  });

  test("ESC with empty stack is not consumed", () => {
    const result = routeLayerEscape(escEvent, {
      layerStack: [],
      closeOnEscape: new Map(),
      onClose: new Map(),
    });

    assert.equal(result.consumed, false);
  });
});

describe("Dropdown Key Routing", () => {
  const items = [
    { id: "item1", label: "Item 1" },
    { id: "divider", label: "", divider: true },
    { id: "item2", label: "Item 2" },
    { id: "item3", label: "Item 3", disabled: true },
    { id: "item4", label: "Item 4" },
  ];

  test("ArrowDown moves selection to next selectable", () => {
    const result = routeDropdownKey(
      { kind: "key", key: ZR_KEY_DOWN, mods: 0, action: "down", timeMs: 0 },
      {
        dropdownId: "menu",
        items,
        selectedIndex: 0, // item1
      },
    );

    // Should skip divider and move to item2
    assert.equal(result.nextSelectedIndex, 2); // index of item2
    assert.equal(result.consumed, true);
  });

  test("ArrowUp moves selection to previous selectable", () => {
    const result = routeDropdownKey(
      { kind: "key", key: ZR_KEY_UP, mods: 0, action: "down", timeMs: 0 },
      {
        dropdownId: "menu",
        items,
        selectedIndex: 4, // item4
      },
    );

    // Should skip item3 (disabled) and move to item2
    assert.equal(result.nextSelectedIndex, 2);
    assert.equal(result.consumed, true);
  });

  test("Enter activates selected item", () => {
    let selectedId: string | null = null;

    const result = routeDropdownKey(
      { kind: "key", key: ZR_KEY_ENTER, mods: 0, action: "down", timeMs: 0 },
      {
        dropdownId: "menu",
        items,
        selectedIndex: 0,
        onSelect: (item) => {
          selectedId = item.id;
        },
      },
    );

    assert.ok(result.activatedItem);
    assert.equal(result.activatedItem.id, "item1");
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
    assert.equal(selectedId, "item1");
  });

  test("Escape closes dropdown", () => {
    let closeCalled = false;

    const result = routeDropdownKey(
      { kind: "key", key: ZR_KEY_ESCAPE, mods: 0, action: "down", timeMs: 0 },
      {
        dropdownId: "menu",
        items,
        selectedIndex: 0,
        onClose: () => {
          closeCalled = true;
        },
      },
    );

    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
    assert.equal(closeCalled, true);
  });

  test("ArrowDown wraps at end", () => {
    const result = routeDropdownKey(
      { kind: "key", key: ZR_KEY_DOWN, mods: 0, action: "down", timeMs: 0 },
      {
        dropdownId: "menu",
        items,
        selectedIndex: 4, // item4 (last selectable)
      },
    );

    // Should wrap to item1
    assert.equal(result.nextSelectedIndex, 0);
  });
});

/* ========== Widget Factory Tests ========== */

describe("Layer Widgets", () => {
  test("ui.layers filters falsy children", () => {
    const vnode = ui.layers([
      ui.text("always"),
      false && ui.text("never"),
      null,
      undefined,
      ui.text("also"),
    ]);

    assert.equal(vnode.kind, "layers");
    if (vnode.kind === "layers") {
      assert.equal(vnode.children.length, 2);
    }
  });

  test("ui.modal creates modal VNode", () => {
    const vnode = ui.modal({
      id: "confirm",
      title: "Confirm",
      content: ui.text("Are you sure?"),
      actions: [ui.button({ id: "yes", label: "Yes" }), ui.button({ id: "no", label: "No" })],
      backdrop: "dim",
      closeOnEscape: true,
    });

    assert.equal(vnode.kind, "modal");
    if (vnode.kind === "modal") {
      assert.equal(vnode.props.id, "confirm");
      assert.equal(vnode.props.title, "Confirm");
      assert.equal(vnode.props.backdrop, "dim");
    }
  });

  test("ui.dropdown creates dropdown VNode", () => {
    const vnode = ui.dropdown({
      id: "file-menu",
      anchorId: "file-button",
      position: "below-start",
      items: [
        { id: "new", label: "New", shortcut: "Ctrl+N" },
        { id: "open", label: "Open" },
      ],
    });

    assert.equal(vnode.kind, "dropdown");
    if (vnode.kind === "dropdown") {
      assert.equal(vnode.props.id, "file-menu");
      assert.equal(vnode.props.anchorId, "file-button");
      assert.equal(vnode.props.position, "below-start");
      assert.equal(vnode.props.items.length, 2);
    }
  });

  test("ui.layer creates layer VNode", () => {
    const vnode = ui.layer({
      id: "tooltip",
      zIndex: 500,
      content: ui.text("Tooltip text"),
      backdrop: "none",
      modal: false,
    });

    assert.equal(vnode.kind, "layer");
    if (vnode.kind === "layer") {
      assert.equal(vnode.props.id, "tooltip");
      assert.equal(vnode.props.zIndex, 500);
    }
  });
});

/* ========== Backdrop Tests ========== */

describe("Backdrop Configuration", () => {
  test("getBackdrops returns backdrop configs", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal1",
      zIndex: 100,
      rect: { x: 10, y: 10, w: 40, h: 10 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    registry.register({
      id: "tooltip",
      zIndex: 200,
      rect: { x: 20, y: 5, w: 20, h: 3 },
      backdrop: "none",
      modal: false,
      closeOnEscape: false,
    });

    const backdrops = getBackdrops(registry);

    // Only modal1 has backdrop
    assert.equal(backdrops.length, 1);
    assert.equal(backdrops[0]?.style, "dim");
    assert.equal(backdrops[0]?.zIndex, 100);
  });

  test("backdrops returned in z-order", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal1",
      zIndex: 200,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    registry.register({
      id: "modal2",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      backdrop: "opaque",
      modal: true,
      closeOnEscape: true,
    });

    const backdrops = getBackdrops(registry);

    assert.equal(backdrops.length, 2);
    assert.equal(backdrops[0]?.style, "opaque"); // z=100
    assert.equal(backdrops[1]?.style, "dim"); // z=200
  });
});
