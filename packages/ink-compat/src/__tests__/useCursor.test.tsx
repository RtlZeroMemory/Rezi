import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import CursorContext from "../context/CursorContext.js";
import { Text, useCursor } from "../index.js";
import { createRootContainer, type HostRoot, updateRootContainer } from "../reconciler.js";

function createHostRoot(): HostRoot {
  return {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit() {},
  };
}

describe("useCursor()", () => {
  test("propagates cursor position on commit and clears it on unmount cleanup", () => {
    const calls: Array<{ x: number; y: number } | undefined> = [];

    function Probe() {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 2, y: 3 });
      return <Text>cursor</Text>;
    }

    const root = createHostRoot();
    const container = createRootContainer(root);

    updateRootContainer(
      container,
      <CursorContext.Provider value={{ setCursorPosition: (position) => calls.push(position) }}>
        <Probe />
      </CursorContext.Provider>,
    );
    assert.deepEqual(calls[0], { x: 2, y: 3 });

    updateRootContainer(container, null);
    assert.equal(calls[calls.length - 1], undefined);
  });
});
