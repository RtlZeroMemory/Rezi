import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Spacer, Text } from "../index.js";
import { createRootContainer, updateRootContainer, type HostRoot } from "../reconciler.js";

describe("Text nesting errors (Ink message parity)", () => {
  test("throws when <Box> is nested inside <Text>", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    assert.throws(() => {
      updateRootContainer(
        container,
        <Text>
          <Box />
        </Text>,
      );
    }, /<Box> can’t be nested inside <Text> component/);
  });

  test("throws when <Spacer> is nested inside <Text>", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    assert.throws(() => {
      updateRootContainer(
        container,
        <Text>
          <Spacer />
        </Text>,
      );
    }, /<Box> can’t be nested inside <Text> component/);
  });

  test("throws when a raw string is rendered outside <Text>", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    assert.throws(() => {
      updateRootContainer(container, <Box>hi</Box>);
    }, /Text string \"hi\" must be rendered inside <Text> component/);
  });
});

