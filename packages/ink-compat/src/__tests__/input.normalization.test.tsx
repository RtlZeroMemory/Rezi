import { strict as assert } from "node:assert";
import test from "node:test";

import React from "react";

import { type InkCompatKey, Text, isCtrlC, normalizeKey, useInput } from "../index.js";
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

test("input_page_up_normalized (IKINV-005)", async () => {
  await assertKeySequence("\u001B[5~", (event) => {
    assert.equal(event.input, "");
    assert.equal(event.key.pageUp, true);
  });
});

test("input_page_down_normalized (IKINV-005)", async () => {
  await assertKeySequence("\u001B[6~", (event) => {
    assert.equal(event.input, "");
    assert.equal(event.key.pageDown, true);
  });
});

test("input_meta_letter_normalized (IKINV-005)", async () => {
  await assertKeySequence("\u001Bz", (event) => {
    assert.equal(event.input, "z");
    assert.equal(event.key.meta, true);
  });
});

test("input_shift_letter_normalized (IKINV-005)", async () => {
  await assertKeySequence("A", (event) => {
    assert.equal(event.input, "A");
    assert.equal(event.key.shift, true);
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

test("normalize_key_extended_flags (IKINV-005)", () => {
  const normalized = normalizeKey({
    pageUp: true,
    pageDown: true,
    home: true,
    end: true,
    meta: true,
    super: true,
    hyper: true,
    capsLock: true,
    numLock: true,
    eventType: "keypress",
  });

  assert.equal(normalized.pageUp, true);
  assert.equal(normalized.pageDown, true);
  assert.equal(normalized.home, true);
  assert.equal(normalized.end, true);
  assert.equal(normalized.meta, true);
  assert.equal(normalized.super, true);
  assert.equal(normalized.hyper, true);
  assert.equal(normalized.capsLock, true);
  assert.equal(normalized.numLock, true);
  assert.equal(normalized.eventType, "keypress");
});

test("normalize_key_extended_flags_malformed (IKINV-005)", () => {
  const normalized = normalizeKey({
    pageUp: "yes" as unknown as boolean,
    pageDown: 1 as unknown as boolean,
    home: "true" as unknown as boolean,
    end: {} as unknown as boolean,
    meta: [] as unknown as boolean,
    super: "no" as unknown as boolean,
    hyper: 0 as unknown as boolean,
    capsLock: "caps" as unknown as boolean,
    numLock: "num" as unknown as boolean,
    eventType: 42 as unknown as string,
  });

  assert.equal(normalized.pageUp, false);
  assert.equal(normalized.pageDown, false);
  assert.equal(normalized.home, false);
  assert.equal(normalized.end, false);
  assert.equal(normalized.meta, false);
  assert.equal(normalized.super, false);
  assert.equal(normalized.hyper, false);
  assert.equal(normalized.capsLock, false);
  assert.equal(normalized.numLock, false);
  assert.equal(normalized.eventType, undefined);
});
