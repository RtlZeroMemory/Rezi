import { assert } from "@rezi-ui/testkit";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type {
  DrawlistBuildResult,
  DrawlistBuilderV1,
  TextStyle,
  Theme,
  VNode,
} from "../../index.js";
import { layout } from "../../layout/layout.js";
import type { Axis } from "../../layout/types.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

export type DrawOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

class RecordingBuilder implements DrawlistBuilderV1 {
  readonly ops: DrawOp[] = [];

  clear(): void {
    this.ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    this.ops.push(style ? { kind: "clearTo", cols, rows, style } : { kind: "clearTo", cols, rows });
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    this.ops.push(
      style ? { kind: "fillRect", x, y, w, h, style } : { kind: "fillRect", x, y, w, h },
    );
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    this.ops.push(
      style ? { kind: "drawText", x, y, text, style } : { kind: "drawText", x, y, text },
    );
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: "pushClip", x, y, w, h });
  }

  popClip(): void {
    this.ops.push({ kind: "popClip" });
  }

  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    // Force deterministic drawText commands for style assertions.
    return null;
  }

  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}

  build(): DrawlistBuildResult {
    return { ok: true, bytes: new Uint8Array() };
  }

  reset(): void {
    this.ops.length = 0;
  }
}

export type RenderOpsOptions = Readonly<{
  viewport?: Readonly<{ cols: number; rows: number }>;
  axis?: Axis;
  focusedId?: string | null;
  pressedId?: string | null;
  theme?: Theme;
}>;

export function renderOps(vnode: VNode, options: RenderOpsOptions = {}): readonly DrawOp[] {
  const viewport = options.viewport ?? { cols: 80, rows: 24 };
  const axis = options.axis ?? "column";
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return Object.freeze([]);

  const laidOut = layout(committed.value.root.vnode, 0, 0, viewport.cols, viewport.rows, axis);
  assert.equal(laidOut.ok, true, "layout should succeed");
  if (!laidOut.ok) return Object.freeze([]);

  const builder = new RecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: laidOut.value,
    viewport,
    focusState: Object.freeze({ focusedId: options.focusedId ?? null }),
    pressedId: options.pressedId ?? null,
    ...(options.theme ? { theme: options.theme } : {}),
    builder,
  });
  return Object.freeze(builder.ops.slice());
}
