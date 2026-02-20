import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createCanvasDrawingSurface,
  getCanvasResolution,
  resolveCanvasBlitter,
} from "../canvas.js";

function rgbaAt(surface: ReturnType<typeof createCanvasDrawingSurface>, x: number, y: number) {
  const off = (y * surface.widthPx + x) * 4;
  return {
    r: surface.rgba[off] ?? 0,
    g: surface.rgba[off + 1] ?? 0,
    b: surface.rgba[off + 2] ?? 0,
    a: surface.rgba[off + 3] ?? 0,
  };
}

describe("canvas primitives", () => {
  test("braille resolution doubles columns and quadruples rows", () => {
    const res = getCanvasResolution("braille");
    assert.deepEqual(res, { subWidth: 2, subHeight: 4 });
  });

  test("auto blitter resolves deterministically", () => {
    assert.equal(resolveCanvasBlitter("auto", true), "braille");
    assert.equal(resolveCanvasBlitter("auto", false), "ascii");
  });

  test("drawing surface resolves auto blitter to concrete pixel resolution", () => {
    const surface = createCanvasDrawingSurface(3, 2, "auto", () => ({ r: 1, g: 2, b: 3 }));
    assert.equal(surface.blitter, "braille");
    assert.equal(surface.widthPx, 6);
    assert.equal(surface.heightPx, 8);
  });

  test("setPixel writes RGBA bytes", () => {
    const surface = createCanvasDrawingSurface(2, 2, "ascii", () => ({ r: 10, g: 20, b: 30 }));
    surface.ctx.setPixel(1, 1, "#112233");
    assert.deepEqual(rgbaAt(surface, 1, 1), { r: 17, g: 34, b: 51, a: 255 });
  });

  test("line draws deterministic diagonal pixels", () => {
    const surface = createCanvasDrawingSurface(4, 4, "ascii", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.line(0, 0, 3, 3, "#ffffff");
    assert.equal(rgbaAt(surface, 0, 0).a, 255);
    assert.equal(rgbaAt(surface, 1, 1).a, 255);
    assert.equal(rgbaAt(surface, 2, 2).a, 255);
    assert.equal(rgbaAt(surface, 3, 3).a, 255);
  });

  test("fillRect fills the requested region", () => {
    const surface = createCanvasDrawingSurface(4, 3, "ascii", () => ({ r: 255, g: 0, b: 0 }));
    surface.ctx.fillRect(1, 1, 2, 1, "#ff0000");
    assert.equal(rgbaAt(surface, 1, 1).r, 255);
    assert.equal(rgbaAt(surface, 2, 1).r, 255);
    assert.equal(rgbaAt(surface, 0, 1).a, 0);
  });

  test("strokeRect draws perimeter only", () => {
    const surface = createCanvasDrawingSurface(5, 5, "ascii", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.strokeRect(1, 1, 3, 3, "#ffffff");
    assert.equal(rgbaAt(surface, 1, 1).a, 255);
    assert.equal(rgbaAt(surface, 2, 1).a, 255);
    assert.equal(rgbaAt(surface, 3, 3).a, 255);
    assert.equal(rgbaAt(surface, 2, 2).a, 0);
  });

  test("circle outlines are symmetric", () => {
    const surface = createCanvasDrawingSurface(11, 11, "ascii", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.circle(5, 5, 3, "#ffffff");
    assert.equal(rgbaAt(surface, 5, 2).a, 255);
    assert.equal(rgbaAt(surface, 5, 8).a, 255);
    assert.equal(rgbaAt(surface, 2, 5).a, 255);
    assert.equal(rgbaAt(surface, 8, 5).a, 255);
  });

  test("fillCircle paints interior pixels", () => {
    const surface = createCanvasDrawingSurface(9, 9, "ascii", () => ({ r: 0, g: 255, b: 0 }));
    surface.ctx.fillCircle(4, 4, 2, "#00ff00");
    assert.equal(rgbaAt(surface, 4, 4).g, 255);
    assert.equal(rgbaAt(surface, 4, 2).g, 255);
    assert.equal(rgbaAt(surface, 6, 4).g, 255);
    assert.equal(rgbaAt(surface, 1, 1).a, 0);
  });

  test("text overlays map subcell coordinates to cell coordinates", () => {
    const surface = createCanvasDrawingSurface(4, 2, "braille", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.text(3, 5, "ok", "#ffaa00");
    surface.ctx.text(-0.2, 0, "hidden");
    assert.deepEqual(surface.overlays, [{ x: 1, y: 1, text: "ok", color: "#ffaa00" }]);
  });

  test("clear removes pixels and overlay text", () => {
    const surface = createCanvasDrawingSurface(2, 2, "ascii", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.setPixel(1, 1, "#ffffff");
    surface.ctx.text(0, 0, "hi");
    surface.ctx.clear();
    assert.equal(
      surface.rgba.every((value) => value === 0),
      true,
    );
    assert.equal(surface.overlays.length, 0);
  });

  test("clear with color fills surface and clears overlays", () => {
    const surface = createCanvasDrawingSurface(2, 1, "ascii", () => ({ r: 255, g: 255, b: 255 }));
    surface.ctx.text(0, 0, "x");
    surface.ctx.clear("#123456");
    assert.deepEqual(rgbaAt(surface, 0, 0), { r: 18, g: 52, b: 86, a: 255 });
    assert.deepEqual(rgbaAt(surface, 1, 0), { r: 18, g: 52, b: 86, a: 255 });
    assert.equal(surface.overlays.length, 0);
  });
});
