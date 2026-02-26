import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder, rgb } from "../../index.js";

describe("DrawlistBuilder buildInto", () => {
  test("buildInto(dst) matches build() bytes exactly", () => {
    const builder = createDrawlistBuilder();
    builder.clear();
    builder.fillRect(0, 0, 8, 4, { bg: rgb(0, 17, 34) });
    builder.drawText(2, 1, "build-into", { fg: rgb(170, 187, 204), bold: true });
    builder.setCursor({ x: 3, y: 2, shape: 1, visible: true, blink: false });

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const dst = new Uint8Array(built.bytes.byteLength + 16);
    dst.fill(0x7d);
    const builtInto = builder.buildInto(dst);

    assert.equal(builtInto.ok, true);
    if (!builtInto.ok) return;
    assert.equal(builtInto.bytes.byteLength, built.bytes.byteLength);
    assert.deepEqual(Array.from(builtInto.bytes), Array.from(built.bytes));
  });

  test("buildInto(dst) matches build() for text, text-run, and graphics", () => {
    const builder = createDrawlistBuilder();
    builder.drawText(1, 2, "hello", { underlineStyle: "dashed", underlineColor: rgb(255, 0, 0) });

    const runBlob = builder.addTextRunBlob([
      { text: "run-a", style: { bold: true } },
      { text: "run-b", style: { italic: true } },
    ]);
    assert.equal(runBlob, 0);
    if (runBlob === null) return;
    builder.drawTextRun(4, 5, runBlob);

    const imageBlob = builder.addBlob(new Uint8Array(2 * 2 * 4));
    assert.equal(imageBlob, 1);
    if (imageBlob === null) return;
    builder.drawImage(6, 7, 2, 2, imageBlob, "rgba", "auto", 0, "contain", 99, 2, 2);

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const dst = new Uint8Array(built.bytes.byteLength + 32);
    dst.fill(0x3a);
    const builtInto = builder.buildInto(dst);

    assert.equal(builtInto.ok, true);
    if (!builtInto.ok) return;
    assert.equal(builtInto.bytes.byteLength, built.bytes.byteLength);
    assert.deepEqual(Array.from(builtInto.bytes), Array.from(built.bytes));
  });

  test("buildInto(dst) fails when dst is one byte too small", () => {
    const builder = createDrawlistBuilder();
    builder.drawText(0, 0, "small-fail");
    builder.setCursor({ x: 0, y: 0, shape: 0, visible: true, blink: true });

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const dst = new Uint8Array(built.bytes.byteLength - 1);
    const builtInto = builder.buildInto(dst);
    assert.equal(builtInto.ok, false);
    if (builtInto.ok) return;
    assert.equal(builtInto.error.code, "ZRDL_TOO_LARGE");
  });
});
