import { assert, describe, test } from "@rezi-ui/testkit";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_ESCAPE } from "../../keybindings/keyCodes.js";
import { computeDropdownGeometry } from "../../layout/dropdownGeometry.js";
import { calculateAnchorPosition } from "../../layout/positioning.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
import { type LayerRegistry, hitTestLayers } from "../../runtime/layers.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { DropdownProps, VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Not used by WidgetRenderer unit-style tests.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function escapeKeyEvent(): ZrevEvent {
  return { kind: "key", timeMs: 1, key: ZR_KEY_ESCAPE, mods: 0, action: "down" };
}

function submit(renderer: WidgetRenderer<void>, vnode: VNode): void {
  const res = renderer.submitFrame(
    () => vnode,
    undefined,
    { cols: 80, rows: 24 },
    defaultTheme,
    noRenderHooks(),
  );
  assert.ok(res.ok);
}

function getLayerRegistry(renderer: WidgetRenderer<void>): LayerRegistry {
  const internal = renderer as unknown as Readonly<{ layerRegistry: LayerRegistry }>;
  return internal.layerRegistry;
}

function captureConsoleWarn<T>(run: (warnings: string[]) => T): T {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  const warnings: string[] = [];
  const hadWarn = c ? "warn" in c : false;
  const originalWarn = c?.warn;
  if (c) {
    c.warn = (msg: string) => {
      warnings.push(msg);
    };
  }
  try {
    return run(warnings);
  } finally {
    if (!c) {
      // no-op
    } else if (hadWarn && originalWarn) {
      c.warn = originalWarn;
    } else {
      (c as { warn: ((msg: string) => void) | undefined }).warn = undefined;
    }
  }
}

function computeDropdownGeometryLegacy(
  props: DropdownProps,
  anchorRect: Rect | null,
  viewport: Readonly<{ cols: number; rows: number }>,
): Rect | null {
  if (!anchorRect || viewport.cols <= 0 || viewport.rows <= 0) return null;

  const items = Array.isArray(props.items) ? props.items : [];
  let maxLabelW = 0;
  let maxShortcutW = 0;
  for (const item of items) {
    if (!item || item.divider) continue;
    const labelW = measureTextCells(item.label);
    if (labelW > maxLabelW) maxLabelW = labelW;
    const shortcut = item.shortcut;
    if (shortcut && shortcut.length > 0) {
      const shortcutW = measureTextCells(shortcut);
      if (shortcutW > maxShortcutW) maxShortcutW = shortcutW;
    }
  }

  const gapW = maxShortcutW > 0 ? 1 : 0;
  const contentW = Math.max(1, maxLabelW + gapW + maxShortcutW);
  const totalW = Math.max(2, contentW + 2);
  const totalH = Math.max(2, items.length + 2);

  const pos = calculateAnchorPosition({
    anchor: anchorRect,
    overlaySize: { w: totalW, h: totalH },
    position: props.position ?? "below-start",
    viewport: { x: 0, y: 0, width: viewport.cols, height: viewport.rows },
    gap: 0,
    flip: true,
  });
  return pos.rect;
}

describe("overlay unification", () => {
  test("dropdowns are registered in LayerRegistry after commit", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    submit(
      renderer,
      ui.layers([
        ui.button({ id: "anchor", label: "Anchor" }),
        ui.dropdown({
          id: "menu",
          anchorId: "anchor",
          items: [{ id: "a", label: "Alpha" }],
        }),
      ]),
    );

    const layers = getLayerRegistry(renderer)
      .getAll()
      .map((l) => l.id);
    assert.equal(layers.includes("dropdown:menu"), true);
  });

  test("dropdown z-order respects registration sequence relative to modal", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    submit(
      renderer,
      ui.layers([
        ui.button({ id: "anchor", label: "Anchor" }),
        ui.dropdown({
          id: "menu",
          anchorId: "anchor",
          items: [{ id: "a", label: "Alpha" }],
        }),
        ui.modal({
          id: "modal.main",
          title: "Modal",
          content: ui.text("content"),
        }),
      ]),
    );

    const layers = getLayerRegistry(renderer).getAll();
    const dropdown = layers.find((l) => l.id === "dropdown:menu");
    const modal = layers.find((l) => l.id === "modal.main");
    assert.ok(dropdown);
    assert.ok(modal);
    assert.ok(dropdown.zIndex < modal.zIndex);
  });

  test("computeDropdownGeometry matches legacy inline behavior", () => {
    const props: DropdownProps = {
      id: "menu",
      anchorId: "anchor",
      position: "below-start",
      items: [
        { id: "new", label: "New", shortcut: "Ctrl+N" },
        { id: "open", label: "Open", shortcut: "Ctrl+O" },
        { id: "sep", label: "", divider: true },
        { id: "quit", label: "Quit" },
      ],
    };
    const anchorRect: Rect = { x: 8, y: 4, w: 12, h: 1 };
    const viewport = { cols: 80, rows: 24 };

    assert.deepEqual(
      computeDropdownGeometry(props, anchorRect, viewport),
      computeDropdownGeometryLegacy(props, anchorRect, viewport),
    );
  });

  test("warns when dropdown anchor id is missing", () => {
    const warnings = captureConsoleWarn((messages) => {
      const renderer = new WidgetRenderer<void>({
        backend: createNoopBackend(),
        requestRender: () => {},
      });

      submit(
        renderer,
        ui.layers([
          ui.dropdown({
            id: "menu",
            anchorId: "missing-anchor",
            items: [{ id: "a", label: "Alpha" }],
          }),
        ]),
      );

      return messages;
    });

    assert.equal(
      warnings.some((msg) =>
        msg.includes('[rezi][overlay] dropdown "menu" anchor not found: "missing-anchor"'),
      ),
      true,
    );
  });

  test("toast containers are registered in LayerRegistry", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    submit(
      renderer,
      ui.layers([
        ui.toastContainer({
          toasts: [{ id: "t1", message: "Saved", type: "success" }],
          onDismiss: () => {},
        }),
      ]),
    );

    const layers = getLayerRegistry(renderer)
      .getAll()
      .map((l) => l.id);
    assert.equal(layers.includes("toast:default"), true);
  });

  test("modal hit-testing behavior is unchanged", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    submit(
      renderer,
      ui.layers([
        ui.modal({
          id: "modal.hit",
          title: "Modal",
          content: ui.text("content"),
        }),
      ]),
    );

    const registry = getLayerRegistry(renderer);
    const modal = registry.getAll().find((l) => l.id === "modal.hit");
    assert.ok(modal);

    const inside = hitTestLayers(registry, modal.rect.x, modal.rect.y);
    assert.equal(inside.layer?.id, "modal.hit");
    assert.equal(inside.blocked, false);

    const blocked = hitTestLayers(registry, -1, -1);
    assert.equal(blocked.layer, null);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.blockingLayer?.id, "modal.hit");
  });

  test("ESC closes the topmost overlay regardless of type", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let dropdownClosed = 0;
    submit(
      renderer,
      ui.layers([
        ui.button({ id: "anchor", label: "Anchor" }),
        ui.dropdown({
          id: "menu",
          anchorId: "anchor",
          items: [{ id: "a", label: "Alpha" }],
          onClose: () => {
            dropdownClosed++;
          },
        }),
      ]),
    );
    renderer.routeEngineEvent(escapeKeyEvent());
    assert.equal(dropdownClosed, 1);

    let modalClosed = 0;
    dropdownClosed = 0;
    submit(
      renderer,
      ui.layers([
        ui.button({ id: "anchor", label: "Anchor" }),
        ui.dropdown({
          id: "menu",
          anchorId: "anchor",
          items: [{ id: "a", label: "Alpha" }],
          onClose: () => {
            dropdownClosed++;
          },
        }),
        ui.modal({
          id: "modal.top",
          title: "Modal",
          content: ui.text("content"),
          onClose: () => {
            modalClosed++;
          },
        }),
      ]),
    );
    renderer.routeEngineEvent(escapeKeyEvent());
    assert.equal(modalClosed, 1);
    assert.equal(dropdownClosed, 0);

    let layerClosed = 0;
    submit(
      renderer,
      ui.layers([
        ui.button({ id: "anchor", label: "Anchor" }),
        ui.dropdown({
          id: "menu",
          anchorId: "anchor",
          items: [{ id: "a", label: "Alpha" }],
          onClose: () => {
            dropdownClosed++;
          },
        }),
        ui.modal({
          id: "modal.base",
          title: "Modal",
          content: ui.text("content"),
          onClose: () => {
            modalClosed++;
          },
        }),
        ui.layer({
          id: "layer.top",
          closeOnEscape: true,
          onClose: () => {
            layerClosed++;
          },
          content: ui.text("Layer"),
        }),
      ]),
    );
    renderer.routeEngineEvent(escapeKeyEvent());
    assert.equal(layerClosed, 1);
    assert.equal(modalClosed, 1);
    assert.equal(dropdownClosed, 0);
  });
});
