import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuildResult, DrawlistBuilder } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import { ui } from "../../index.js";
import { type LayoutTree, layout } from "../../layout/layout.js";
import { type RuntimeInstance, commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { indexIdRects, indexLayoutRects } from "../renderToDrawlist/indices.js";
import { renderTree } from "../renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "../renderToDrawlist/textStyle.js";

type RecordedOp =
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string }>
  | Readonly<{ kind: "drawTextRun"; x: number; y: number; blobIndex: number }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

class RecordingBuilder implements DrawlistBuilder {
  readonly ops: RecordedOp[] = [];
  private nextBlob = 1;

  clear(): void {}
  clearTo(_cols: number, _rows: number): void {}

  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: "fillRect", x, y, w, h });
  }

  drawText(x: number, y: number, text: string): void {
    this.ops.push({ kind: "drawText", x, y, text });
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: "pushClip", x, y, w, h });
  }

  popClip(): void {
    this.ops.push({ kind: "popClip" });
  }

  addBlob(_bytes: Uint8Array): number | null {
    const id = this.nextBlob;
    this.nextBlob += 1;
    return id;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    const id = this.nextBlob;
    this.nextBlob += 1;
    return id;
  }

  drawTextRun(x: number, y: number, blobIndex: number): void {
    this.ops.push({ kind: "drawTextRun", x, y, blobIndex });
  }

  setCursor(..._args: Parameters<DrawlistBuilder["setCursor"]>): void {}
  hideCursor(): void {}
  setLink(..._args: Parameters<DrawlistBuilder["setLink"]>): void {}
  drawCanvas(..._args: Parameters<DrawlistBuilder["drawCanvas"]>): void {}
  drawImage(..._args: Parameters<DrawlistBuilder["drawImage"]>): void {}
  blitRect(..._args: Parameters<DrawlistBuilder["blitRect"]>): void {}

  buildInto(_dst: Uint8Array): DrawlistBuildResult {
    return this.build();
  }

  build(): DrawlistBuildResult {
    return { ok: true, bytes: new Uint8Array([0]) };
  }

  reset(): void {}
}

type Scene = Readonly<{
  tree: RuntimeInstance;
  layoutTree: LayoutTree;
}>;

function createScene(root: RuntimeInstance, x: number, y: number): Scene {
  const laidOut = layout(root.vnode, x, y, 80, 24, "column");
  assert.equal(laidOut.ok, true, "layout should succeed");
  if (!laidOut.ok) {
    throw new Error("layout should succeed");
  }
  return { tree: root, layoutTree: laidOut.value };
}

function renderScene(scene: Scene): RecordingBuilder {
  const layoutIndex = indexLayoutRects(scene.layoutTree, scene.tree);
  const idRectIndex = indexIdRects(scene.tree, layoutIndex);
  const builder = new RecordingBuilder();
  renderTree(
    builder,
    Object.freeze({ focusedId: null }),
    scene.layoutTree,
    idRectIndex,
    Object.freeze({ cols: 80, rows: 24 }),
    defaultTheme,
    0,
    DEFAULT_BASE_STYLE,
    scene.tree,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    null,
    undefined,
    undefined,
    null,
  );
  return builder;
}

function firstDrawText(ops: readonly RecordedOp[]): Extract<RecordedOp, { kind: "drawText" }> {
  const op = ops.find((entry): entry is Extract<RecordedOp, { kind: "drawText" }> => {
    return entry.kind === "drawText";
  });
  if (op === undefined) {
    throw new Error("expected at least one drawText op");
  }
  return op;
}

describe("render packet retention", () => {
  test("records packet on clean frame and reuses it across layout-only moves", () => {
    const committed = commitVNodeTree(null, ui.text("retained"), {
      allocator: createInstanceIdAllocator(1),
    });
    assert.equal(committed.ok, true, "commit should succeed");
    if (!committed.ok) return;

    const root = committed.value.root;
    const coldFrame = renderScene(createScene(root, 0, 0));
    assert.equal(coldFrame.ops.length > 0, true);
    assert.equal(root.renderPacket, null, "selfDirty cold frame should skip packet recording");
    assert.equal(root.renderPacketKey, 0, "selfDirty cold frame should reset packet key");

    root.dirty = true;
    root.selfDirty = false;
    renderScene(createScene(root, 0, 0));
    const firstPacket = root.renderPacket;
    const firstKey = root.renderPacketKey;
    assert.ok(firstPacket !== null, "expected packet after clean frame");
    assert.notEqual(firstKey, 0, "expected non-zero packet key");

    root.dirty = true;
    root.selfDirty = false;
    const movedFrame = renderScene(createScene(root, 7, 3));

    assert.equal(root.renderPacket, firstPacket, "layout-only frame should reuse cached packet");
    assert.equal(
      root.renderPacketKey,
      firstKey,
      "packet key should stay stable across layout move",
    );

    const drawText = firstDrawText(movedFrame.ops);
    assert.equal(drawText.x, 7);
    assert.equal(drawText.y, 3);
    assert.equal(drawText.text, "retained");
  });

  test("selfDirty invalidates retained packet cache", () => {
    const committed = commitVNodeTree(null, ui.text("rebuild"), {
      allocator: createInstanceIdAllocator(1),
    });
    assert.equal(committed.ok, true, "commit should succeed");
    if (!committed.ok) return;

    const root = committed.value.root;
    renderScene(createScene(root, 0, 0));
    root.dirty = true;
    root.selfDirty = false;
    renderScene(createScene(root, 0, 0));
    const firstPacket = root.renderPacket;
    assert.ok(firstPacket !== null, "expected packet after first render");
    assert.notEqual(root.renderPacketKey, 0, "expected packet key after first render");

    root.dirty = true;
    root.selfDirty = true;
    renderScene(createScene(root, 0, 0));
    assert.equal(root.renderPacket, null, "selfDirty should drop retained packet");
    assert.equal(root.renderPacketKey, 0, "selfDirty should reset packet key");
  });

  test("packet reuses when props object identity changes but visual fields unchanged", () => {
    // First render with one VNode instance.
    const committed1 = commitVNodeTree(null, ui.text("stable"), {
      allocator: createInstanceIdAllocator(1),
    });
    assert.equal(committed1.ok, true, "commit 1");
    if (!committed1.ok) return;

    const root = committed1.value.root;
    renderScene(createScene(root, 0, 0));
    root.dirty = true;
    root.selfDirty = false;
    renderScene(createScene(root, 0, 0));
    const firstPacket = root.renderPacket;
    const firstKey = root.renderPacketKey;
    assert.ok(firstPacket !== null, "expected packet");
    assert.notEqual(firstKey, 0, "expected non-zero key");

    // Simulate new VNode instance with identical content (object identity changes).
    const newVnode = ui.text("stable");
    (root as { vnode: typeof newVnode }).vnode = newVnode;
    root.dirty = true;
    root.selfDirty = false;

    renderScene(createScene(root, 0, 0));
    assert.equal(
      root.renderPacketKey,
      firstKey,
      "key should remain stable when visual fields are unchanged despite new object identity",
    );
    assert.equal(root.renderPacket, firstPacket, "packet should be reused when key matches");
  });

  test("packet invalidates when visual field changes", () => {
    const committed = commitVNodeTree(null, ui.text("before"), {
      allocator: createInstanceIdAllocator(1),
    });
    assert.equal(committed.ok, true, "commit");
    if (!committed.ok) return;

    const root = committed.value.root;
    renderScene(createScene(root, 0, 0));
    root.dirty = true;
    root.selfDirty = false;
    renderScene(createScene(root, 0, 0));
    const firstKey = root.renderPacketKey;
    assert.notEqual(firstKey, 0, "expected non-zero key");

    // Change the text content.
    const newVnode = ui.text("after");
    (root as { vnode: typeof newVnode }).vnode = newVnode;
    root.dirty = true;
    root.selfDirty = false;

    renderScene(createScene(root, 0, 0));
    assert.notEqual(
      root.renderPacketKey,
      firstKey,
      "key should change when visual content changes",
    );
  });

  test("no output drift: stable-key render matches fresh render", () => {
    const committed = commitVNodeTree(null, ui.text("drift-check"), {
      allocator: createInstanceIdAllocator(1),
    });
    assert.equal(committed.ok, true, "commit");
    if (!committed.ok) return;

    const root = committed.value.root;
    // First: cold render (selfDirty → full render)
    const coldOps = renderScene(createScene(root, 2, 1));

    // Second: warm render (should use packet)
    root.dirty = true;
    root.selfDirty = false;
    renderScene(createScene(root, 2, 1));
    assert.ok(root.renderPacket !== null, "expected cached packet");

    // Third: emit from cached packet
    root.dirty = true;
    root.selfDirty = false;
    const warmOps = renderScene(createScene(root, 2, 1));

    // Verify drawText ops match.
    const coldTexts = coldOps.ops
      .filter((o): o is Extract<RecordedOp, { kind: "drawText" }> => o.kind === "drawText")
      .map((o) => ({ x: o.x, y: o.y, text: o.text }));
    const warmTexts = warmOps.ops
      .filter((o): o is Extract<RecordedOp, { kind: "drawText" }> => o.kind === "drawText")
      .map((o) => ({ x: o.x, y: o.y, text: o.text }));
    assert.deepEqual(warmTexts, coldTexts, "cached emit should match cold render");
  });
});
