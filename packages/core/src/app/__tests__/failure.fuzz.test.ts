import { assert, createFuzzFaultPlan, runFuzz, test } from "@rezi-ui/testkit";
import { ui } from "../../widgets/ui.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

const FAILURE_POINTS = ["start", "getCaps", "poll", "frame", "stop"] as const;
type FailurePoint = (typeof FAILURE_POINTS)[number];

async function settle(backend: StubBackend): Promise<void> {
  if (backend.requestedFrames.length > 0) {
    try {
      backend.resolveNextFrame();
    } catch {
      // The fault plan may already have rejected the only in-flight frame.
    }
  }
  await flushMicrotasks(16);
}

async function emitResize(backend: StubBackend): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 60, rows: 16 }],
      }),
    }),
  );
  await flushMicrotasks(16);
}

test("createApp failure fuzz: injected backend failures produce structured lifecycle outcomes", async () => {
  await runFuzz(
    {
      seed: 0xfa17_0001,
      iterations: 256,
      label: "createApp backend failures",
    },
    async (ctx) => {
      const plan = createFuzzFaultPlan<FailurePoint>(ctx, FAILURE_POINTS, {
        minFailures: 1,
        maxFailures: 2,
      });
      ctx.note(`faults=${plan.describe()}`);

      const backend = new StubBackend();
      const app = createApp({ backend, initialState: 0 });
      const fatals: string[] = [];

      app.view((state) => appText(state));
      app.onEvent((event) => {
        if (event.kind === "fatal") fatals.push(`${event.code}:${event.detail}`);
      });

      if (plan.has("start")) {
        backend.queueStartFailure(new Error("fuzz start failure"));
        await assert.rejects(app.start(), /backend.start rejected: Error: fuzz start failure/u);
        assert.equal(backend.startCalls, 1);
        assert.equal(backend.requestedFrames.length, 0);
        app.dispose();
        return;
      }

      if (plan.has("getCaps")) backend.queueGetCapsFailure(new Error("fuzz caps failure"));
      await app.start();
      assert.equal(backend.startCalls, 1);
      await emitResize(backend);
      assert.equal(backend.requestedFrames.length >= 1, true);

      if (plan.has("frame")) {
        backend.rejectNextFrame(new Error("fuzz frame failure"));
        await flushMicrotasks(20);
        assert.equal(
          fatals.some((fatal) => fatal.startsWith("ZRUI_BACKEND_ERROR:requestFrame")),
          true,
        );
        assert.equal(backend.stopCalls >= 1, true);
        assert.equal(backend.disposeCalls >= 1, true);
        return;
      }

      await settle(backend);

      if (plan.has("poll")) {
        backend.queuePollFailure(new Error("fuzz poll failure"));
        await flushMicrotasks(20);
        assert.equal(
          fatals.some((fatal) => fatal.startsWith("ZRUI_BACKEND_ERROR:pollEvents rejected:")),
          true,
        );
        assert.equal(backend.stopCalls >= 1, true);
        assert.equal(backend.disposeCalls >= 1, true);
        return;
      }

      if (plan.has("stop")) {
        backend.queueStopFailure(new Error("fuzz stop failure"));
        backend.pushBatch(
          makeBackendBatch({
            bytes: encodeZrevBatchV1({
              events: [{ kind: "text", timeMs: 2, codepoint: 113 }],
            }),
          }),
        );
        await flushMicrotasks(20);
        assert.equal(
          fatals.some((fatal) =>
            fatal.startsWith("ZRUI_BACKEND_ERROR:stop rejected after unhandled quit input:"),
          ),
          true,
        );
        assert.equal(backend.stopCalls >= 1, true);
        app.dispose();
        return;
      }

      await app.stop();
      app.dispose();
      assert.equal(fatals.length, 0);
    },
  );
});

function appText(state: number) {
  return ui.text(`state:${String(state)}`);
}
