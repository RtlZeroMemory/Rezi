import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuilder } from "../../drawlist/types.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { type RuntimeInstance, commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { darkTheme } from "../../theme/presets.js";
import { compileTheme } from "../../theme/theme.js";
import type { TextStyle } from "../../widgets/style.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = compileTheme(darkTheme);

function firstDrawText(
  ops: readonly DrawOp[],
  match: (text: string) => boolean,
): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && match(op.text));
}

class CursorRecordingBuilder implements DrawlistBuilder {
  readonly ops: DrawOp[] = [];
  cursor: Parameters<DrawlistBuilder["setCursor"]>[0] | null = null;

  clear(): void {}
  clearTo(): void {}
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
  addBlob(): number | null {
    return null;
  }
  addTextRunBlob(): number | null {
    return null;
  }
  drawTextRun(): void {}
  setCursor(state: Parameters<DrawlistBuilder["setCursor"]>[0]): void {
    this.cursor = state;
  }
  hideCursor(): void {}
  setLink(): void {}
  drawCanvas(): void {}
  drawImage(): void {}
  blitRect(): void {}
  build() {
    return { ok: true, bytes: new Uint8Array(0) } as const;
  }
  buildInto(_dst: Uint8Array): ReturnType<DrawlistBuilder["buildInto"]> {
    return this.build();
  }
  reset(): void {
    this.ops.length = 0;
    this.cursor = null;
  }
}

function findInstanceIdById(node: RuntimeInstance, id: string): number | null {
  const props = node.vnode.props as { id?: unknown } | undefined;
  if (props?.id === id) return node.instanceId;
  for (const child of node.children) {
    if (!child) continue;
    const found = findInstanceIdById(child, id);
    if (found !== null) return found;
  }
  return null;
}

function renderTextareaWithCursor(
  value: string,
  cursor: number,
): Readonly<{
  ops: readonly DrawOp[];
  cursor: Parameters<DrawlistBuilder["setCursor"]>[0] | null;
}> {
  const vnode = ui.row({ height: 5, items: "stretch" }, [
    ui.textarea({ id: "ta", value, rows: 3, wordWrap: false }),
  ]);
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true);
  if (!committed.ok) {
    return Object.freeze({ ops: Object.freeze([]), cursor: null });
  }

  const textareaInstanceId = findInstanceIdById(committed.value.root, "ta");
  assert.ok(textareaInstanceId !== null, "textarea instance should exist");
  if (textareaInstanceId === null) {
    return Object.freeze({ ops: Object.freeze([]), cursor: null });
  }

  const laidOut = layout(committed.value.root.vnode, 0, 0, 16, 6, "column");
  assert.equal(laidOut.ok, true);
  if (!laidOut.ok) {
    return Object.freeze({ ops: Object.freeze([]), cursor: null });
  }

  const builder = new CursorRecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: laidOut.value,
    viewport: { cols: 16, rows: 6 },
    focusState: Object.freeze({ focusedId: "ta" }),
    cursorInfo: Object.freeze({
      cursorByInstanceId: new Map([[textareaInstanceId, cursor]]),
      shape: 0,
      blink: true,
    }),
    builder,
  });

  return Object.freeze({
    ops: Object.freeze(builder.ops.slice()),
    cursor: builder.cursor,
  });
}

describe("input recipe rendering", () => {
  test("uses recipe colors with semantic-token themes", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.input({ id: "name", value: "", placeholder: "Name" }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const fill = ops.find((op) => op.kind === "fillRect");
    assert.ok(fill !== undefined, "input should fill recipe background");
    if (!fill || fill.kind !== "fillRect") return;
    assert.deepEqual(fill.style?.bg, dsTheme.colors["bg.elevated"]);

    const border = firstDrawText(ops, (text) => text.includes("┌"));
    assert.ok(border !== undefined, "input should render recipe border");
    if (!border || border.kind !== "drawText") return;
    assert.deepEqual(border.style?.fg, dsTheme.colors["border.default"]);
  });

  test("default theme uses recipe background and border by default", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.input({ id: "legacy", value: "", placeholder: "Name" }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: defaultTheme },
    );
    assert.equal(
      ops.some((op) => op.kind === "fillRect"),
      true,
    );
    assert.equal(
      ops.some((op) => op.kind === "drawText" && /[┌┐└┘]/.test(op.text)),
      true,
    );
  });

  test("textarea renders placeholder when value is empty", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.textarea({ id: "ta", value: "", placeholder: "Enter text..." }),
      ]),
      { viewport: { cols: 40, rows: 6 }, theme: defaultTheme },
    );
    const text = firstDrawText(ops, (s) => s.includes("Enter text..."));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.equal(text.text.includes("Enter text..."), true);
  });

  test("focused textarea keeps the tail of a long no-wrap line visible", () => {
    const ops = renderOps(
      ui.row({ height: 5, items: "stretch" }, [
        ui.textarea({
          id: "ta",
          value: "abcdefghijklmnopqrstuvwxyz",
          rows: 3,
          wordWrap: false,
        }),
      ]),
      { viewport: { cols: 16, rows: 6 }, theme: defaultTheme, focusedId: "ta" },
    );

    assert.equal(
      ops.some((op) => op.kind === "drawText" && op.text.includes("uvwxyz")),
      true,
    );
    assert.equal(
      ops.some((op) => op.kind === "drawText" && op.text.includes("abcdef")),
      false,
    );
  });

  test("no-wrap textarea viewport follows cursor movement on long lines", () => {
    const start = renderTextareaWithCursor("abcdefghijklmnopqrstuvwxyz", 4);
    const end = renderTextareaWithCursor("abcdefghijklmnopqrstuvwxyz", 26);

    assert.ok(start.cursor, "early cursor should resolve");
    assert.ok(end.cursor, "late cursor should resolve");
    if (!start.cursor || !end.cursor) return;

    const startText = start.ops
      .filter((op): op is Extract<DrawOp, { kind: "drawText" }> => op.kind === "drawText")
      .map((op) => op.text)
      .join("\n");
    const endText = end.ops
      .filter((op): op is Extract<DrawOp, { kind: "drawText" }> => op.kind === "drawText")
      .map((op) => op.text)
      .join("\n");

    assert.equal(startText.includes("abcdef"), true);
    assert.equal(endText.includes("uvwxyz"), true);
    assert.ok(end.cursor.x > start.cursor.x, "cursor should remain visible after viewport shift");
  });

  test("increases left padding when dsSize is lg", () => {
    const mdOps = renderOps(
      ui.column({ width: 20, items: "stretch" }, [
        ui.input({ id: "i-md", value: "", placeholder: "Name" }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const lgOps = renderOps(
      ui.column({ width: 20, items: "stretch" }, [
        ui.input({ id: "i-lg", value: "", placeholder: "Name", dsSize: "lg" }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const mdText = firstDrawText(mdOps, (text) => text.includes("Name"));
    const lgText = firstDrawText(lgOps, (text) => text.includes("Name"));
    assert.ok(mdText && mdText.kind === "drawText");
    assert.ok(lgText && lgText.kind === "drawText");
    if (!mdText || mdText.kind !== "drawText" || !lgText || lgText.kind !== "drawText") return;
    assert.ok(lgText.x > mdText.x, "lg input should indent text more than md");
  });

  test("uses disabled recipe colors", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.input({ id: "disabled", value: "hello", disabled: true }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const fill = ops.find((op) => op.kind === "fillRect");
    assert.ok(fill !== undefined);
    if (!fill || fill.kind !== "fillRect") return;
    assert.deepEqual(fill.style?.bg, dsTheme.colors["disabled.bg"]);

    const text = firstDrawText(ops, (s) => s.includes("hello"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.deepEqual(text.style?.fg, dsTheme.colors["disabled.fg"]);
  });

  test("uses focused recipe border color", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.input({ id: "focus-input", value: "hello" })]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme, focusedId: "focus-input" },
    );
    const focusBorder = firstDrawText(ops, (text) => text.includes("┏"));
    assert.ok(
      focusBorder && focusBorder.kind === "drawText",
      "focused input should use heavy border",
    );
    if (!focusBorder || focusBorder.kind !== "drawText") return;
    assert.deepEqual(focusBorder.style?.fg, dsTheme.colors["accent.primary"]);
    assert.equal(focusBorder.style?.bold, true);
  });
});
