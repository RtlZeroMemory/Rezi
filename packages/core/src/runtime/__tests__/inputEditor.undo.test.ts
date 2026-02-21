import { assert, describe, test } from "@rezi-ui/testkit";
import { INPUT_UNDO_STACK_CAP, InputUndoStack, getInputSelectionText } from "../inputEditor.js";

describe("inputEditor.undo", () => {
  test("groups rapid typing within 300ms", () => {
    const stack = new InputUndoStack();

    stack.push(
      { value: "", cursor: 0, selectionStart: null, selectionEnd: null },
      { value: "a", cursor: 1, selectionStart: null, selectionEnd: null },
      100,
      true,
    );
    stack.push(
      { value: "a", cursor: 1, selectionStart: null, selectionEnd: null },
      { value: "ab", cursor: 2, selectionStart: null, selectionEnd: null },
      250,
      true,
    );

    const undo = stack.undoSnapshot();
    assert.deepEqual(undo, { value: "", cursor: 0, selectionStart: null, selectionEnd: null });
    assert.equal(stack.canUndo(), false);
    assert.equal(stack.canRedo(), true);
  });

  test("keeps non-groupable edits as separate entries", () => {
    const stack = new InputUndoStack();

    stack.push(
      { value: "", cursor: 0, selectionStart: null, selectionEnd: null },
      { value: "a", cursor: 1, selectionStart: null, selectionEnd: null },
      100,
      true,
    );
    stack.push(
      { value: "a", cursor: 1, selectionStart: null, selectionEnd: null },
      { value: "", cursor: 0, selectionStart: null, selectionEnd: null },
      150,
      false,
    );

    const firstUndo = stack.undoSnapshot();
    const secondUndo = stack.undoSnapshot();
    assert.deepEqual(firstUndo, {
      value: "a",
      cursor: 1,
      selectionStart: null,
      selectionEnd: null,
    });
    assert.deepEqual(secondUndo, {
      value: "",
      cursor: 0,
      selectionStart: null,
      selectionEnd: null,
    });
  });

  test("caps history length at INPUT_UNDO_STACK_CAP", () => {
    const stack = new InputUndoStack();
    for (let i = 0; i < INPUT_UNDO_STACK_CAP + 5; i++) {
      const before = String(i);
      const after = String(i + 1);
      stack.push(
        { value: before, cursor: before.length, selectionStart: null, selectionEnd: null },
        { value: after, cursor: after.length, selectionStart: null, selectionEnd: null },
        i * 1000,
        false,
      );
    }

    let undos = 0;
    while (stack.undoSnapshot()) undos++;
    assert.equal(undos, INPUT_UNDO_STACK_CAP);
  });

  test("getInputSelectionText normalizes reversed selection", () => {
    assert.equal(getInputSelectionText("hello", 4, 1), "ell");
    assert.equal(getInputSelectionText("hello", 2, 2), null);
  });
});
