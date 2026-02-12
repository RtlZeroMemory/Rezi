import { assert, describe, test } from "@rezi-ui/testkit";
import { PassThrough } from "node:stream";
import { normalizeRenderOptions } from "../render/options.js";

describe("render/options", () => {
  test("normalizes a WriteStream shorthand into options", () => {
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;

    const out = normalizeRenderOptions(stdout);
    assert.equal(out.stdout, stdout);
    assert.equal(out.stdin, process.stdin);
  });

  test("passes object options through unchanged", () => {
    const out = normalizeRenderOptions({ debug: true, exitOnCtrlC: false });
    assert.equal(out.debug, true);
    assert.equal(out.exitOnCtrlC, false);
  });

  test("does not treat non-Stream objects as stdout shorthand", () => {
    const out = normalizeRenderOptions({ stdout: { write() {} } } as any);
    assert.equal(typeof out, "object");
  });
});
