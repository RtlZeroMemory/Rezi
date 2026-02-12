import { strict as assert } from "node:assert";
import test from "node:test";

import type React from "react";
import { useEffect, useRef, useState } from "react";

import { Text, render, useStderr, useStdout } from "../index.js";
import { MemoryWriteStream, createStdin, flushTurns, stripAnsi } from "./helpers.js";

function createIo(isTTY: boolean): Readonly<{
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

type StreamProbeProps = Readonly<{
  expectedStdout: NodeJS.WriteStream;
  expectedStderr: NodeJS.WriteStream;
  mode: "tty" | "non-tty";
}>;

function StreamProbe(props: StreamProbeProps): React.JSX.Element {
  const { stdout, write: writeStdout } = useStdout();
  const { stderr, write: writeStderr } = useStderr();
  const [state, setState] = useState("pending");
  const wroteRef = useRef(false);

  useEffect(() => {
    if (wroteRef.current) {
      return;
    }

    wroteRef.current = true;
    writeStdout(`HOOK_STDOUT_${props.mode}\n`);
    writeStderr(`HOOK_STDERR_${props.mode}\n`);
    setState(
      `stdoutMatch=${stdout === props.expectedStdout ? 1 : 0};stderrMatch=${stderr === props.expectedStderr ? 1 : 0}`,
    );
  }, [
    props.expectedStderr,
    props.expectedStdout,
    props.mode,
    stderr,
    stdout,
    writeStderr,
    writeStdout,
  ]);

  return <Text>{state}</Text>;
}

async function assertStreamContracts(mode: "tty" | "non-tty"): Promise<void> {
  const isTTY = mode === "tty";
  const io = createIo(isTTY);
  const app = render(
    <StreamProbe
      expectedStdout={io.stdout as unknown as NodeJS.WriteStream}
      expectedStderr={io.stderr as unknown as NodeJS.WriteStream}
      mode={mode}
    />,
    { ...io, debug: true },
  );

  await flushTurns(8);

  const stdoutText = stripAnsi(io.stdout.output());
  const stderrText = stripAnsi(io.stderr.output());

  assert.match(stdoutText, /stdoutMatch=1;stderrMatch=1/);
  assert.match(stdoutText, new RegExp(`HOOK_STDOUT_${mode}`));
  assert.match(stderrText, new RegExp(`HOOK_STDERR_${mode}`));
  assert.doesNotMatch(stdoutText, new RegExp(`HOOK_STDERR_${mode}`));
  assert.doesNotMatch(stderrText, new RegExp(`HOOK_STDOUT_${mode}`));

  app.unmount();
  app.cleanup();
  app.cleanup();
}

test("stream_hooks_contract_non_tty (IKINV-007, IKINV-008)", async () => {
  await assertStreamContracts("non-tty");
});

test("stream_hooks_contract_tty (IKINV-007, IKINV-008)", async () => {
  await assertStreamContracts("tty");
});
