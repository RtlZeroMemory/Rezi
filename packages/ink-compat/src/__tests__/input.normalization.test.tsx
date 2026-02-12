import { strict as assert } from "node:assert";
import test from "node:test";

import React from "react";

import { type InkCompatKey, Text, isCtrlC, useInput } from "../index.js";
import { createStdin, flushTurns, renderTesting } from "./helpers.js";

type InputEventRecord = Readonly<{
  input: string;
  key: InkCompatKey;
}>;

function buildProbe(
  onEvent: (event: InputEventRecord) => void,
): Parameters<typeof renderTesting>[0] {
  const Probe = () => {
    useInput((input, key) => {
      onEvent({ input, key });
    });

    return <Text>probe</Text>;
  };

  return <Probe />;
}

async function assertKeySequence(
  sequence: string,
  assertEvent: (event: InputEventRecord) => void,
  options?: Parameters<typeof renderTesting>[1],
): Promise<void> {
  let last: InputEventRecord | null = null;
  const app = renderTesting(
    buildProbe((event) => {
      last = event;
    }),
    {
      stdin: createStdin(true),
      ...options,
    },
  );

  await flushTurns(6);
  last = null;
  for (let attempt = 0; attempt < 8 && !last; attempt++) {
    app.stdin.write(sequence);
    await flushTurns(2);
  }

  assert.ok(last);
  assertEvent(last);

  app.unmount();
  app.cleanup();
}

test("input_up_arrow (IKINV-005)", async () => {
  await assertKeySequence("\u001B[A", (event) => {
    assert.equal(event.input, "");
    assert.equal(event.key.upArrow, true);
  });
});

test("input_down_arrow (IKINV-005)", async () => {
  await assertKeySequence("\u001B[B", (event) => {
    assert.equal(event.key.downArrow, true);
  });
});

test("input_left_arrow (IKINV-005)", async () => {
  await assertKeySequence("\u001B[D", (event) => {
    assert.equal(event.key.leftArrow, true);
  });
});

test("input_right_arrow (IKINV-005)", async () => {
  await assertKeySequence("\u001B[C", (event) => {
    assert.equal(event.key.rightArrow, true);
  });
});

test("input_enter_normalized (IKINV-005)", async () => {
  await assertKeySequence("\r", (event) => {
    assert.equal(event.key.return, true);
    assert.equal(event.key.enter, true);
  });
});

test("input_escape_normalized (IKINV-005)", async () => {
  await assertKeySequence("\u001B", (event) => {
    assert.equal(event.key.escape, true);
  });
});

test("input_tab_normalized (IKINV-005)", async () => {
  await assertKeySequence("\t", (event) => {
    assert.equal(event.key.tab, true);
  });
});

test("input_backspace_normalized (IKINV-005)", async () => {
  await assertKeySequence("\u007f", (event) => {
    assert.equal(event.key.backspace, true);
  });
});

test("input_ctrl_c_when_not_exiting (IKINV-005)", async () => {
  await assertKeySequence(
    "\u0003",
    (event) => {
      assert.equal(event.input, "c");
      assert.equal(event.key.ctrl, true);
      assert.equal(isCtrlC(event.input, event.key), true);
    },
    { exitOnCtrlC: false },
  );
});
