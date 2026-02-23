/** @jsxImportSource @rezi-ui/jsx */

import { createTestRenderer, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import {
  Badge,
  Callout,
  Empty,
  ErrorDisplay,
  Icon,
  Kbd,
  RichText,
  Status,
  Tag,
  Text,
} from "../index.js";

describe("text and display widgets", () => {
  test("Text concatenates children and maps props", () => {
    const value = 5;
    const vnode = (
      <Text style={{ bold: true }} variant="heading" textOverflow="ellipsis" maxWidth={20}>
        Hello {"world"}, value: {value}
      </Text>
    );

    assert.deepEqual(
      vnode,
      ui.text("Hello world, value: 5", {
        style: { bold: true },
        variant: "heading",
        textOverflow: "ellipsis",
        maxWidth: 20,
      }),
    );
  });

  test("Text forwards wrap for multiline layout", () => {
    const vnode = (
      <Text wrap maxWidth={4}>
        wrap me
      </Text>
    );
    const rendered = createTestRenderer({ viewport: { cols: 20, rows: 10 } }).render(vnode);
    const root = rendered.nodes.find((node) => node.path.length === 0);
    assert.ok(root !== undefined);
    if (!root) return;
    assert.equal(root.rect.w, 4);
    assert.equal(root.rect.h, 2);
  });

  test("Text preserves numeric zero and empty string and filters booleans/null", () => {
    assert.deepEqual(<Text>{0}</Text>, ui.text("0"));
    assert.deepEqual(<Text>{""}</Text>, ui.text(""));
    assert.deepEqual(<Text>{null}</Text>, ui.text(""));
    assert.deepEqual(<Text>{true}</Text>, ui.text(""));
  });

  test("RichText, Badge, Tag, Status, Icon, Kbd map to matching VNodes", () => {
    assert.deepEqual(
      <RichText spans={[{ text: "A", style: { bold: true } }, { text: "B" }]} />,
      ui.richText([{ text: "A", style: { bold: true } }, { text: "B" }]),
    );
    assert.deepEqual(
      <Badge text="New" variant="success" />,
      ui.badge("New", { variant: "success" }),
    );
    assert.deepEqual(<Tag text="TS" variant="info" />, ui.tag("TS", { variant: "info" }));
    assert.deepEqual(
      <Status status="online" label="Ready" showLabel />,
      ui.status("online", { label: "Ready", showLabel: true }),
    );
    assert.deepEqual(<Icon icon="status.check" />, ui.icon("status.check"));
    assert.deepEqual(<Kbd keys="Ctrl+S" />, ui.kbd("Ctrl+S"));
    assert.deepEqual(<Kbd keys={["Ctrl", "Shift", "P"]} />, ui.kbd(["Ctrl", "Shift", "P"]));
  });

  test("Empty, ErrorDisplay, and Callout map to matching VNodes", () => {
    const action = ui.button("retry", "Retry");

    assert.deepEqual(
      <Empty title="No data" description="Try again" action={action} />,
      ui.empty("No data", { description: "Try again", action }),
    );
    assert.deepEqual(
      <ErrorDisplay message="Boom" title="Error" showStack stack="trace" />,
      ui.errorDisplay("Boom", { title: "Error", showStack: true, stack: "trace" }),
    );
    assert.deepEqual(
      <Callout message="Heads up" variant="info" title="Info" />,
      ui.callout("Heads up", { variant: "info", title: "Info" }),
    );
  });
});
