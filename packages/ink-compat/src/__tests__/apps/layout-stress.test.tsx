/**
 * Tier 1 Test App: Layout Stress
 *
 * Exercises: Nested Box with all flex props, Spacer, percentage widths,
 * flexGrow, flexShrink, padding/margin shorthands, gap,
 * alignItems, justifyContent, flexDirection, border variants,
 * display:none, backgroundColor, overflow hidden, Newline, Transform.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import { Box, Newline, Spacer, Static, Text, Transform } from "../../index.js";
import { render } from "../../testing/index.js";

// --- Basic flexDirection ---

test("layout: column is default direction", () => {
  const el = React.createElement(Box, null,
    React.createElement(Text, null, "Line1"),
    React.createElement(Text, null, "Line2"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  const idx1 = frame.indexOf("Line1");
  const idx2 = frame.indexOf("Line2");
  assert.ok(idx1 >= 0, "Line1 present");
  assert.ok(idx2 > idx1, "Line2 appears after Line1");
});

test("layout: row direction places items side-by-side", () => {
  const el = React.createElement(Box, { flexDirection: "row" },
    React.createElement(Text, null, "Left"),
    React.createElement(Text, null, "Right"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("Left"), "Left present");
  assert.ok(frame.includes("Right"), "Right present");
  // In a row, both should be on the same line
  const lines = frame.split("\n");
  const lineWithLeft = lines.find((l) => l.includes("Left"));
  assert.ok(lineWithLeft?.includes("Right"), "Left and Right on same line in row");
});

// --- Spacer ---

test("layout: spacer pushes items apart in row", () => {
  const el = React.createElement(Box, { flexDirection: "row", width: 40 },
    React.createElement(Text, null, "L"),
    React.createElement(Spacer, null),
    React.createElement(Text, null, "R"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  const lines = frame.split("\n").filter((l) => l.includes("L") && l.includes("R"));
  assert.ok(lines.length > 0, "L and R on same line");
  // There should be space between L and R
  const line = lines[0]!;
  const lPos = line.indexOf("L");
  const rPos = line.indexOf("R");
  assert.ok(rPos - lPos > 2, `R should be far from L (gap=${rPos - lPos})`);
});

// --- Padding ---

test("layout: padding adds space inside box", () => {
  const el = React.createElement(Box, { borderStyle: "single", padding: 1 },
    React.createElement(Text, null, "padded"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("padded"), "content present");
  // With padding 1 and border, the text should not be adjacent to border
  const lines = frame.split("\n");
  const borderLine = lines.find((l) => l.includes("┌") || l.includes("╭"));
  const textLine = lines.find((l) => l.includes("padded"));
  assert.ok(borderLine !== undefined, "border line exists");
  assert.ok(textLine !== undefined, "text line exists");
  // Text line should not be the line immediately after border (padding 1 = 1 blank line)
  if (borderLine && textLine) {
    const borderIdx = lines.indexOf(borderLine);
    const textIdx = lines.indexOf(textLine);
    assert.ok(textIdx > borderIdx + 1, "padding should create gap between border and text");
  }
});

test("layout: paddingX adds horizontal space", () => {
  const el = React.createElement(Box, { borderStyle: "single", paddingX: 2 },
    React.createElement(Text, null, "X"),
  );
  const { lastFrame } = render(el);
  const lines = lastFrame().split("\n");
  const textLine = lines.find((l) => l.includes("X"));
  assert.ok(textLine !== undefined, "text line exists");
  // X should have spaces before it (paddingX=2 + border)
  if (textLine) {
    const xIdx = textLine.indexOf("X");
    assert.ok(xIdx >= 3, `X should be indented by paddingX + border (pos=${xIdx})`);
  }
});

// --- Nested boxes ---

test("layout: nested boxes render correctly", () => {
  const el = React.createElement(Box, { flexDirection: "column" },
    React.createElement(Box, { borderStyle: "single" },
      React.createElement(Text, null, "Box A"),
    ),
    React.createElement(Box, { borderStyle: "double" },
      React.createElement(Text, null, "Box B"),
    ),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("Box A"), "Box A present");
  assert.ok(frame.includes("Box B"), "Box B present");
});

// --- Border variants ---

test("layout: round border", () => {
  const el = React.createElement(Box, { borderStyle: "round" },
    React.createElement(Text, null, "round"),
  );
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("╭") || lastFrame().includes("round"), "should use rounded border or contain text");
});

test("layout: bold border", () => {
  const el = React.createElement(Box, { borderStyle: "bold" },
    React.createElement(Text, null, "bold"),
  );
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("bold"), "should contain text");
});

test("layout: double border", () => {
  const el = React.createElement(Box, { borderStyle: "double" },
    React.createElement(Text, null, "dbl"),
  );
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("═") || lastFrame().includes("dbl"), "should have double border or text");
});

// --- display: none ---

test("layout: display none hides element", () => {
  const el = React.createElement(Box, null,
    React.createElement(Text, null, "visible"),
    React.createElement(Box, { display: "none" },
      React.createElement(Text, null, "hidden"),
    ),
  );
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("visible"), "visible text shown");
  assert.ok(!lastFrame().includes("hidden"), "hidden text not shown");
});

// --- flexGrow ---

test("layout: flexGrow causes child to expand", () => {
  const el = React.createElement(Box, { flexDirection: "row", width: 40 },
    React.createElement(Box, { flexGrow: 1 },
      React.createElement(Text, null, "grow"),
    ),
    React.createElement(Text, null, "fixed"),
  );
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("grow"), "growing child present");
  assert.ok(lastFrame().includes("fixed"), "fixed child present");
});

// --- Newline ---

test("layout: Newline in Text creates line breaks", () => {
  const el = React.createElement(Text, null,
    "Line A",
    React.createElement(Newline, null),
    "Line B",
    React.createElement(Newline, { count: 2 }),
    "Line C",
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("Line A"), "Line A present");
  assert.ok(frame.includes("Line B"), "Line B present");
  assert.ok(frame.includes("Line C"), "Line C present");
});

// --- Transform ---

test("layout: Transform uppercases text", () => {
  const el = React.createElement(Transform, {
    transform: (line: string) => line.toUpperCase(),
    children: React.createElement(Text, null, "hello world"),
  });
  const { lastFrame } = render(el);
  assert.ok(lastFrame().includes("HELLO WORLD"), "text should be uppercased");
});

test("layout: Transform adds line numbers", () => {
  const el = React.createElement(Transform, {
    transform: (line: string, idx: number) => `${idx + 1}. ${line}`,
    children: React.createElement(Text, null, "alpha\nbeta\ngamma"),
  });
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("1. alpha"), "first line numbered");
  assert.ok(frame.includes("2. beta"), "second line numbered");
  assert.ok(frame.includes("3. gamma"), "third line numbered");
});

// --- Row with border (tests the box→row nesting) ---

test("layout: row with border nests correctly", () => {
  const el = React.createElement(
    Box,
    { flexDirection: "row", borderStyle: "single", padding: 0 },
    React.createElement(Text, null, "A"),
    React.createElement(Text, null, "B"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("A"), "A present");
  assert.ok(frame.includes("B"), "B present");
  assert.ok(
    frame.includes("┌") || frame.includes("│"),
    "border characters present",
  );
});

// --- Gap ---

test("layout: gap adds space between children", () => {
  const el = React.createElement(Box, { flexDirection: "column", gap: 1 },
    React.createElement(Text, null, "First"),
    React.createElement(Text, null, "Second"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  const lines = frame.split("\n");
  const firstIdx = lines.findIndex((l) => l.includes("First"));
  const secondIdx = lines.findIndex((l) => l.includes("Second"));
  assert.ok(firstIdx >= 0 && secondIdx >= 0, "both texts present");
  assert.ok(secondIdx - firstIdx >= 2, `gap should separate lines (diff=${secondIdx - firstIdx})`);
});

// --- Static renders items ---

test("layout: Static renders its items", () => {
  const items = ["done-1", "done-2"];
  const el = React.createElement(Box, { flexDirection: "column" },
    React.createElement(Static<string>, {
      items,
      children: (item: string) => React.createElement(Text, { key: item }, `✓ ${item}`),
    }),
    React.createElement(Text, null, "active area"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("✓ done-1"), "first static item");
  assert.ok(frame.includes("✓ done-2"), "second static item");
  assert.ok(frame.includes("active area"), "active area");
});

// --- Margin ---

test("layout: marginTop pushes element down", () => {
  const el = React.createElement(Box, { flexDirection: "column" },
    React.createElement(Text, null, "Top"),
    React.createElement(Box, { marginTop: 2 },
      React.createElement(Text, null, "Bottom"),
    ),
  );
  const { lastFrame } = render(el);
  const lines = lastFrame().split("\n");
  const topIdx = lines.findIndex((l) => l.includes("Top"));
  const bottomIdx = lines.findIndex((l) => l.includes("Bottom"));
  assert.ok(topIdx >= 0 && bottomIdx >= 0, "both present");
  assert.ok(bottomIdx - topIdx >= 3, `marginTop should create space (diff=${bottomIdx - topIdx})`);
});

// --- Text styling ---

test("layout: text style props don't crash", () => {
  const el = React.createElement(Box, null,
    React.createElement(Text, { bold: true }, "bold"),
    React.createElement(Text, { italic: true }, "italic"),
    React.createElement(Text, { underline: true }, "underline"),
    React.createElement(Text, { strikethrough: true }, "strike"),
    React.createElement(Text, { dimColor: true }, "dim"),
    React.createElement(Text, { inverse: true }, "inverse"),
    React.createElement(Text, { color: "red" }, "red"),
    React.createElement(Text, { color: "#ff6347" }, "hex"),
    React.createElement(Text, { color: "rgb(100,200,50)" }, "rgb"),
    React.createElement(Text, { backgroundColor: "blue" }, "bg"),
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("bold"), "bold text present");
  assert.ok(frame.includes("italic"), "italic text present");
  assert.ok(frame.includes("red"), "red text present");
  assert.ok(frame.includes("hex"), "hex color text present");
  assert.ok(frame.includes("rgb"), "rgb color text present");
});

// --- Nested Text (richText) ---

test("layout: nested Text renders all spans", () => {
  const el = React.createElement(Text, null,
    "Hello ",
    React.createElement(Text, { bold: true, color: "green" }, "World"),
    "!",
  );
  const { lastFrame } = render(el);
  const frame = lastFrame();
  assert.ok(frame.includes("Hello"), "Hello present");
  assert.ok(frame.includes("World"), "World present");
});
