import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assert, test } from "../nodeTest.js";
import { matchesSnapshot } from "../snapshot.js";

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("matchesSnapshot writes snapshot when update=true", () => {
  const dir = tempDir("rezi-testkit-snapshot-");
  const file = path.join(dir, "example.txt");
  try {
    matchesSnapshot("hello\nworld", "example", { file, update: true });
    const written = readFileSync(file, "utf8");
    assert.equal(written, "hello\nworld\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("matchesSnapshot compares existing snapshots", () => {
  const dir = tempDir("rezi-testkit-snapshot-");
  const file = path.join(dir, "same.txt");
  try {
    writeFileSync(file, "stable output\n", "utf8");
    matchesSnapshot("stable output", "same", { file });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nodeTest assert is patched with matchesSnapshot at runtime", () => {
  const dir = tempDir("rezi-testkit-snapshot-");
  const file = path.join(dir, "assert-patch.txt");
  try {
    writeFileSync(file, "patched\n", "utf8");
    const assertWithSnapshot = assert as typeof assert & {
      matchesSnapshot: (
        actualValue: string,
        snapshotName: string,
        opts?: { file?: string },
      ) => void;
    };
    assertWithSnapshot.matchesSnapshot("patched", "assert-patch", { file });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("matchesSnapshot throws readable mismatch error", () => {
  const dir = tempDir("rezi-testkit-snapshot-");
  const file = path.join(dir, "mismatch.txt");
  try {
    writeFileSync(file, "expected line\n", "utf8");
    assert.throws(
      () => matchesSnapshot("actual line", "mismatch", { file }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message.includes("snapshot mismatch"), true);
        assert.equal(err.message.includes("expected:"), true);
        assert.equal(err.message.includes("actual:"), true);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("matchesSnapshot default path keeps snapshot.test.ts caller frames", () => {
  const snapshotName = "snapshot-caller-resolution";
  const snapshotFile = path.resolve(
    process.cwd(),
    "packages",
    "testkit",
    "src",
    "__tests__",
    "__snapshots__",
    `${snapshotName}.txt`,
  );

  rmSync(snapshotFile, { force: true });
  try {
    matchesSnapshot("caller frame preserved", snapshotName, { update: true });
    assert.equal(readFileSync(snapshotFile, "utf8"), "caller frame preserved\n");
  } finally {
    rmSync(snapshotFile, { force: true });
  }
});
