import { assert, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT, charToKeyCode } from "../../keybindings/keyCodes.js";
import { ui } from "../../widgets/ui.js";
import { createAppWithInspectorOverlay } from "../inspectorOverlayHelper.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);
  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table must be in bounds");
  const out: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const start = bytesOffset + u32(bytes, span);
    const end = start + u32(bytes, span + 4);
    assert.ok(end <= tableEnd, "string span must be in bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return Object.freeze(out);
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

test("createAppWithInspectorOverlay toggles overlay/hotkey and captures only while enabled", async () => {
  const backend = new StubBackend();
  const app = createAppWithInspectorOverlay({
    backend,
    initialState: 0,
    inspector: {
      title: "Inspector",
      hotkey: "ctrl+shift+i",
    },
  });

  app.view((state) => ui.text(`main-${String(state)}`));

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }]);

  assert.equal(backend.requestedFrames.length, 1);
  assert.equal(app.inspectorOverlay.isEnabled(), false);
  assert.equal(app.inspectorOverlay.getSnapshot(), null);
  const firstFrameStrings = parseInternedStrings(backend.requestedFrames[0] ?? new Uint8Array());
  assert.equal(firstFrameStrings.includes("inspector overlay"), false);

  await settleNextFrame(backend);

  const keyI = charToKeyCode("i");
  assert.notEqual(keyI, null);
  await pushEvents(backend, [
    { kind: "key", timeMs: 2, key: keyI ?? 0, mods: ZR_MOD_CTRL | ZR_MOD_SHIFT, action: "down" },
  ]);

  assert.equal(app.inspectorOverlay.isEnabled(), true);
  assert.equal(backend.requestedFrames.length, 2);
  const secondFrameStrings = parseInternedStrings(backend.requestedFrames[1] ?? new Uint8Array());
  assert.equal(secondFrameStrings.includes("inspector overlay"), true);
  assert.equal(secondFrameStrings.includes("event: kind=<none> path=<none>"), true);
  assert.equal(secondFrameStrings.includes("event: kind=resize path=<none>"), false);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "resize", timeMs: 3, cols: 81, rows: 24 }]);
  assert.equal(backend.requestedFrames.length, 3);
  const thirdFrameStrings = parseInternedStrings(backend.requestedFrames[2] ?? new Uint8Array());
  assert.equal(thirdFrameStrings.includes("event: kind=<none> path=<none>"), true);

  await settleNextFrame(backend);

  const latestSnapshot = app.inspectorOverlay.getSnapshot();
  assert.equal(latestSnapshot?.event.kind, "resize");
  assert.equal(latestSnapshot?.event.path, null);

  app.update(1);
  await flushMicrotasks(20);
  assert.equal(backend.requestedFrames.length, 4);
  const fourthFrameStrings = parseInternedStrings(backend.requestedFrames[3] ?? new Uint8Array());
  assert.equal(fourthFrameStrings.includes("event: kind=resize path=<none>"), true);

  await settleNextFrame(backend);

  await pushEvents(backend, [
    { kind: "key", timeMs: 6, key: keyI ?? 0, mods: ZR_MOD_CTRL | ZR_MOD_SHIFT, action: "down" },
  ]);

  assert.equal(app.inspectorOverlay.isEnabled(), false);
  assert.equal(backend.requestedFrames.length, 5);
  const fifthFrameStrings = parseInternedStrings(backend.requestedFrames[4] ?? new Uint8Array());
  assert.equal(fifthFrameStrings.includes("inspector overlay"), false);

  await settleNextFrame(backend);
});

test("createAppWithInspectorOverlay forwards replaceView while running", async () => {
  const backend = new StubBackend();
  const app = createAppWithInspectorOverlay({
    backend,
    initialState: 0,
    inspector: { enabled: false, hotkey: false },
  });

  app.view(() => ui.text("old-view"));

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }]);
  assert.equal(
    parseInternedStrings(backend.requestedFrames[0] ?? new Uint8Array()).includes("old-view"),
    true,
  );

  await settleNextFrame(backend);

  app.replaceView(() => ui.text("new-view"));
  await flushMicrotasks(20);
  assert.equal(backend.requestedFrames.length, 2);
  assert.equal(
    parseInternedStrings(backend.requestedFrames[1] ?? new Uint8Array()).includes("new-view"),
    true,
  );
});

test("createAppWithInspectorOverlay forwards replaceRoutes", () => {
  const backend = new StubBackend();
  const app = createAppWithInspectorOverlay({
    backend,
    initialState: 0,
    inspector: { enabled: false, hotkey: false },
  });

  assert.throws(
    () =>
      app.replaceRoutes([
        {
          id: "home",
          screen: () => ui.text("home"),
        },
      ]),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_MODE_CONFLICT",
  );
});
