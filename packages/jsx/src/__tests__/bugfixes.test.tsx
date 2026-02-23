/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Box, Button, Text } from "../index.js";

describe("jsx bugfix parity", () => {
  test("Button resolves intent to design-system props", () => {
    const vnode = <Button id="x" label="X" intent="primary" />;
    const expected = ui.button({ id: "x", label: "X", intent: "primary" });

    assert.deepEqual(vnode, expected);
    if (vnode.kind !== "button") {
      throw new Error("Expected button VNode");
    }
    assert.equal(vnode.props.dsVariant, "solid");
    assert.equal(vnode.props.dsTone, "primary");
  });

  test("Button intent preserves explicit dsVariant overrides", () => {
    const vnode = <Button id="x" label="X" intent="primary" dsVariant="outline" />;
    const expected = ui.button({
      id: "x",
      label: "X",
      intent: "primary",
      dsVariant: "outline",
    });

    assert.deepEqual(vnode, expected);
    if (vnode.kind !== "button") {
      throw new Error("Expected button VNode");
    }
    assert.equal(vnode.props.dsVariant, "outline");
  });

  test("Box resolves preset values through ui.box", () => {
    const vnode = (
      <Box preset="card">
        <Text>inside</Text>
      </Box>
    );
    const expected = ui.box({ preset: "card" }, [ui.text("inside")]);

    assert.deepEqual(vnode, expected);
    if (vnode.kind !== "box") {
      throw new Error("Expected box VNode");
    }
    assert.equal(vnode.props.border, "rounded");
    assert.equal(vnode.props.p, 1);
  });

  test("Box preset preserves explicit border override", () => {
    const vnode = <Box preset="card" border="double" />;
    const expected = ui.box({ preset: "card", border: "double" }, []);

    assert.deepEqual(vnode, expected);
    if (vnode.kind !== "box") {
      throw new Error("Expected box VNode");
    }
    assert.equal(vnode.props.border, "double");
    assert.equal(vnode.props.p, 1);
  });
});
