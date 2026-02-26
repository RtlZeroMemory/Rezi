import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

function expectOk(
  result: ReturnType<ReturnType<typeof createDrawlistBuilder>["build"]>,
): Uint8Array {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("drawlist build failed");
  return result.bytes;
}

describe("DrawlistBuilder resource inputs", () => {
  test("accepts blob resources for canvas commands", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addBlob(new Uint8Array([1, 2, 3, 4]));
    assert.equal(blobIndex !== null, true);
    if (blobIndex === null) throw new Error("missing blob index");

    b.clear();
    b.drawCanvas(0, 0, 1, 1, blobIndex, "ascii", 1, 1);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });

  test("accepts text-run blobs", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addTextRunBlob([
      { text: "left", style: { bold: true } },
      { text: "right", style: { italic: true } },
    ]);
    assert.equal(blobIndex !== null, true);
    if (blobIndex === null) throw new Error("missing text-run blob index");

    b.clear();
    b.drawTextRun(0, 0, blobIndex);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });

  test("reset clears transient command state but builder remains reusable", () => {
    const b = createDrawlistBuilder();
    b.clear();
    expectOk(b.build());

    b.reset();
    b.clearTo(10, 2);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });
});
