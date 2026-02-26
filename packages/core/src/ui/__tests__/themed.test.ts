import { assert, describe, test } from "@rezi-ui/testkit";
import type {
  DrawlistBuildResult,
  DrawlistBuilder,
  DrawlistTextRunSegment,
} from "../../drawlist/types.js";
import { layout } from "../../layout/layout.js";
import type { LayoutTree } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { createTheme } from "../../theme/theme.js";
import type { TextStyle } from "../../widgets/style.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

class RecordingBuilder implements DrawlistBuilder {
  readonly textOps: Array<Readonly<{ text: string; style?: TextStyle }>> = [];

  clear(): void {}
  clearTo(_cols: number, _rows: number, _style?: TextStyle): void {}
  fillRect(_x: number, _y: number, _w: number, _h: number, _style?: TextStyle): void {}
  drawText(_x: number, _y: number, text: string, style?: TextStyle): void {
    this.textOps.push(style ? { text, style } : { text });
  }
  pushClip(_x: number, _y: number, _w: number, _h: number): void {}
  popClip(): void {}
  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }
  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    return null;
  }
  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}
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
    return { ok: true, bytes: new Uint8Array() };
  }
  reset(): void {}
}

function commitAndLayout(vnode: VNode): LayoutTree {
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) throw new Error("commit failed");
  const layoutRes = layout(committed.value.root.vnode, 0, 0, 60, 12, "column");
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) throw new Error("layout failed");
  return layoutRes.value;
}

function renderTextOps(
  vnode: VNode,
  theme: ReturnType<typeof createTheme>,
): readonly Readonly<{ text: string; style?: TextStyle }>[] {
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return [];

  const layoutRes = layout(committed.value.root.vnode, 0, 0, 60, 12, "column");
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return [];

  const builder = new RecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport: { cols: 60, rows: 12 },
    focusState: Object.freeze({ focusedId: null }),
    builder,
    theme,
  });
  return builder.textOps;
}

function fgByText(
  ops: readonly Readonly<{ text: string; style?: TextStyle }>[],
  text: string,
): unknown {
  for (const op of ops) {
    if (op.text.includes(text)) return op.style?.fg;
  }
  return undefined;
}

describe("ui.themed", () => {
  test("creates themed vnode and filters children", () => {
    const vnode = ui.themed({ colors: { accent: { primary: (1 << 16) | (2 << 8) | 3 } } }, [
      ui.text("a"),
      null,
      false,
      [ui.text("b")],
    ]);
    assert.equal(vnode.kind, "themed");
    if (vnode.kind !== "themed") return;
    assert.equal(vnode.children.length, 2);
    assert.deepEqual((vnode.props.theme as { colors?: unknown }).colors, {
      accent: { primary: (1 << 16) | (2 << 8) | 3 },
    });
  });

  test("applies theme override to subtree without leaking to siblings", () => {
    const baseTheme = createTheme({
      colors: {
        primary: (200 << 16) | (40 << 8) | 40,
      },
    });
    const scopedPrimary = (30 << 16) | (210 << 8) | 40;

    const vnode = ui.column({}, [
      ui.divider({ label: "OUT", color: "primary" }),
      ui.themed(
        {
          colors: {
            accent: {
              primary: scopedPrimary,
            },
          },
        },
        [ui.divider({ label: "IN", color: "primary" })],
      ),
      ui.divider({ label: "AFTER", color: "primary" }),
    ]);

    const ops = renderTextOps(vnode, baseTheme);
    assert.deepEqual(fgByText(ops, "OUT"), baseTheme.colors.primary);
    assert.deepEqual(fgByText(ops, "IN"), scopedPrimary);
    assert.deepEqual(fgByText(ops, "AFTER"), baseTheme.colors.primary);
  });

  test("is layout-transparent for single-child subtrees", () => {
    const tree = commitAndLayout(
      ui.column({}, [
        ui.themed({ colors: { accent: { primary: (10 << 16) | (20 << 8) | 30 } } }, [
          ui.text("inside"),
        ]),
        ui.text("outside"),
      ]),
    );

    const themedNode = tree.children[0];
    assert.ok(themedNode && themedNode.vnode.kind === "themed", "expected themed node");
    if (!themedNode || themedNode.vnode.kind !== "themed") return;
    const themedChild = themedNode.children[0];
    assert.ok(themedChild, "expected themed child");
    if (!themedChild) return;

    assert.deepEqual(themedNode.rect, themedChild.rect);
  });
});
