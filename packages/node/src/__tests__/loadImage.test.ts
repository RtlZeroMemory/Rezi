import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearImageCache, loadImage, setImageCacheMaxEntries } from "../image.js";

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "rezi-load-image-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function resetImageCache(): void {
  clearImageCache();
  setImageCacheMaxEntries(100);
}

test("loadImage reads file bytes as Uint8Array", () => {
  resetImageCache();
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
  resetImageCache();
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
  resetImageCache();
  assert.throws(() => loadImage(""), /non-empty string/);
});

test("loadImage evicts least-recently-used entries and supports explicit clear", () => {
  resetImageCache();
  setImageCacheMaxEntries(3);
  withTempDir((dir) => {
    const files = Array.from({ length: 5 }, (_, i) => join(dir, `cache-${String(i + 1)}.bin`));
    const [f1 = "", f2 = "", f3 = "", f4 = "", f5 = ""] = files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      writeFileSync(file, Uint8Array.from([i + 1]));
    }

    const first = loadImage(f1);
    const second = loadImage(f2);
    const third = loadImage(f3);
    const fourth = loadImage(f4);
    const fifth = loadImage(f5);

    assert.equal(loadImage(f3), third);
    assert.equal(loadImage(f4), fourth);
    assert.equal(loadImage(f5), fifth);
    assert.notEqual(loadImage(f1), first);
    assert.notEqual(loadImage(f2), second);

    clearImageCache();
    assert.notEqual(loadImage(f5), fifth);
  });
  setImageCacheMaxEntries(100);
});
