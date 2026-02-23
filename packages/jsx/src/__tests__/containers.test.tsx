/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Dropdown, Field, FocusTrap, FocusZone, Layer, Modal, Text } from "../index.js";

describe("container and overlay widgets", () => {
  test("Modal, Dropdown, Layer map to matching VNodes", () => {
    const content = ui.text("Are you sure?");
    const close = () => {};

    assert.deepEqual(
      <Modal
        id="confirm"
        content={content}
        onClose={close}
        width={40}
        height={12}
        minWidth={24}
        minHeight={8}
        maxWidth={60}
      />,
      ui.modal({
        id: "confirm",
        content,
        onClose: close,
        width: 40,
        height: 12,
        minWidth: 24,
        minHeight: 8,
        maxWidth: 60,
      }),
    );

    const items = [
      { id: "open", label: "Open" },
      { id: "close", label: "Close" },
    ] as const;
    assert.deepEqual(
      <Dropdown id="menu" anchorId="btn" items={items} />,
      ui.dropdown({ id: "menu", anchorId: "btn", items }),
    );

    assert.deepEqual(
      <Layer id="tooltip" content={ui.text("tip")} />,
      ui.layer({ id: "tooltip", content: ui.text("tip") }),
    );
  });

  test("FocusZone and FocusTrap normalize children", () => {
    const vnode = (
      <FocusZone id="nav" navigation="linear">
        <Text>one</Text>
        <Text>two</Text>
      </FocusZone>
    );

    assert.deepEqual(
      vnode,
      ui.focusZone({ id: "nav", navigation: "linear" }, [ui.text("one"), ui.text("two")]),
    );

    const trapped = (
      <FocusTrap id="dialog" active>
        <Text>inside</Text>
      </FocusTrap>
    );
    assert.deepEqual(trapped, ui.focusTrap({ id: "dialog", active: true }, [ui.text("inside")]));
  });

  test("Field uses a single vnode child", () => {
    const child = <Text>value</Text>;
    const vnode = (
      <Field label="Name" required>
        {child}
      </Field>
    );

    assert.deepEqual(vnode, ui.field({ label: "Name", required: true, children: child }));
  });
});
