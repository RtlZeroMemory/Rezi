import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

function mustLayout(
  node:
    | ReturnType<typeof ui.modal>
    | ReturnType<typeof ui.commandPalette>
    | ReturnType<typeof ui.toastContainer>
    | ReturnType<typeof ui.toolApprovalDialog>,
  w: number,
  h: number,
) {
  const res = layout(node, 0, 0, w, h, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function commandPaletteProps(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp",
    open: true,
    query: "",
    sources: [
      {
        id: "s",
        name: "Source",
        getItems: () => [],
      },
    ],
    selectedIndex: 0,
    onQueryChange: () => {},
    onSelect: () => {},
    onClose: () => {},
    ...overrides,
  };
}

describe("layout overlay constraints", () => {
  test("modal default width uses 70% of viewport", () => {
    const out = mustLayout(
      ui.modal({
        id: "m1",
        title: "T",
        content: ui.text("Body"),
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.w, 70);
  });

  test("modal width override is respected", () => {
    const out = mustLayout(
      ui.modal({
        id: "m2",
        title: "T",
        width: 30,
        content: ui.text("Body"),
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.w, 30);
  });

  test("modal height override is respected", () => {
    const out = mustLayout(
      ui.modal({
        id: "m3",
        title: "T",
        height: 10,
        content: ui.text("Body"),
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.h, 10);
  });

  test("modal minWidth/minHeight override defaults", () => {
    const out = mustLayout(
      ui.modal({
        id: "m-min",
        title: "T",
        minWidth: 80,
        minHeight: 30,
        content: ui.text("Body"),
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.w, 80);
    assert.strictEqual(out.rect.h, 30);
  });

  test("modal min constraints clamp to viewport", () => {
    const out = mustLayout(
      ui.modal({
        id: "m-clamp",
        title: "T",
        minWidth: 1000,
        minHeight: 1000,
        content: ui.text("Body"),
      }),
      20,
      8,
    );
    assert.strictEqual(out.rect.w, 18);
    assert.strictEqual(out.rect.h, 6);
  });

  test("commandPalette default width is 60 (clamped to viewport)", () => {
    const out = mustLayout(ui.commandPalette(commandPaletteProps()), 80, 24);
    assert.strictEqual(out.rect.w, 60);
  });

  test("commandPalette width override is respected", () => {
    const out = mustLayout(ui.commandPalette(commandPaletteProps({ width: 40 })), 80, 24);
    assert.strictEqual(out.rect.w, 40);
  });

  test("commandPalette default width clamps to small viewport", () => {
    const out = mustLayout(ui.commandPalette(commandPaletteProps()), 50, 24);
    assert.strictEqual(out.rect.w, 50);
  });

  test("commandPalette vertical origin clamps when viewport is short", () => {
    const out = mustLayout(ui.commandPalette(commandPaletteProps()), 80, 5);
    assert.strictEqual(out.rect.y, 0);
    assert.strictEqual(out.rect.h, 5);
  });

  test("toastContainer default width is 40", () => {
    const out = mustLayout(
      ui.toastContainer({
        toasts: [],
        onDismiss: () => {},
      }),
      100,
      24,
    );
    assert.strictEqual(out.rect.w, 40);
  });

  test("toastContainer width override is respected", () => {
    const out = mustLayout(
      ui.toastContainer({
        toasts: [],
        width: 60,
        onDismiss: () => {},
      }),
      100,
      24,
    );
    assert.strictEqual(out.rect.w, 60);
  });

  test("toastContainer height clamps to viewport", () => {
    const out = mustLayout(
      ui.toastContainer({
        toasts: [],
        maxVisible: 99,
        onDismiss: () => {},
      }),
      100,
      4,
    );
    assert.strictEqual(out.rect.h, 4);
  });

  test("toolApprovalDialog width/height overrides are respected", () => {
    const out = mustLayout(
      ui.toolApprovalDialog({
        id: "ta",
        open: true,
        width: 30,
        height: 10,
        request: {
          toolId: "tool-x",
          toolName: "Tool X",
          riskLevel: "low",
        },
        onAllow: () => {},
        onDeny: () => {},
        onClose: () => {},
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.w, 30);
    assert.strictEqual(out.rect.h, 10);
  });

  test("toolApprovalDialog defaults to 50x15", () => {
    const out = mustLayout(
      ui.toolApprovalDialog({
        id: "ta-default",
        open: true,
        request: {
          toolId: "tool-x",
          toolName: "Tool X",
          riskLevel: "low",
        },
        onAllow: () => {},
        onDeny: () => {},
        onClose: () => {},
      }),
      100,
      40,
    );
    assert.strictEqual(out.rect.w, 50);
    assert.strictEqual(out.rect.h, 15);
  });

  test("toolApprovalDialog defaults clamp to viewport", () => {
    const out = mustLayout(
      ui.toolApprovalDialog({
        id: "ta-clamp",
        open: true,
        request: {
          toolId: "tool-x",
          toolName: "Tool X",
          riskLevel: "low",
        },
        onAllow: () => {},
        onDeny: () => {},
        onClose: () => {},
      }),
      30,
      10,
    );
    assert.strictEqual(out.rect.w, 30);
    assert.strictEqual(out.rect.h, 10);
  });
});
