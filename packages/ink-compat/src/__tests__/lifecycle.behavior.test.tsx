import { strict as assert } from "node:assert";
import test from "node:test";

import React, { useEffect } from "react";

import { Text, render, useApp } from "../index.js";
import { MemoryWriteStream, createStdin, flushTurns, stripAnsi } from "./helpers.js";

function createStreams(isTTY = false): Readonly<{
  stdout: MemoryWriteStream;
  stderr: MemoryWriteStream;
  stdin: NodeJS.ReadStream;
}> {
  return {
    stdout: new MemoryWriteStream({ isTTY, columns: 80 }),
    stderr: new MemoryWriteStream({ isTTY, columns: 80 }),
    stdin: createStdin(isTTY),
  };
}

test("lifecycle_wait_until_exit_resolves (IKINV-001)", async () => {
  const io = createStreams(false);
  const app = render(<Text>x</Text>, { ...io, debug: true });

  const done = app.waitUntilExit();
  app.unmount();
  await done;

  app.cleanup();
});

test("lifecycle_cleanup_idempotent (IKINV-007)", async () => {
  const io = createStreams(false);
  const app = render(<Text>x</Text>, { ...io, debug: true });

  app.cleanup();
  app.cleanup();

  await flushTurns();
});

test("lifecycle_unmount_idempotent (IKINV-001)", async () => {
  const io = createStreams(false);
  const app = render(<Text>x</Text>, { ...io, debug: true });

  app.unmount();
  app.unmount();
  app.cleanup();

  await flushTurns();
});

test("lifecycle_on_render_invoked (IKINV-001)", async () => {
  const io = createStreams(false);
  let calls = 0;

  const app = render(<Text>m</Text>, {
    ...io,
    debug: true,
    onRender: () => {
      calls++;
    },
  });

  await flushTurns();
  assert.ok(calls >= 1);

  app.unmount();
  app.cleanup();
});

test("lifecycle_render_with_stream_shorthand (IKINV-009)", async () => {
  const stdout = new MemoryWriteStream({ isTTY: false, columns: 80 });
  const app = render(<Text>short</Text>, stdout);

  await flushTurns();
  assert.match(stripAnsi(stdout.output()), /short/);

  app.unmount();
  app.cleanup();
});

test("lifecycle_rerender_writes_latest_frame (IKINV-001)", async () => {
  const io = createStreams(false);
  const app = render(<Text>first</Text>, { ...io, debug: true });

  app.rerender(<Text>second</Text>);
  await flushTurns();

  assert.match(stripAnsi(io.stdout.output()), /second/);

  app.unmount();
  app.cleanup();
});

test("lifecycle_clear_non_tty_no_throw (IKINV-008)", async () => {
  const io = createStreams(false);
  const app = render(<Text>clear</Text>, { ...io, debug: true });

  app.clear();
  app.clear();

  app.unmount();
  app.cleanup();
  await flushTurns();
});

test("lifecycle_use_app_exit (IKINV-001)", async () => {
  const io = createStreams(false);

  const ExitOnMount = () => {
    const { exit } = useApp();

    useEffect(() => {
      exit();
    }, [exit]);

    return <Text>bye</Text>;
  };

  const app = render(<ExitOnMount />, { ...io, debug: true });
  await app.waitUntilExit();
  app.cleanup();
});
