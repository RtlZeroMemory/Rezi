import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createNodeTailSource } from "../streams/tail.js";

async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs = 2000,
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`next() timed out after ${String(timeoutMs)}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

test("createNodeTailSource yields existing + appended lines when fromEnd=false", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rezi-tail-"));
  const filePath = join(dir, "app.log");
  let source: ReturnType<typeof createNodeTailSource> | undefined;

  try {
    await writeFile(filePath, "boot\n", "utf8");

    source = createNodeTailSource(filePath, { fromEnd: false, pollMs: 10 });
    const iterator = source[Symbol.asyncIterator]();

    const first = await nextWithTimeout(iterator);
    assert.equal(first.done, false);
    assert.equal(first.value, "boot");

    await appendFile(filePath, "line-1\nline-2\n", "utf8");
    const second = await nextWithTimeout(iterator);
    const third = await nextWithTimeout(iterator);

    assert.equal(second.done, false);
    assert.equal(third.done, false);
    assert.equal(second.value, "line-1");
    assert.equal(third.value, "line-2");

    source.close?.();
    const done = await nextWithTimeout(iterator);
    assert.equal(done.done, true);
  } finally {
    source?.close?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test("createNodeTailSource skips initial contents when fromEnd=true", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rezi-tail-"));
  const filePath = join(dir, "events.log");
  let source: ReturnType<typeof createNodeTailSource> | undefined;

  try {
    await writeFile(filePath, "old-1\nold-2\n", "utf8");

    source = createNodeTailSource(filePath, { fromEnd: true, pollMs: 10 });
    const iterator = source[Symbol.asyncIterator]();

    const firstPending = nextWithTimeout(iterator);
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    await appendFile(filePath, "new-1\nnew-2\n", "utf8");
    const first = await firstPending;
    const second = await nextWithTimeout(iterator);

    assert.equal(first.done, false);
    assert.equal(second.done, false);
    assert.equal(first.value, "new-1");
    assert.equal(second.value, "new-2");

    source.close?.();
    const done = await nextWithTimeout(iterator);
    assert.equal(done.done, true);
  } finally {
    source?.close?.();
    await rm(dir, { recursive: true, force: true });
  }
});
