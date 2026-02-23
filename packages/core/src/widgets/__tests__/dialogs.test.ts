import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/renderer.js";
import { isCompositeVNode } from "../composition.js";
import { alertDialog, confirmDialog, dialog, promptDialog } from "../dialogs/index.js";
import { ui } from "../ui.js";

describe("dialogs", () => {
  test("confirmDialog returns a modal with actions", () => {
    const v = confirmDialog({
      id: "c",
      title: "T",
      message: "M",
      onConfirm: () => {},
      onCancel: () => {},
    });
    assert.equal(v.kind, "modal");
    const props = v.props as { id?: unknown; title?: unknown; actions?: unknown };
    assert.equal(props.id, "c");
    assert.equal(props.title, "T");
    assert.ok(Array.isArray(props.actions));
  });

  test("alertDialog returns a modal", () => {
    const v = alertDialog({ id: "a", title: "T", message: "M", onClose: () => {} });
    assert.equal(v.kind, "modal");
    assert.equal((v.props as { id?: unknown }).id, "a");
  });

  test("promptDialog returns a composite vnode", () => {
    const v = promptDialog({ id: "p", title: "T", onSubmit: () => {}, onCancel: () => {} });
    assert.equal(isCompositeVNode(v), true);
  });

  test("dialog supports arbitrary action counts", () => {
    const v = dialog({
      id: "save",
      title: "Unsaved Changes",
      message: "Save before closing?",
      actions: [
        { label: "Save", intent: "primary", onPress: () => {} },
        { label: "Don't Save", intent: "danger", onPress: () => {} },
        { label: "Cancel", onPress: () => {} },
      ],
    });

    assert.equal(v.kind, "modal");
    const props = v.props as { actions?: unknown };
    assert.ok(Array.isArray(props.actions));
    assert.equal((props.actions as unknown[]).length, 3);
  });

  test("ui.dialog creates modal action buttons from descriptors", () => {
    const v = ui.dialog({
      id: "x",
      title: "Title",
      message: ui.text("Body"),
      actions: [{ label: "OK", intent: "primary", onPress: () => {} }],
    });

    assert.equal(v.kind, "modal");
    const props = v.props as { actions?: unknown };
    assert.ok(Array.isArray(props.actions));
    const action = (
      props.actions as Array<{ kind?: unknown; props?: { id?: unknown } } | undefined>
    )[0];
    assert.equal(action?.kind, "button");
    assert.equal(action?.props?.id, "x-action-0");
    const actionProps = action?.props as
      | { intent?: unknown; dsVariant?: unknown; dsTone?: unknown }
      | undefined;
    assert.equal(actionProps?.intent, "primary");
    assert.equal(actionProps?.dsVariant, "solid");
    assert.equal(actionProps?.dsTone, "primary");
  });

  test("ui.dialog maps primary intent to solid/primary DS props", () => {
    const renderer = createTestRenderer();
    const result = renderer.render(
      ui.dialog({
        id: "primary-intent",
        title: "Title",
        message: "Body",
        actions: [{ label: "Save", intent: "primary", onPress: () => {} }],
      }),
    );

    const action = result.findById("primary-intent-action-0");
    const actionProps = action?.props as { dsVariant?: unknown; dsTone?: unknown } | undefined;
    assert.equal(actionProps?.dsVariant, "solid");
    assert.equal(actionProps?.dsTone, "primary");
  });

  test("ui.dialog maps danger intent to outline/danger DS props", () => {
    const renderer = createTestRenderer();
    const result = renderer.render(
      ui.dialog({
        id: "danger-intent",
        title: "Title",
        message: "Body",
        actions: [{ label: "Delete", intent: "danger", onPress: () => {} }],
      }),
    );

    const action = result.findById("danger-intent-action-0");
    const actionProps = action?.props as { dsVariant?: unknown; dsTone?: unknown } | undefined;
    assert.equal(actionProps?.dsVariant, "outline");
    assert.equal(actionProps?.dsTone, "danger");
  });

  test("ui.dialog keeps default button styling when action has no intent", () => {
    const renderer = createTestRenderer();
    const result = renderer.render(
      ui.dialog({
        id: "no-intent",
        title: "Title",
        message: "Body",
        actions: [{ label: "OK", onPress: () => {} }],
      }),
    );

    const action = result.findById("no-intent-action-0");
    assert.equal(Object.prototype.hasOwnProperty.call(action?.props ?? {}, "dsVariant"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(action?.props ?? {}, "dsTone"), false);
  });

  test("ui.dialog does not map implicit close to last action", () => {
    const close = () => {};
    const v = ui.dialog({
      id: "dangerous",
      title: "Confirm",
      message: "Delete record?",
      actions: [
        { label: "Keep", onPress: () => {} },
        { label: "Delete", intent: "danger", onPress: close },
      ],
    });

    const props = v.props as { onClose?: unknown };
    assert.equal(props.onClose, undefined);
  });

  test("ui.dialog forwards explicit onClose callback", () => {
    const close = () => {};
    const v = ui.dialog({
      id: "dialog",
      title: "Title",
      message: "Body",
      actions: [{ label: "OK", onPress: () => {} }],
      onClose: close,
    });

    const props = v.props as { onClose?: unknown };
    assert.equal(props.onClose, close);
  });
});
