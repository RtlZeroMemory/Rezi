import { assert, describe, test } from "@rezi-ui/testkit";
import { mapBoxProps, mapTextProps } from "../props.js";

describe("props: mapBoxProps()", () => {
  test("flexDirection => stackKind + reverseChildren", () => {
    const a = mapBoxProps({ flexDirection: "column" });
    assert.equal(a.stackKind, "column");
    assert.equal(a.reverseChildren, false);

    const b = mapBoxProps({ flexDirection: "row-reverse" });
    assert.equal(b.stackKind, "row");
    assert.equal(b.reverseChildren, true);
  });

  test("padding + gap mapping", () => {
    const out = mapBoxProps({ padding: 2, paddingX: 3, gap: 1 });
    assert.equal(out.wrapper, null);
    assert.equal(out.stackProps.p, 2);
    assert.equal(out.stackProps.px, 3);
    assert.equal(out.stackProps.gap, 1);
  });

  test("columnGap/rowGap respect main axis by flexDirection", () => {
    const row = mapBoxProps({ flexDirection: "row", columnGap: 2, rowGap: 5 });
    assert.equal(row.stackProps.gap, 2);

    const column = mapBoxProps({ flexDirection: "column", columnGap: 2, rowGap: 5 });
    assert.equal(column.stackProps.gap, 5);

    const fallback = mapBoxProps({ flexDirection: "column", columnGap: 3 });
    assert.equal(fallback.stackProps.gap, 3);
  });

  test("borderStyle creates wrapper and moves constraints/margin to wrapper", () => {
    const out = mapBoxProps({
      borderStyle: "round",
      borderColor: "redBright",
      borderDimColor: true,
      margin: 1,
      marginTop: 2,
      marginLeft: 3,
      width: 10,
    });

    assert.ok(out.wrapper !== null);
    assert.equal(out.wrapper?.border, "rounded");
    assert.deepEqual(out.wrapper?.style?.fg, { r: 255, g: 0, b: 0 });
    assert.equal(out.wrapper?.style?.dim, true);

    // Outer sizing/margin props must land on the wrapper so borders don't change geometry.
    assert.equal(out.wrapper?.m, 1);
    assert.equal(out.wrapper?.mt, 2);
    assert.equal(out.wrapper?.ml, 3);
    assert.equal(out.wrapper?.width, 10);
    assert.equal(out.stackProps.m, undefined);
    assert.equal(out.stackProps.mt, undefined);
    assert.equal(out.stackProps.ml, undefined);
    assert.equal(out.stackProps.width, undefined);
  });

  test("borderTop/borderRight/borderBottom/borderLeft map to wrapper side toggles", () => {
    const out = mapBoxProps({ borderStyle: "single", borderTop: false, borderRight: false });
    assert.ok(out.wrapper !== null);
    assert.equal(out.wrapper?.borderTop, false);
    assert.equal(out.wrapper?.borderRight, false);
    assert.equal(out.wrapper?.borderBottom, undefined);
    assert.equal(out.wrapper?.borderLeft, undefined);
  });

  test("no borderStyle keeps constraints on stack", () => {
    const out = mapBoxProps({ width: "50%", height: 3, flexGrow: 2, marginX: 1 });
    assert.equal(out.wrapper, null);
    assert.equal(out.stackProps.width, "50%");
    assert.equal(out.stackProps.height, 3);
    assert.equal(out.stackProps.flex, 2);
    assert.equal(out.stackProps.mx, 1);
  });

  test("individual margins map to mt/mr/mb/ml", () => {
    const out = mapBoxProps({ marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 });
    assert.equal(out.wrapper, null);
    assert.equal(out.stackProps.mt, 1);
    assert.equal(out.stackProps.mr, 2);
    assert.equal(out.stackProps.mb, 3);
    assert.equal(out.stackProps.ml, 4);
  });

  test("flexBasis maps to main-axis width/height (best-effort)", () => {
    const row = mapBoxProps({ flexBasis: 10 });
    assert.equal(row.stackProps.width, 10);
    assert.equal(row.stackProps.height, undefined);

    const col = mapBoxProps({ flexDirection: "column", flexBasis: 10 });
    assert.equal(col.stackProps.height, 10);
    assert.equal(col.stackProps.width, undefined);

    const explicit = mapBoxProps({ width: 5, flexBasis: 10 });
    assert.equal(explicit.stackProps.width, 5);
  });

  test("alignItems + justifyContent mapping", () => {
    const out = mapBoxProps({ alignItems: "flex-end", justifyContent: "space-between" });
    assert.equal(out.stackProps.align, "end");
    assert.equal(out.stackProps.justify, "between");
  });

  test("display=none marks hidden", () => {
    const out = mapBoxProps({ display: "none" });
    assert.equal(out.hidden, true);
  });

  test("overflowY=scroll and scrollbarThumbColor map into runtime scroll metadata", () => {
    const out = mapBoxProps({
      overflow: "hidden",
      overflowY: "scroll",
      scrollTop: 7,
      scrollbarThumbColor: "yellow",
    });

    assert.equal(out.overflow, "hidden");
    assert.equal(out.overflowY, "scroll");
    assert.equal(out.scrollTop, 7);
    assert.equal(out.scrollbarThumbColor, "yellow");
  });
});

describe("props: mapTextProps()", () => {
  test("style mapping + truncate mapping", () => {
    const out = mapTextProps({
      color: "rgb(1,2,3)",
      backgroundColor: "#ff00aa",
      dimColor: true,
      bold: true,
      italic: true,
      underline: true,
      inverse: true,
      wrap: "truncate-middle",
    });

    assert.deepEqual(out.style, {
      fg: { r: 1, g: 2, b: 3 },
      bg: { r: 255, g: 0, b: 170 },
      dim: true,
      bold: true,
      italic: true,
      underline: true,
      inverse: true,
    });
    assert.equal(out.textOverflow, "middle");
  });
});
