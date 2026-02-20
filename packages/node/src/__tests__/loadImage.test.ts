import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadImage } from "../image.js";

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "rezi-load-image-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadImage reads file bytes as Uint8Array", () => {
  withTempDir((dir) => {
    const file = join(dir, "pixel.bin");
    const expected = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    writeFileSync(file, expected);

    const loaded = loadImage(file);
    assert.equal(loaded instanceof Uint8Array, true);
    assert.deepEqual(Array.from(loaded), Array.from(expected));
  });
});

test("loadImage caches by resolved path", () => {
  withTempDir((dir) => {
    const file = join(dir, "cached.bin");
    const firstBytes = Uint8Array.from([1, 2, 3, 4]);
    const secondBytes = Uint8Array.from([9, 8, 7, 6]);
    writeFileSync(file, firstBytes);

    const first = loadImage(file);
    writeFileSync(file, secondBytes);
    const second = loadImage(join(dir, ".", "cached.bin"));

    assert.equal(second, first);
    assert.deepEqual(Array.from(second), Array.from(firstBytes));
  });
});

test("loadImage rejects empty paths", () => {
  assert.throws(() => loadImage(""), /non-empty string/);
});
