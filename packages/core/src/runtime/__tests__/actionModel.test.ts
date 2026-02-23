import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { UiEvent } from "../../events.js";
import { ZR_KEY_DOWN, ZR_KEY_ENTER, ZR_KEY_SPACE, ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { TestEventBuilder, type TestZrevEvent } from "../../testing/events.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

type ActionEvent = Extract<UiEvent, Readonly<{ kind: "action" }>>;

async function bootApp(vnode: VNode): Promise<
  Readonly<{
    app: ReturnType<typeof createApp>;
    backend: StubBackend;
    actionEvents: ActionEvent[];
  }>
> {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: {},
  });
  app.view(() => vnode);

  const actionEvents: ActionEvent[] = [];
  app.onEvent((ev) => {
    if (ev.kind === "action") actionEvents.push(ev);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
      }),
    }),
  );
  await flushMicrotasks(20);
  backend.resolveNextFrame();
  await flushMicrotasks(20);

  return Object.freeze({ app, backend, actionEvents });
}

async function pushEvents(backend: StubBackend, events: readonly TestZrevEvent[]): Promise<void> {
  const before = backend.requestedFrames.length;
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
  if (backend.requestedFrames.length > before) {
    backend.resolveNextFrame();
    await flushMicrotasks(20);
  }
}

describe("action model integration", () => {
  test("button press emits action event and still calls onPress", async () => {
    const presses: string[] = [];
    const { app, backend, actionEvents } = await bootApp(
      ui.button({
        id: "btn.save",
        label: "Save",
        onPress: () => presses.push("pressed"),
      }),
    );

    await pushEvents(
      backend,
      new TestEventBuilder().keyDown(ZR_KEY_TAB).keyDown(ZR_KEY_ENTER).events(),
    );

    const ev = actionEvents.find((e) => e.id === "btn.save" && e.action === "press");
    assert.deepEqual(ev, { kind: "action", id: "btn.save", action: "press" });
    assert.deepEqual(presses, ["pressed"]);

    app.dispose();
  });

  test("checkbox toggle emits action event and still calls onChange", async () => {
    const toggles: boolean[] = [];
    const { app, backend, actionEvents } = await bootApp(
      ui.checkbox({
        id: "check.terms",
        label: "Accept terms",
        checked: false,
        onChange: (checked) => toggles.push(checked),
      }),
    );

    await pushEvents(
      backend,
      new TestEventBuilder().keyDown(ZR_KEY_TAB).keyDown(ZR_KEY_SPACE).events(),
    );

    const ev = actionEvents.find(
      (e): e is ActionEvent & Readonly<{ action: "toggle"; checked: boolean; id: "check.terms" }> =>
        e.id === "check.terms" && e.action === "toggle",
    );
    assert.deepEqual(ev, { kind: "action", id: "check.terms", action: "toggle", checked: true });
    assert.deepEqual(toggles, [true]);

    app.dispose();
  });

  test("virtualList select emits action event and still calls onSelect", async () => {
    const selects: string[] = [];
    const { app, backend, actionEvents } = await bootApp(
      ui.virtualList({
        id: "list.users",
        items: ["a", "b", "c", "d"],
        itemHeight: 1,
        renderItem: (item) => ui.text(item),
        onSelect: (item, index) => selects.push(`${item}:${String(index)}`),
      }),
    );

    await pushEvents(
      backend,
      new TestEventBuilder()
        .keyDown(ZR_KEY_TAB)
        .keyDown(ZR_KEY_DOWN)
        .keyDown(ZR_KEY_DOWN)
        .keyDown(ZR_KEY_ENTER)
        .events(),
    );

    const ev = actionEvents.find(
      (e): e is ActionEvent & Readonly<{ action: "select"; index: number; id: "list.users" }> =>
        e.id === "list.users" && e.action === "select",
    );
    assert.deepEqual(ev && { kind: ev.kind, id: ev.id, action: ev.action, index: ev.index }, {
      kind: "action",
      id: "list.users",
      action: "select",
      index: 2,
    });
    assert.deepEqual(selects, ["c:2"]);

    app.dispose();
  });

  test("table rowPress emits action event and still calls onRowPress", async () => {
    const pressed: string[] = [];
    const { app, backend, actionEvents } = await bootApp(
      ui.table({
        id: "table.logs",
        columns: [{ key: "id", header: "ID", flex: 1 }],
        data: [{ id: "r0" }, { id: "r1" }],
        getRowKey: (row) => row.id,
        onRowPress: (row, index) => pressed.push(`${row.id}:${String(index)}`),
      }),
    );

    await pushEvents(
      backend,
      new TestEventBuilder().keyDown(ZR_KEY_TAB).keyDown(ZR_KEY_ENTER).events(),
    );

    const ev = actionEvents.find(
      (
        e,
      ): e is ActionEvent & Readonly<{ action: "rowPress"; rowIndex: number; id: "table.logs" }> =>
        e.id === "table.logs" && e.action === "rowPress",
    );
    assert.deepEqual(ev && { kind: ev.kind, id: ev.id, action: ev.action, rowIndex: ev.rowIndex }, {
      kind: "action",
      id: "table.logs",
      action: "rowPress",
      rowIndex: 0,
    });
    assert.deepEqual(pressed, ["r0:0"]);

    app.dispose();
  });

  test("radioGroup change emits action event and still calls onChange", async () => {
    const changes: string[] = [];
    const { app, backend, actionEvents } = await bootApp(
      ui.radioGroup({
        id: "radio.mode",
        options: [
          { value: "opt1", label: "Option 1" },
          { value: "opt2", label: "Option 2" },
        ],
        value: "opt1",
        onChange: (value) => changes.push(String(value)),
      }),
    );

    await pushEvents(
      backend,
      new TestEventBuilder().keyDown(ZR_KEY_TAB).keyDown(ZR_KEY_DOWN).events(),
    );

    const ev = actionEvents.find(
      (e): e is ActionEvent & Readonly<{ action: "change"; value: unknown; id: "radio.mode" }> =>
        e.id === "radio.mode" && e.action === "change",
    );
    assert.deepEqual(ev && { kind: ev.kind, id: ev.id, action: ev.action, value: ev.value }, {
      kind: "action",
      id: "radio.mode",
      action: "change",
      value: "opt2",
    });
    assert.deepEqual(changes, ["opt2"]);

    app.dispose();
  });
});
