import type {
  DrawlistCanvasBlitter,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  DrawlistTextRunSegment,
} from "../drawlist/types.js";
import type { TextStyle } from "../widgets/style.js";

export type RenderPacketFillRectOp = Readonly<{
  op: "FILL_RECT";
  x: number;
  y: number;
  w: number;
  h: number;
  style?: TextStyle;
}>;

export type RenderPacketDrawTextSliceOp = Readonly<{
  op: "DRAW_TEXT_SLICE";
  x: number;
  y: number;
  text: string;
  style?: TextStyle;
}>;

export type RenderPacketDrawTextRunOp = Readonly<{
  op: "DRAW_TEXT_RUN";
  x: number;
  y: number;
  segments: readonly DrawlistTextRunSegment[];
}>;

export type RenderPacketPushClipOp = Readonly<{
  op: "PUSH_CLIP";
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type RenderPacketPopClipOp = Readonly<{ op: "POP_CLIP" }>;

export type RenderPacketDrawCanvasOp = Readonly<{
  op: "DRAW_CANVAS";
  x: number;
  y: number;
  w: number;
  h: number;
  resourceId: number;
  blitter: DrawlistCanvasBlitter;
  pxWidth?: number;
  pxHeight?: number;
}>;

export type RenderPacketDrawImageOp = Readonly<{
  op: "DRAW_IMAGE";
  x: number;
  y: number;
  w: number;
  h: number;
  resourceId: number;
  format: DrawlistImageFormat;
  protocol: DrawlistImageProtocol;
  zLayer: -1 | 0 | 1;
  fit: DrawlistImageFit;
  imageId: number;
  pxWidth?: number;
  pxHeight?: number;
}>;

export type RenderPacketOp =
  | RenderPacketFillRectOp
  | RenderPacketDrawTextSliceOp
  | RenderPacketDrawTextRunOp
  | RenderPacketPushClipOp
  | RenderPacketPopClipOp
  | RenderPacketDrawCanvasOp
  | RenderPacketDrawImageOp;

export type RenderPacket = Readonly<{
  ops: readonly RenderPacketOp[];
  resources: readonly Uint8Array[];
}>;
