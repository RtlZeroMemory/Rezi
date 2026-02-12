import { strict as assert } from "node:assert";
import test from "node:test";

import React, { useEffect, useState } from "react";

import { Text, normalizeKey, render, useStdin } from "../index.js";
import { MemoryWriteStream, createStdin, flushTurns, stripAnsi } from "./helpers.js";

function createNonTtyIo(): Readonly<{
  stdout: MemoryWriteStream;
  stderr: MemoryWriteStream;
  stdin: NodeJS.ReadStream;
}> {
  return {
    stdout: new MemoryWriteStream({ isTTY: false, columns: 80 }),
    stderr: new MemoryWriteStream({ isTTY: false, columns: 80 }),
    stdin: createStdin(false),
  };
}

test("non_tty_render_is_deterministic (IKINV-008)", async () => {
  const io = createNonTtyIo();
  const app = render(<Text>non-tty</Text>, { ...io, debug: true });

  await flushTurns();
  assert.match(stripAnsi(io.stdout.output()), /non-tty/);

  app.unmount();
  app.cleanup();
});

test("non_tty_clear_is_safe (IKINV-008)", async () => {
  const io = createNonTtyIo();
  const app = render(<Text>clear-safe</Text>, { ...io, debug: true });

  app.clear();
  app.clear();

  app.unmount();
  app.cleanup();
  await flushTurns();
});

test("use_stdin_reports_non_raw_support (IKINV-008)", async () => {
  const io = createNonTtyIo();

  const Probe = () => {
    const { isRawModeSupported } = useStdin();
    return <Text>{String(isRawModeSupported)}</Text>;
  };

  const app = render(<Probe />, { ...io, debug: true });
  await flushTurns();

  assert.match(stripAnsi(io.stdout.output()), /false/);

  app.unmount();
  app.cleanup();
});

test("set_raw_mode_on_unsupported_stdin_throws (IKINV-007)", async () => {
  const io = createNonTtyIo();

  const Probe = () => {
    const { isRawModeSupported, setRawMode } = useStdin();
    const [state, setState] = useState("initial");

    useEffect(() => {
      try {
        setRawMode(true);
        setState("no-throw");
      } catch {
        setState("threw");
      }
    }, [setRawMode]);

    return (
      <Text>
        {String(isRawModeSupported)}:{state}
      </Text>
    );
  };

  const app = render(<Probe />, { ...io, debug: true });
  await flushTurns(6);

  assert.match(stripAnsi(io.stdout.output()), /false:threw/);

  app.unmount();
  app.cleanup();
});

test("normalize_key_handles_malformed_input (IKINV-005)", () => {
  const normalized = normalizeKey({
    upArrow: 1 as unknown as boolean,
    return: true,
    ctrl: "yes" as unknown as boolean,
  });

  assert.equal(normalized.upArrow, false);
  assert.equal(normalized.return, true);
  assert.equal(normalized.enter, true);
  assert.equal(normalized.ctrl, false);
  assert.equal(normalized.escape, false);
});
