import { parseEventBatchV1 } from "@rezi-ui/core";
import { assert, test } from "@rezi-ui/testkit";
import { createNodeBackendInternal } from "../backend/nodeBackend.js";

const { REZI_E2E_PROFILE } = process.env;
const e2eProfile = REZI_E2E_PROFILE === "reduced" ? "reduced" : "full";

test(
  "terminal e2e reduced: worker backend frame/events/debug with native shim",
  { skip: e2eProfile === "reduced" ? false : "reduced-profile-only" },
  async () => {
    const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
    const backend = createNodeBackendInternal({
      config: {
        executionMode: "worker",
        fpsCap: 60,
        maxEventBytes: 1024,
        frameTransport: "sab",
        frameSabSlotCount: 2,
        frameSabSlotBytes: 64,
      },
      nativeShimModule: shim,
    });

    let started = false;
    let batch: { bytes: Uint8Array; release: () => void } | null = null;
    try {
      await backend.start();
      started = true;

      const caps = await backend.getCaps();
      assert.equal(caps.colorMode, 2);
      assert.equal(caps.supportsMouse, true);
      assert.equal(caps.supportsSyncUpdate, true);

      const drawlist = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
      const drawlistBefore = Array.from(drawlist);
      await backend.requestFrame(drawlist);
      assert.deepEqual(Array.from(drawlist), drawlistBefore);

      const payload = Uint8Array.from([9, 8, 7]);
      backend.postUserEvent(4242, payload);

      batch = await backend.pollEvents();
      const parsed = parseEventBatchV1(batch.bytes);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.value.events.length, 1);
        const ev = parsed.value.events[0];
        assert.ok(ev !== undefined);
        if (ev !== undefined) {
          assert.equal(ev.kind, "user");
          if (ev.kind === "user") {
            assert.equal(ev.tag, 4242);
            assert.deepEqual(Array.from(ev.payload), [9, 8, 7]);
          }
        }
      }

      await backend.debug.debugEnable({ enabled: true, ringCapacity: 64 });
      const q = await backend.debug.debugQuery({ maxRecords: 4 });
      assert.ok(q.headers.byteLength >= 40);
      assert.ok(q.result.recordsReturned >= 0);
      assert.ok(q.result.recordsAvailable >= 0);
      const stats = await backend.debug.debugGetStats();
      assert.ok(typeof stats.totalRecords === "bigint");
      assert.ok(typeof stats.totalDropped === "bigint");
      await backend.debug.debugDisable();
    } finally {
      if (batch !== null) {
        batch.release();
      }
      if (started) {
        await backend.stop();
      }
      backend.dispose();
    }
  },
);
