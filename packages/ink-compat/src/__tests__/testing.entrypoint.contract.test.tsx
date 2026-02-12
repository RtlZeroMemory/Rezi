import { strict as assert } from "node:assert";
import test from "node:test";

import React, { useEffect, useRef, useState } from "react";

import { Text, useInput, useStderr } from "../index.js";
import { cleanup, render } from "../testing.js";
import { flushTurns } from "./helpers.js";

test.afterEach(() => {
  cleanup();
});

test("testing_render_exposes_ink_testing_library_v4_shape (IKINV-009)", async () => {
  const app = render(<Text>alpha</Text>);

  await flushTurns(6);
  assert.equal(app.lastFrame(), "alpha");
  assert.equal(app.stdout.lastFrame(), "alpha");
  assert.equal(app.frames.at(-1), "alpha");
  assert.equal(app.frames, app.stdout.frames);

  app.rerender(<Text>beta</Text>);
  await flushTurns(6);

  assert.equal(app.lastFrame(), "beta");
  assert.equal(app.frames.at(-1), "beta");

  app.unmount();
  app.cleanup();
  app.cleanup();
});

test("testing_stdin_write_drives_input_events (IKINV-005)", async () => {
  const Probe = () => {
    const [value, setValue] = useState("idle");

    useInput((input, key) => {
      if (key.return) {
        setValue((previous) => `${previous}|enter`);
        return;
      }

      setValue((previous) => `${previous}${input}`);
    });

    return <Text>{value}</Text>;
  };

  const app = render(<Probe />, { isTTY: true });
  await flushTurns(6);

  app.stdin.write("a");
  await flushTurns(4);
  app.stdin.write("b");
  await flushTurns(4);
  app.stdin.write("\r");
  await flushTurns(8);

  assert.equal(app.lastFrame(), "idleab|enter");

  app.unmount();
  app.cleanup();
});

test("testing_cleanup_global_is_idempotent (IKINV-007)", async () => {
  render(<Text>one</Text>);
  render(<Text>two</Text>);

  await flushTurns(4);

  cleanup();
  cleanup();
});

test("testing_render_default_stdin_respects_is_tty_option (IKINV-005)", async () => {
  const nonTty = render(<Text>non-tty</Text>, { isTTY: false });
  await flushTurns(4);
  assert.equal(nonTty.stdin.isTTY, false);
  nonTty.unmount();
  nonTty.cleanup();

  const tty = render(<Text>tty</Text>, { isTTY: true });
  await flushTurns(4);
  assert.equal(tty.stdin.isTTY, true);
  tty.unmount();
  tty.cleanup();
});

test("testing_stderr_collects_frames (IKINV-007)", async () => {
  const Probe = () => {
    const { write } = useStderr();
    const wroteRef = useRef(false);

    useEffect(() => {
      if (wroteRef.current) {
        return;
      }

      wroteRef.current = true;
      write("stderr-frame");
    }, [write]);

    return <Text>stdout-frame</Text>;
  };

  const app = render(<Probe />);
  await flushTurns(8);

  assert.equal(app.stderr.lastFrame(), "stderr-frame");
  assert.equal(app.stderr.frames.at(-1), "stderr-frame");
  assert.ok(app.stdout.frames.length >= 1);

  app.unmount();
  app.cleanup();
});
