import { assert, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import { ui } from "../../index.js";
import { charToKeyCode } from "../keyCodes.js";

function keyOf(char: string): number {
  const key = charToKeyCode(char);
  if (key === null) throw new Error(`invalid key char: ${char}`);
  return key;
}

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

test("mode switch inside a keybinding handler applies to the next event", async () => {
  const backend = new StubBackend();
  const calls: string[] = [];
  const app = createApp({ backend, initialState: 0 });

  const KEY_I = keyOf("i");
  const KEY_X = keyOf("x");

  app.view(() => ui.text("mode test"));
  app.modes({
    normal: {
      i: () => {
        calls.push("normal:i");
        app.setMode("insert");
      },
      x: () => {
        calls.push("normal:x");
      },
    },
    insert: {
      x: () => {
        calls.push("insert:x");
      },
    },
  });
  app.setMode("normal");

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
  await settleNextFrame(backend);

  await pushEvents(backend, [
    { kind: "key", timeMs: 2, key: KEY_I, action: "down" },
    { kind: "key", timeMs: 3, key: KEY_X, action: "down" },
  ]);

  assert.deepEqual(calls, ["normal:i", "insert:x"]);
});
