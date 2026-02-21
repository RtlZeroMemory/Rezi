import { assert, describe, test } from "@rezi-ui/testkit";
import { parseEventBatchV1 } from "../../protocol/zrev_v1.js";
import {
  TEST_MOUSE_KIND_DOWN,
  TEST_MOUSE_KIND_UP,
  TestEventBuilder,
  encodeZrevBatchV1,
  makeBackendBatch,
} from "../events.js";

describe("TestEventBuilder", () => {
  test("builds readable fluent event sequences into parseable ZREV bytes", () => {
    const events = new TestEventBuilder();
    events.pressKey("Enter");
    events.type("hi");
    events.click(10, 5);
    events.resize(120, 40);

    const parsed = parseEventBatchV1(events.build());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.value.events.length, 6);
    assert.deepEqual(parsed.value.events[0], {
      kind: "key",
      timeMs: 1,
      key: 2,
      mods: 0,
      action: "down",
    });
    assert.deepEqual(parsed.value.events[1], {
      kind: "text",
      timeMs: 2,
      codepoint: "h".codePointAt(0) ?? 0,
    });
    assert.deepEqual(parsed.value.events[2], {
      kind: "text",
      timeMs: 3,
      codepoint: "i".codePointAt(0) ?? 0,
    });
    assert.deepEqual(parsed.value.events[3], {
      kind: "mouse",
      timeMs: 4,
      x: 10,
      y: 5,
      mouseKind: TEST_MOUSE_KIND_DOWN,
      mods: 0,
      buttons: 1,
      wheelX: 0,
      wheelY: 0,
    });
    assert.deepEqual(parsed.value.events[4], {
      kind: "mouse",
      timeMs: 5,
      x: 10,
      y: 5,
      mouseKind: TEST_MOUSE_KIND_UP,
      mods: 0,
      buttons: 0,
      wheelX: 0,
      wheelY: 0,
    });
    assert.deepEqual(parsed.value.events[5], {
      kind: "resize",
      timeMs: 6,
      cols: 120,
      rows: 40,
    });
  });

  test("encodes paste and user payloads with alignment", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const bytes = encodeZrevBatchV1({
      events: [
        { kind: "paste", timeMs: 7, bytes: new Uint8Array([0x41, 0x42, 0x43]) },
        { kind: "user", timeMs: 8, tag: 99, payload },
      ],
    });

    const parsed = parseEventBatchV1(bytes);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.value.events.length, 2);
    assert.deepEqual(parsed.value.events[0], {
      kind: "paste",
      timeMs: 7,
      bytes: new Uint8Array([0x41, 0x42, 0x43]),
    });
    assert.deepEqual(parsed.value.events[1], {
      kind: "user",
      timeMs: 8,
      tag: 99,
      payload,
    });
  });

  test("makeBackendBatch release is idempotent", () => {
    let releases = 0;
    const batch = makeBackendBatch({
      bytes: new Uint8Array([1, 2, 3]),
      droppedBatches: 2,
      onRelease: () => {
        releases++;
      },
    });

    assert.equal(batch.droppedBatches, 2);
    batch.release();
    batch.release();
    assert.equal(releases, 1);
  });
});
