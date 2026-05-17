import {
  assert,
  type Rng,
  chance,
  fuzzTest,
  pick,
  randomAsciiString,
  randomInt,
} from "@rezi-ui/testkit";
import {
  type BoxProps,
  type DividerProps,
  type SpacerProps,
  type SpacingValue,
  type TestRenderResult,
  type TestViewport,
  type TextProps,
  type VNode,
  createTestRenderer,
  ui,
} from "../../index.js";
import type { SizeConstraint } from "../../layout/types.js";
import type { ColumnProps, GridProps, RowProps } from "../../widgets/types.js";

type IdState = { next: number };
type MutableProps = Record<string, unknown>;
type RenderSignature = Readonly<{
  text: string;
  nodes: readonly Readonly<{
    kind: VNode["kind"];
    id: string | null;
    text: string | null;
    rect: Readonly<{ x: number; y: number; w: number; h: number }>;
  }>[];
}>;

const SPACING_VALUES = [
  0,
  1,
  2,
  3,
  4,
  6,
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
] as const satisfies readonly SpacingValue[];

const OVERFLOW_VALUES = ["visible", "hidden", "scroll"] as const;
const BORDER_VALUES = ["none", "single", "rounded", "double"] as const;
const TEXT_OVERFLOW_VALUES = ["clip", "ellipsis", "middle", "start"] as const;

function setProp(props: MutableProps, key: string, value: unknown): void {
  props[key] = value;
}

function getProp(props: Record<string, unknown>, key: string): unknown {
  return props[key];
}

function nextId(ids: IdState, prefix: string): string {
  const id = `${prefix}-${String(ids.next)}`;
  ids.next += 1;
  return id;
}

function randomViewport(rng: Rng): TestViewport {
  return Object.freeze({
    cols: randomInt(rng, 4, 80),
    rows: randomInt(rng, 2, 24),
  });
}

function randomSmallViewport(rng: Rng): TestViewport {
  return Object.freeze({
    cols: randomInt(rng, 1, 24),
    rows: randomInt(rng, 1, 10),
  });
}

function randomSpacing(rng: Rng): SpacingValue {
  return pick(rng, SPACING_VALUES);
}

function randomSizeConstraint(rng: Rng, viewportSize: number): SizeConstraint {
  const max = Math.max(0, viewportSize);
  switch (randomInt(rng, 0, 5)) {
    case 0:
      return 0;
    case 1:
      return "auto";
    case 2:
      return "full";
    case 3:
      return randomInt(rng, 1, Math.max(1, max));
    case 4:
      return randomInt(rng, max + 1, max + 16);
    default:
      return randomInt(rng, 0, 6);
  }
}

function randomEdgeSizeConstraint(rng: Rng, viewportSize: number): SizeConstraint {
  const max = Math.max(0, viewportSize);
  switch (randomInt(rng, 0, 6)) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return "auto";
    case 3:
      return "full";
    case 4:
      return max;
    case 5:
      return max + randomInt(rng, 1, 32);
    default:
      return randomInt(rng, 0, 3);
  }
}

function maybeAddMinMax(
  props: MutableProps,
  rng: Rng,
  minName: "minWidth" | "minHeight",
  maxName: "maxWidth" | "maxHeight",
  viewportSize: number,
): void {
  if (!chance(rng, 20)) return;
  const min = randomInt(rng, 0, Math.max(0, Math.min(viewportSize + 4, 20)));
  const max = randomInt(rng, min, min + randomInt(rng, 0, 12));
  props[minName] = min;
  props[maxName] = max;
}

function addLayoutProps(
  props: MutableProps,
  rng: Rng,
  viewport: TestViewport,
  opts: Readonly<{ edge?: boolean }> = {},
): void {
  const size = opts.edge === true ? randomEdgeSizeConstraint : randomSizeConstraint;

  if (chance(rng, 45)) setProp(props, "width", size(rng, viewport.cols));
  if (chance(rng, 35)) setProp(props, "height", size(rng, viewport.rows));
  maybeAddMinMax(props, rng, "minWidth", "maxWidth", viewport.cols);
  maybeAddMinMax(props, rng, "minHeight", "maxHeight", viewport.rows);

  if (chance(rng, 25)) setProp(props, "flex", randomInt(rng, 0, 3));
  if (chance(rng, 20)) setProp(props, "flexShrink", randomInt(rng, 0, 3));
  if (chance(rng, 18)) setProp(props, "flexBasis", size(rng, viewport.cols));
  if (chance(rng, 10)) {
    setProp(props, "aspectRatio", pick(rng, [0.5, 1, 1.5, 2, 3] as const));
  }
  if (chance(rng, 18)) {
    setProp(props, "alignSelf", pick(rng, ["auto", "start", "stretch"] as const));
  }
  if (chance(rng, 8)) setProp(props, "display", chance(rng, 85));

  if (chance(rng, 12)) setProp(props, "gridColumn", randomInt(rng, 1, 3));
  if (chance(rng, 12)) setProp(props, "gridRow", randomInt(rng, 1, 3));
  if (chance(rng, 10)) setProp(props, "colSpan", randomInt(rng, 1, 2));
  if (chance(rng, 10)) setProp(props, "rowSpan", randomInt(rng, 1, 2));
}

function addSurfaceProps(props: MutableProps, rng: Rng, edge = false): void {
  if (chance(rng, edge ? 75 : 45)) setProp(props, "p", randomSpacing(rng));
  if (chance(rng, edge ? 45 : 20)) setProp(props, "px", randomSpacing(rng));
  if (chance(rng, edge ? 45 : 20)) setProp(props, "py", randomSpacing(rng));
  if (chance(rng, edge ? 30 : 12)) setProp(props, "m", randomInt(rng, 0, edge ? 6 : 3));
  if (chance(rng, 50)) setProp(props, "gap", randomSpacing(rng));
  if (chance(rng, 35)) setProp(props, "overflow", pick(rng, OVERFLOW_VALUES));
  if (chance(rng, edge ? 45 : 15)) {
    setProp(props, "scrollX", randomInt(rng, 0, edge ? 128 : 12));
  }
  if (chance(rng, edge ? 45 : 15)) {
    setProp(props, "scrollY", randomInt(rng, 0, edge ? 128 : 12));
  }
}

function randomText(rng: Rng, maxLength = 80): string {
  return randomAsciiString(rng, {
    minLength: 0,
    maxLength,
    alphabet: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_:/[]{}",
  });
}

function randomTextNode(rng: Rng, ids: IdState, viewport: TestViewport, edge = false): VNode {
  const props: MutableProps = {};
  if (chance(rng, 30)) setProp(props, "id", nextId(ids, "text"));
  if (chance(rng, 70)) setProp(props, "textOverflow", pick(rng, TEXT_OVERFLOW_VALUES));
  if (chance(rng, 55)) {
    setProp(props, "maxWidth", randomInt(rng, 0, viewport.cols + (edge ? 80 : 20)));
  }
  if (chance(rng, 35)) setProp(props, "wrap", chance(rng, 50));
  const content = randomText(rng, edge ? 180 : 90);
  return Object.keys(props).length === 0 ? ui.text(content) : ui.text(content, props as TextProps);
}

function randomLeaf(rng: Rng, ids: IdState, viewport: TestViewport, edge = false): VNode {
  switch (randomInt(rng, 0, 4)) {
    case 0:
      return randomTextNode(rng, ids, viewport, edge);
    case 1:
      return ui.button({
        id: nextId(ids, "button"),
        label: randomText(rng, edge ? 48 : 24),
        disabled: chance(rng, 20),
        px: randomInt(rng, 0, edge ? 8 : 3),
        intent: pick(rng, [
          "primary",
          "secondary",
          "danger",
          "success",
          "warning",
          "link",
        ] as const),
      });
    case 2: {
      const props: MutableProps = { size: randomInt(rng, 0, viewport.cols + (edge ? 64 : 12)) };
      if (chance(rng, 35)) setProp(props, "flex", randomInt(rng, 0, 3));
      return ui.spacer(props as SpacerProps);
    }
    case 3: {
      const props: MutableProps = {
        direction: pick(rng, ["horizontal", "vertical"] as const),
        char: pick(rng, ["-", "=", ".", "|"] as const),
      };
      if (chance(rng, 30)) setProp(props, "label", randomText(rng, 16));
      return ui.divider(props as DividerProps);
    }
    default:
      return ui.box({ id: nextId(ids, "empty-box"), border: "none", width: 0, height: 0 }, []);
  }
}

function randomChildren(
  rng: Rng,
  ids: IdState,
  viewport: TestViewport,
  depth: number,
  edge = false,
): readonly VNode[] {
  const count = randomInt(rng, edge ? 1 : 0, edge ? 5 : 4);
  const children: VNode[] = [];
  for (let i = 0; i < count; i++) {
    children.push(randomNode(rng, ids, viewport, depth, edge));
  }
  return Object.freeze(children);
}

function randomBox(rng: Rng, ids: IdState, viewport: TestViewport, depth: number, edge: boolean) {
  const props: MutableProps = {
    id: nextId(ids, "box"),
    border: pick(rng, BORDER_VALUES),
  };
  if (chance(rng, 25)) setProp(props, "title", randomText(rng, 20));
  addSurfaceProps(props, rng, edge);
  addLayoutProps(props, rng, viewport, { edge });
  return ui.box(props as BoxProps, randomChildren(rng, ids, viewport, depth - 1, edge));
}

function randomStack(
  kind: "row" | "column",
  rng: Rng,
  ids: IdState,
  viewport: TestViewport,
  depth: number,
  edge: boolean,
): VNode {
  const props: MutableProps = { id: nextId(ids, kind) };
  addSurfaceProps(props, rng, edge);
  addLayoutProps(props, rng, viewport, { edge });
  if (chance(rng, 20)) setProp(props, "reverse", chance(rng, 50));
  if (chance(rng, 35)) setProp(props, "wrap", chance(rng, 60));
  if (chance(rng, 40)) setProp(props, "align", pick(rng, ["start", "stretch"] as const));
  if (chance(rng, 25)) setProp(props, "justify", "start");
  if (chance(rng, 30)) setProp(props, "items", pick(rng, ["start", "stretch"] as const));

  const children = randomChildren(rng, ids, viewport, depth - 1, edge);
  return kind === "row"
    ? ui.row(props as RowProps, children)
    : ui.column(props as ColumnProps, children);
}

function randomGrid(
  rng: Rng,
  ids: IdState,
  viewport: TestViewport,
  depth: number,
  edge: boolean,
): VNode {
  const props: MutableProps = {
    id: nextId(ids, "grid"),
    columns: randomInt(rng, 1, edge ? 5 : 4),
  };
  if (chance(rng, 55)) setProp(props, "rows", randomInt(rng, 1, edge ? 4 : 3));
  if (chance(rng, 55)) setProp(props, "gap", randomInt(rng, 0, edge ? 5 : 3));
  if (chance(rng, 25)) setProp(props, "columnGap", randomInt(rng, 0, edge ? 5 : 3));
  if (chance(rng, 25)) setProp(props, "rowGap", randomInt(rng, 0, edge ? 5 : 3));
  addLayoutProps(props, rng, viewport, { edge });
  return ui.grid(props as GridProps, ...randomChildren(rng, ids, viewport, depth - 1, edge));
}

function randomNode(
  rng: Rng,
  ids: IdState,
  viewport: TestViewport,
  depth: number,
  edge = false,
): VNode {
  if (depth <= 0) return randomLeaf(rng, ids, viewport, edge);

  switch (randomInt(rng, 0, edge ? 5 : 4)) {
    case 0:
      return randomLeaf(rng, ids, viewport, edge);
    case 1:
      return randomBox(rng, ids, viewport, depth, edge);
    case 2:
      return randomStack("row", rng, ids, viewport, depth, edge);
    case 3:
      return randomStack("column", rng, ids, viewport, depth, edge);
    default:
      return randomGrid(rng, ids, viewport, depth, edge);
  }
}

function randomPublicUiTree(rng: Rng, viewport: TestViewport): VNode {
  const ids: IdState = { next: 0 };
  return ui.column(
    {
      id: nextId(ids, "root"),
      width: "full",
      height: "full",
      overflow: "hidden",
      p: randomInt(rng, 0, 2),
      gap: randomSpacing(rng),
    },
    randomChildren(rng, ids, viewport, 3),
  );
}

function randomEdgeUiTree(rng: Rng, viewport: TestViewport): VNode {
  const ids: IdState = { next: 0 };
  return ui.box(
    {
      id: nextId(ids, "edge-root"),
      width: "full",
      height: "full",
      border: pick(rng, BORDER_VALUES),
      overflow: pick(rng, ["hidden", "scroll"] as const),
      p: pick(rng, [0, 1, 4, 6, "2xl"] as const satisfies readonly SpacingValue[]),
      gap: randomSpacing(rng),
      scrollX: randomInt(rng, 0, 256),
      scrollY: randomInt(rng, 0, 256),
    },
    randomChildren(rng, ids, viewport, 4, true),
  );
}

function assertTextWithinViewport(result: TestRenderResult): void {
  const text = result.toText();
  if (text.length === 0) return;
  const lines = text.split("\n");
  assert.equal(
    lines.length <= result.viewport.rows,
    true,
    `rendered ${String(lines.length)} lines into ${String(result.viewport.rows)} rows`,
  );
  for (const line of lines) {
    assert.equal(
      line.length <= result.viewport.cols,
      true,
      `rendered line width ${String(line.length)} into ${String(result.viewport.cols)} cols`,
    );
  }
}

function assertRectContract(result: TestRenderResult): void {
  for (const node of result.nodes) {
    const rect = node.rect;
    const detail = `${node.kind}${node.id === null ? "" : `#${node.id}`} rect=${JSON.stringify(
      rect,
    )}`;
    for (const [name, value] of Object.entries(rect)) {
      assert.equal(Number.isFinite(value), true, `${detail} ${name} must be finite`);
      assert.equal(Number.isInteger(value), true, `${detail} ${name} must be an integer`);
    }
    assert.equal(rect.w >= 0, true, `${detail} exposed rect.w must be non-negative`);
    assert.equal(rect.h >= 0, true, `${detail} exposed rect.h must be non-negative`);
  }
}

function renderSignature(result: TestRenderResult): RenderSignature {
  return Object.freeze({
    text: result.toText(),
    nodes: Object.freeze(
      result.nodes.map((node) =>
        Object.freeze({
          kind: node.kind,
          id: node.id,
          text: node.text ?? null,
          rect: node.rect,
        }),
      ),
    ),
  });
}

function summarizeTree(vnode: VNode, maxLength = 1200): string {
  const seen: string[] = [];
  const walk = (node: VNode, depth: number): unknown => {
    const props = (node as Readonly<{ props?: Record<string, unknown> }>).props ?? {};
    const rawId = getProp(props, "id");
    const id = typeof rawId === "string" ? rawId : undefined;
    const summary: Record<string, unknown> = {
      kind: node.kind,
      ...(id === undefined ? {} : { id }),
    };
    for (const key of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flex",
      "flexShrink",
      "flexBasis",
      "aspectRatio",
      "align",
      "alignSelf",
      "justify",
      "items",
      "wrap",
      "p",
      "px",
      "py",
      "m",
      "gap",
      "overflow",
      "gridColumn",
      "gridRow",
      "colSpan",
      "rowSpan",
      "columns",
      "rows",
    ] as const) {
      if (props[key] !== undefined) summary[key] = props[key];
    }
    if (node.kind === "text") {
      setProp(summary, "textLen", (node as Readonly<{ text?: string }>).text?.length ?? 0);
    }
    const children = (node as Readonly<{ children?: readonly VNode[] }>).children ?? [];
    if (children.length > 0 && depth < 4) {
      setProp(
        summary,
        "children",
        children.map((child) => walk(child, depth + 1)),
      );
    } else if (children.length > 0) {
      setProp(summary, "children", `${String(children.length)} more`);
    }
    return summary;
  };
  seen.push(JSON.stringify(walk(vnode, 0)));
  const text = seen.join("");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function assertRenderContract(result: TestRenderResult): void {
  assertTextWithinViewport(result);
  assertRectContract(result);
}

fuzzTest(
  "layout/rendering fuzz: public ui trees render bounded deterministic frames",
  {
    seed: 0x1a70_f001,
    iterations: 512,
  },
  (ctx) => {
    const viewport = randomViewport(ctx.rng);
    const tree = randomPublicUiTree(ctx.rng, viewport);
    ctx.note(`viewport=${String(viewport.cols)}x${String(viewport.rows)}`);
    ctx.note(`tree=${summarizeTree(tree)}`);

    const renderer = createTestRenderer({ viewport });
    const first = renderer.render(tree);
    const second = renderer.render(tree);
    const fresh = createTestRenderer({ viewport }).render(tree);

    assertRenderContract(first);
    assertRenderContract(second);
    assertRenderContract(fresh);
    assert.deepEqual(renderSignature(second), renderSignature(first));
    assert.deepEqual(renderSignature(fresh), renderSignature(first));
  },
);

fuzzTest(
  "layout/rendering fuzz: edge spacing and size props stay bounded",
  {
    seed: 0x1a70_f002,
    iterations: 256,
  },
  (ctx) => {
    const viewport = randomSmallViewport(ctx.rng);
    const tree = randomEdgeUiTree(ctx.rng, viewport);
    ctx.note(`viewport=${String(viewport.cols)}x${String(viewport.rows)}`);
    ctx.note(`tree=${summarizeTree(tree)}`);

    const renderer = createTestRenderer({ viewport });
    const first = renderer.render(tree);
    const second = renderer.render(tree);

    assertRenderContract(first);
    assertRenderContract(second);
    assert.deepEqual(renderSignature(second), renderSignature(first));
  },
);
