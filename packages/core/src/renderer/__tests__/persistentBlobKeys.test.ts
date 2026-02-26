import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuilder, DrawlistTextRunSegment } from "../../drawlist/types.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { DEFAULT_BASE_STYLE } from "../renderToDrawlist/textStyle.js";
import { renderCanvasWidgets } from "../renderToDrawlist/widgets/renderCanvasWidgets.js";
import { drawSegments } from "../renderToDrawlist/widgets/renderTextWidgets.js";

class CountingBuilder implements DrawlistBuilder {
  readonly blobCount = { value: 0 };
  readonly textRunBlobCount = { value: 0 };
  private nextBlobId = 0;

  clear(): void {}
  clearTo(_cols: number, _rows: number): void {}
  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  drawText(_x: number, _y: number, _text: string): void {}
  pushClip(_x: number, _y: number, _w: number, _h: number): void {}
  popClip(): void {}
  drawTextRun(_x: number, _y: number, _blobId: number): void {}
  setCursor(
    _state: Readonly<{ x: number; y: number; shape: 0 | 1 | 2; visible: boolean; blink: boolean }>,
  ): void {}
  hideCursor(): void {}
  setLink(_uri: string | null, _id?: string): void {}
  drawCanvas(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _blobId: number,
    _blitter: "auto" | "braille" | "sextant" | "quadrant" | "halfblock" | "ascii",
    _pxWidth?: number,
    _pxHeight?: number,
  ): void {}
  drawImage(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _blobId: number,
    _format: "rgba" | "png",
    _protocol: "auto" | "kitty" | "sixel" | "iterm2" | "blitter",
    _zLayer: -1 | 0 | 1,
    _fit: "fill" | "contain" | "cover",
    _imageId: number,
    _pxWidth?: number,
    _pxHeight?: number,
  ): void {}

  addBlob(_bytes: Uint8Array): number | null {
    this.blobCount.value += 1;
    const id = this.nextBlobId;
    this.nextBlobId += 1;
    return id;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    this.textRunBlobCount.value += 1;
    const id = this.nextBlobId;
    this.nextBlobId += 1;
    return id;
  }

  build() {
    return { ok: true as const, bytes: new Uint8Array(64) };
  }

  buildInto(dst: Uint8Array) {
    return { ok: true as const, bytes: dst.subarray(0, 0) };
  }

  reset(): void {}
}

describe("renderer blob usage", () => {
  test("drawSegments uses text-run blobs for multi-segment lines", () => {
    const segments = [
      { text: "left", style: { ...DEFAULT_BASE_STYLE, bold: true } },
      { text: "right", style: { ...DEFAULT_BASE_STYLE, italic: true } },
    ] as const;

    const builder = new CountingBuilder();
    drawSegments(builder, 0, 0, 80, segments);
    assert.equal(builder.textRunBlobCount.value, 1);
  });

  test("canvas/image widget paths call addBlob", () => {
    const builder = new CountingBuilder();

    const canvasNode = {
      instanceId: 7,
      vnode: {
        kind: "canvas",
        props: {
          draw: (ctx: { setPixel: (x: number, y: number, color: string) => void }) => {
            ctx.setPixel(0, 0, "#ffffff");
          },
          blitter: "ascii",
        },
      },
      children: [],
      dirty: false,
      selfDirty: false,
    };

    const imageNode = {
      instanceId: 8,
      vnode: {
        kind: "image",
        props: {
          src: new Uint8Array([255, 0, 0, 255]),
          sourceWidth: 1,
          sourceHeight: 1,
          protocol: "blitter",
          imageId: 42,
        },
      },
      children: [],
      dirty: false,
      selfDirty: false,
    };

    renderCanvasWidgets(
      builder,
      { x: 0, y: 0, w: 1, h: 1 },
      defaultTheme,
      DEFAULT_BASE_STYLE,
      canvasNode as never,
      undefined,
      () => 0,
    );

    renderCanvasWidgets(
      builder,
      { x: 0, y: 0, w: 1, h: 1 },
      defaultTheme,
      DEFAULT_BASE_STYLE,
      imageNode as never,
      undefined,
      () => 0,
    );

    assert.equal(builder.blobCount.value >= 2, true);
  });
});
