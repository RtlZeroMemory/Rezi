import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useStdin } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

describe("useStdin()", () => {
  test("throws when used outside render() root", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    function App() {
      useStdin();
      return <Text>hi</Text>;
    }

    assert.throws(() => {
      updateRootContainer(container, <App />);
    }, /StdioContext missing/);
  });

  test("returns provided stdin/stdout/stderr", () => {
    const emitter: StdioContextValue["internal_eventEmitter"] = Object.freeze({
      on: (_event, _listener) => {},
      removeListener: (_event, _listener) => {},
      emit: (_event, _value) => {},
    });

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: true,
      internal_eventEmitter: emitter,
    });

    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    function App() {
      const v = useStdin();
      assert.equal(v.stdin, stdio.stdin);
      return <Text>hi</Text>;
    }

    const wrapped = React.createElement(StdioContext.Provider, { value: stdio }, <App />);
    updateRootContainer(container, wrapped);
  });
});
