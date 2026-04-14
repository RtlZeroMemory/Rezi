import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  type PtyHarness,
  type TerminalScreenSnapshot,
  createTerminalScreen,
  startPtyHarness,
} from "../testing/index.js";

const isBunRuntime = "Bun" in globalThis;

async function waitForSnapshot(
  harness: PtyHarness,
  predicate: (snapshot: TerminalScreenSnapshot) => boolean,
  timeoutMs = 2_000,
): Promise<TerminalScreenSnapshot> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = harness.snapshot();
    if (predicate(snapshot)) return snapshot;
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for PTY snapshot: ${JSON.stringify(snapshot.screen.lines)}`,
      );
    }
    await delay(20);
  }
}

test("createTerminalScreen reconstructs visible lines and cursor position", async () => {
  const screen = createTerminalScreen({ cols: 10, rows: 3 });
  await screen.write("hello");
  await screen.write("\r\nworld");

  const snapshot = screen.snapshot();
  assert.deepEqual(snapshot.screen.lines, ["hello     ", "world     ", "          "]);
  assert.deepEqual(snapshot.cursor, { visible: true, x: 5, y: 1 });
});

if (process.platform === "win32") {
  test.skip("startPtyHarness applies viewport changes, relays input, and preserves final screen state", () => {});
} else if (isBunRuntime) {
  test.skip("startPtyHarness applies viewport changes, relays input, and preserves final screen state", () => {});
} else {
  test(
    "startPtyHarness applies viewport changes, relays input, and preserves final screen state",
    { timeout: 20_000 },
    async () => {
      const targetPath = fileURLToPath(new URL("./fixtures/ptyEchoTarget.js", import.meta.url));
      const harness = await startPtyHarness({
        cwd: process.cwd(),
        command: process.execPath,
        args: [targetPath],
        cols: 40,
        rows: 8,
      });

      try {
        await waitForSnapshot(harness, (snapshot) =>
          snapshot.screen.lines.some((line) => line.includes("size:40x8")),
        );
        await waitForSnapshot(harness, (snapshot) =>
          snapshot.screen.lines.some((line) => line.includes("path:present")),
        );

        await harness.resize(52, 10);
        await waitForSnapshot(harness, (snapshot) =>
          snapshot.screen.lines.some((line) => line.includes("size:52x10")),
        );

        await harness.write("ping\r");
        await waitForSnapshot(harness, (snapshot) =>
          snapshot.screen.lines.some((line) => line.includes("input:ping")),
        );

        const beforeExit = harness.snapshot();
        assert.ok(beforeExit.screen.lines.some((line) => line.includes("input:ping")));

        await harness.write("quit\r");
        const exit = await harness.waitForExit();
        assert.equal(exit.exitCode, 0);

        const afterExit = harness.snapshot();
        assert.ok(afterExit.screen.lines.some((line) => line.includes("input:quit")));
        assert.ok(afterExit.screen.lines.some((line) => line.includes("input:ping")));
      } finally {
        try {
          harness.kill();
        } catch {
          // already exited
        }
      }
    },
  );
}
