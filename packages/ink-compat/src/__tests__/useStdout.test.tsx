import { assert, describe, test } from "@rezi-ui/testkit";
import React, { useEffect } from "react";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useStdout } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function flushPassiveEffects(): void {
  while (reconciler.flushPassiveEffects()) {}
}

function mountWithStdio(element: React.ReactNode, stdio: StdioContextValue) {
  const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
  const container = createRootContainer(root);

  const wrapped = React.createElement(StdioContext.Provider, { value: stdio }, element);
  updateRootContainer(container, wrapped);
  flushPassiveEffects();

  return {
    unmount() {
      updateRootContainer(container, null);
      flushPassiveEffects();
    },
  };
}

describe("useStdout()", () => {
  test("returns stdout and write()", () => {
    const writes: string[] = [];
    const stdout = {
      write: (s: string) => {
        writes.push(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const emitter: StdioContextValue["internal_eventEmitter"] = Object.freeze({
      on: (_event, _listener) => {},
      removeListener: (_event, _listener) => {},
      emit: (_event, _value) => {},
    });

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: true,
      internal_eventEmitter: emitter,
    });

    function App() {
      const { stdout: out, write } = useStdout();
      useEffect(() => {
        write("x");
      }, [write]);
      assert.equal(out, stdout);
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);
    assert.deepEqual(writes, ["x"]);
    inst.unmount();
  });
});
