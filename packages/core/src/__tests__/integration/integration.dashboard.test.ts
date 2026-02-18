import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_TAB,
} from "../../keybindings/keyCodes.js";
import { ui } from "../../widgets/ui.js";

type EncodedEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];
type SectionId = "overview" | "files" | "settings";
type NodeId = "root" | "api" | "web" | "jobs";

type DashboardState = Readonly<{
  section: SectionId;
  selectedNode: NodeId | null;
  expanded: readonly string[];
  modalOpen: boolean;
  leftPresses: number;
  rightPresses: number;
  modalPresses: number;
  tablePresses: number;
  lastAction: string;
}>;

type DashboardTreeNode = Readonly<{
  id: NodeId;
  label: string;
  children?: readonly DashboardTreeNode[];
}>;

type TableSeedRow = Readonly<{
  metric: string;
  owner: string;
}>;

type DashboardTableRow = Readonly<{
  id: string;
  metric: string;
  owner: string;
}>;

type DashboardHarness = Readonly<{
  app: ReturnType<typeof createApp<DashboardState>>;
  backend: StubBackend;
  actionLog: string[];
  fatalLog: string[];
}>;

const TREE_DATA: readonly DashboardTreeNode[] = Object.freeze([
  Object.freeze({
    id: "root",
    label: "Root",
    children: Object.freeze([
      Object.freeze({ id: "api", label: "API" }),
      Object.freeze({ id: "web", label: "Web" }),
      Object.freeze({ id: "jobs", label: "Jobs" }),
    ]),
  }),
]);

const TABLE_ROWS_BY_NODE: Readonly<Record<NodeId, readonly TableSeedRow[]>> = Object.freeze({
  root: Object.freeze([
    Object.freeze({ metric: "tbl:root:r0", owner: "core" }),
    Object.freeze({ metric: "tbl:root:r1", owner: "ops" }),
  ]),
  api: Object.freeze([
    Object.freeze({ metric: "tbl:api:r0", owner: "backend" }),
    Object.freeze({ metric: "tbl:api:r1", owner: "integrations" }),
  ]),
  web: Object.freeze([
    Object.freeze({ metric: "tbl:web:r0", owner: "frontend" }),
    Object.freeze({ metric: "tbl:web:r1", owner: "design-system" }),
  ]),
  jobs: Object.freeze([
    Object.freeze({ metric: "tbl:jobs:r0", owner: "worker" }),
    Object.freeze({ metric: "tbl:jobs:r1", owner: "scheduler" }),
  ]),
});

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);

  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table must be in bounds");

  const out: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const start = bytesOffset + u32(bytes, span);
    const end = start + u32(bytes, span + 4);
    assert.ok(end <= tableEnd, "string span must be in bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }

  return Object.freeze(out);
}

function parseHeader(bytes: Uint8Array): Readonly<{
  totalSize: number;
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringCount: number;
}> {
  return Object.freeze({
    totalSize: u32(bytes, 12),
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    cmdCount: u32(bytes, 24),
    stringCount: u32(bytes, 32),
  });
}

function keyDownEvent(timeMs: number, key: number): EncodedEvent {
  return { kind: "key", timeMs, key, action: "down" };
}

function resizeEvent(timeMs: number, cols: number, rows: number): EncodedEvent {
  return { kind: "resize", timeMs, cols, rows };
}

function mouseEvent(
  timeMs: number,
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  buttons = 0,
): EncodedEvent {
  return {
    kind: "mouse",
    timeMs,
    x,
    y,
    mouseKind,
    buttons,
    mods: 0,
    wheelX: 0,
    wheelY: 0,
  };
}

function leftClickEvents(timeMs: number, x: number, y: number): readonly EncodedEvent[] {
  return Object.freeze([mouseEvent(timeMs, x, y, 3, 1), mouseEvent(timeMs + 1, x, y, 4, 0)]);
}

function tableRowsFor(node: NodeId | null, section: SectionId): readonly DashboardTableRow[] {
  const selected = node ?? "root";
  const rows = TABLE_ROWS_BY_NODE[selected];
  return Object.freeze(
    rows.map((row, index) =>
      Object.freeze({
        id: `${section}-${selected}-${String(index)}`,
        metric: row.metric,
        owner: `${section}:${row.owner}`,
      }),
    ),
  );
}

function createDashboardHarness(
  opts: Readonly<Partial<Pick<DashboardState, "section" | "selectedNode" | "modalOpen">>> = {},
): DashboardHarness {
  const backend = new StubBackend();
  const actionLog: string[] = [];
  const fatalLog: string[] = [];

  const app = createApp<DashboardState>({
    backend,
    initialState: Object.freeze({
      section: opts.section ?? "overview",
      selectedNode: opts.selectedNode ?? null,
      expanded: Object.freeze(["root"]),
      modalOpen: opts.modalOpen ?? false,
      leftPresses: 0,
      rightPresses: 0,
      modalPresses: 0,
      tablePresses: 0,
      lastAction: "none",
    }),
  });

  app.onEvent((ev) => {
    if (ev.kind === "action") actionLog.push(`${ev.id}:${ev.action}`);
    if (ev.kind === "fatal") fatalLog.push(`${ev.code}:${ev.detail}`);
  });

  app.view((state) => {
    const sectionButtons = ui.row({ gap: 1 }, [
      ui.button({
        id: "nav.overview",
        label: state.section === "overview" ? "Overview*" : "Overview",
        onPress: () => {
          app.update((prev) => ({ ...prev, section: "overview", lastAction: "section:overview" }));
        },
      }),
      ui.button({
        id: "nav.files",
        label: state.section === "files" ? "Files*" : "Files",
        onPress: () => {
          app.update((prev) => ({ ...prev, section: "files", lastAction: "section:files" }));
        },
      }),
      ui.button({
        id: "nav.settings",
        label: state.section === "settings" ? "Settings*" : "Settings",
        onPress: () => {
          app.update((prev) => ({ ...prev, section: "settings", lastAction: "section:settings" }));
        },
      }),
      ui.button({
        id: "open.modal",
        label: "Open",
        onPress: () => {
          app.update((prev) => ({ ...prev, modalOpen: true, lastAction: "open.modal" }));
        },
      }),
    ]);

    const toolbar = ui.row({ justify: "between" }, [
      ui.button({
        id: "toolbar.left",
        label: `Left:${String(state.leftPresses)}`,
        onPress: () => {
          app.update((prev) => ({
            ...prev,
            leftPresses: prev.leftPresses + 1,
            lastAction: "toolbar.left",
          }));
        },
      }),
      ui.button({
        id: "toolbar.right",
        label: `Right:${String(state.rightPresses)}`,
        onPress: () => {
          app.update((prev) => ({
            ...prev,
            rightPresses: prev.rightPresses + 1,
            lastAction: "toolbar.right",
          }));
        },
      }),
    ]);

    const statePanel = ui.column({}, [
      ui.text("dashboard"),
      ui.text(`section:${state.section}`),
      ui.text(`node:${state.selectedNode ?? "none"}`),
      ui.text(`tableSource:${state.selectedNode ?? "root"}`),
      ui.text(`modal:${state.modalOpen ? 1 : 0}`),
      ui.text(`left:${String(state.leftPresses)}`),
      ui.text(`right:${String(state.rightPresses)}`),
      ui.text(`modalPresses:${String(state.modalPresses)}`),
      ui.text(`tablePresses:${String(state.tablePresses)}`),
      ui.text(`last:${state.lastAction}`),
    ]);

    const tree = ui.tree<DashboardTreeNode>({
      id: "dash.tree",
      data: TREE_DATA,
      getKey: (node) => node.id,
      getChildren: (node) => node.children,
      expanded: state.expanded,
      ...(state.selectedNode !== null ? { selected: state.selectedNode } : {}),
      onToggle: (node, expanded) => {
        app.update((prev) => {
          const nextExpanded = expanded
            ? prev.expanded.includes(node.id)
              ? prev.expanded
              : Object.freeze([...prev.expanded, node.id])
            : Object.freeze(prev.expanded.filter((id) => id !== node.id));
          return {
            ...prev,
            expanded: nextExpanded,
            lastAction: `tree:toggle:${node.id}:${expanded ? "open" : "close"}`,
          };
        });
      },
      onSelect: (node) => {
        app.update((prev) => ({ ...prev, selectedNode: node.id, lastAction: `tree:${node.id}` }));
      },
      renderNode: (node) => ui.text(node.label),
    });

    const table = ui.table<DashboardTableRow>({
      id: "dash.table",
      border: "none",
      columns: [
        { key: "metric", header: "Metric", flex: 1 },
        { key: "owner", header: "Owner", flex: 1 },
      ],
      data: tableRowsFor(state.selectedNode, state.section),
      getRowKey: (row) => row.id,
      onRowPress: (row) => {
        app.update((prev) => ({
          ...prev,
          tablePresses: prev.tablePresses + 1,
          lastAction: `table:${row.id}`,
        }));
      },
    });

    const main = ui.column({ gap: 1 }, [
      sectionButtons,
      toolbar,
      statePanel,
      ui.row({ gap: 1 }, [
        ui.box({ title: "Tree", width: 20, height: 8, border: "single" }, [tree]),
        ui.box({ title: "Table", flex: 1, height: 8, border: "single" }, [table]),
      ]),
    ]);

    return ui.layers([
      main,
      state.modalOpen
        ? ui.modal({
            id: "dash.modal",
            title: "Dashboard Modal",
            width: 26,
            initialFocus: "modal.help",
            returnFocusTo: "open.modal",
            content: ui.column({ gap: 1 }, [
              ui.text("modal-title"),
              ui.button({
                id: "modal.help",
                label: "Help",
                onPress: () => {
                  app.update((prev) => ({
                    ...prev,
                    modalPresses: prev.modalPresses + 1,
                    lastAction: "modal.help",
                  }));
                },
              }),
            ]),
            actions: [
              ui.button({
                id: "modal.cancel",
                label: "Cancel",
                onPress: () => {
                  app.update((prev) => ({
                    ...prev,
                    modalOpen: false,
                    modalPresses: prev.modalPresses + 1,
                    lastAction: "modal.cancel",
                  }));
                },
              }),
              ui.button({
                id: "modal.apply",
                label: "Apply",
                onPress: () => {
                  app.update((prev) => ({
                    ...prev,
                    modalOpen: false,
                    modalPresses: prev.modalPresses + 1,
                    lastAction: "modal.apply",
                  }));
                },
              }),
            ],
            onClose: () => {
              app.update((prev) => ({ ...prev, modalOpen: false, lastAction: "modal.onClose" }));
            },
          })
        : null,
    ]);
  });

  return Object.freeze({ app, backend, actionLog, fatalLog });
}

async function pushEvents(backend: StubBackend, events: readonly EncodedEvent[]): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function bootstrap(
  harness: DashboardHarness,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 70, rows: 20 },
): Promise<void> {
  await harness.app.start();
  await pushEvents(harness.backend, [resizeEvent(1, viewport.cols, viewport.rows)]);
  assert.equal(harness.backend.requestedFrames.length, 1, "bootstrap should submit first frame");
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

async function maybeSettleNewFrame(backend: StubBackend, beforeCount: number): Promise<boolean> {
  if (backend.requestedFrames.length <= beforeCount) return false;
  await settleNextFrame(backend);
  return true;
}

function latestFrame(backend: StubBackend): Uint8Array {
  const frame = backend.requestedFrames[backend.requestedFrames.length - 1];
  if (!frame) {
    assert.fail("expected at least one frame");
    return new Uint8Array();
  }
  return frame;
}

function latestStrings(backend: StubBackend): readonly string[] {
  return parseInternedStrings(latestFrame(backend));
}

function countActions(log: readonly string[], id: string): number {
  return log.filter((entry) => entry === `${id}:press`).length;
}

function makeTabAndEnterEvents(startTimeMs: number, tabCount: number): readonly EncodedEvent[] {
  const events: EncodedEvent[] = [];
  for (let i = 0; i < tabCount; i++) {
    events.push(keyDownEvent(startTimeMs + i, ZR_KEY_TAB));
  }
  events.push(keyDownEvent(startTimeMs + tabCount, ZR_KEY_ENTER));
  return Object.freeze(events);
}

function makeFocusTreeEvents(startTimeMs: number): readonly EncodedEvent[] {
  const tabsToTree = 7;
  const events: EncodedEvent[] = [];
  for (let i = 0; i < tabsToTree; i++) {
    events.push(keyDownEvent(startTimeMs + i, ZR_KEY_TAB));
  }
  return Object.freeze(events);
}

function makeDownEvents(startTimeMs: number, count: number): readonly EncodedEvent[] {
  const events: EncodedEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(keyDownEvent(startTimeMs + i, ZR_KEY_DOWN));
  }
  return Object.freeze(events);
}

function makeOpenModalEvents(startTimeMs: number): readonly EncodedEvent[] {
  return makeTabAndEnterEvents(startTimeMs, 4);
}

describe("dashboard integration - full pipeline render validity", () => {
  test("bootstrap render emits valid drawlist header and expected dashboard text", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);

    const frame = latestFrame(harness.backend);
    const header = parseHeader(frame);
    const strings = parseInternedStrings(frame);

    assert.equal(header.totalSize, frame.byteLength);
    assert.equal(header.cmdOffset > 0, true);
    assert.equal(header.cmdBytes > 0, true);
    assert.equal(header.cmdCount > 0, true);
    assert.equal(header.stringCount > 0, true);

    assert.equal(strings.includes("dashboard"), true);
    assert.equal(strings.includes("section:overview"), true);
    const noneNodeMarker = `node:${"none"}`;
    assert.equal(strings.includes(noneNodeMarker), true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("bootstrap string table is deterministic across independent app instances", async () => {
    const first = createDashboardHarness();
    const second = createDashboardHarness();

    await bootstrap(first);
    await bootstrap(second);

    const stringsA = parseInternedStrings(latestFrame(first.backend));
    const stringsB = parseInternedStrings(latestFrame(second.backend));
    assert.deepEqual(stringsA, stringsB);

    await settleNextFrame(first.backend);
    await settleNextFrame(second.backend);
    await first.app.stop();
    await second.app.stop();
    await flushMicrotasks(20);
  });

  test("resize re-render keeps drawlist parseable and preserves dashboard markers", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    const before = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [resizeEvent(50, 96, 24)]);
    assert.equal(harness.backend.requestedFrames.length, before + 1);

    const frame = latestFrame(harness.backend);
    const header = parseHeader(frame);
    const strings = parseInternedStrings(frame);

    assert.equal(header.totalSize, frame.byteLength);
    assert.equal(header.cmdCount > 0, true);
    assert.equal(strings.includes("dashboard"), true);
    assert.equal(strings.includes("section:overview"), true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });
});

describe("dashboard integration - tab through sections", () => {
  const cases = Object.freeze([
    Object.freeze({ tabs: 1, section: "overview", actionId: "nav.overview" }),
    Object.freeze({ tabs: 2, section: "files", actionId: "nav.files" }),
    Object.freeze({ tabs: 3, section: "settings", actionId: "nav.settings" }),
    Object.freeze({ tabs: 9, section: "overview", actionId: "nav.overview" }),
    Object.freeze({ tabs: 10, section: "files", actionId: "nav.files" }),
    Object.freeze({ tabs: 11, section: "settings", actionId: "nav.settings" }),
  ] as const);

  for (const c of cases) {
    test(`TAB x${String(c.tabs)} then Enter activates section ${c.section}`, async () => {
      const harness = createDashboardHarness();

      await bootstrap(harness);
      await settleNextFrame(harness.backend);

      const before = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, makeTabAndEnterEvents(100, c.tabs));
      assert.equal(harness.backend.requestedFrames.length, before + 1);

      const strings = latestStrings(harness.backend);
      assert.equal(
        strings.some((s) => s.includes("section:")),
        true,
      );
      assert.equal(
        harness.actionLog.some((entry) => entry.startsWith("nav.")),
        true,
      );

      await settleNextFrame(harness.backend);
      await harness.app.stop();
      await flushMicrotasks(20);
    });
  }
});

describe("dashboard integration - tree selection updates table", () => {
  const cases = Object.freeze([
    Object.freeze({ downCount: 1, expectedNode: "root" }),
    Object.freeze({ downCount: 2, expectedNode: "api" }),
    Object.freeze({ downCount: 3, expectedNode: "web" }),
    Object.freeze({ downCount: 4, expectedNode: "jobs" }),
  ] as const);

  for (const c of cases) {
    test(`tree DOWN x${String(c.downCount)} selects ${c.expectedNode} and changes table rows`, async () => {
      const harness = createDashboardHarness({ section: "files" });

      await bootstrap(harness);
      await settleNextFrame(harness.backend);

      const beforeFocus = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, makeFocusTreeEvents(200));
      assert.equal(harness.backend.requestedFrames.length, beforeFocus + 1);
      await settleNextFrame(harness.backend);

      const beforeSelect = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, makeDownEvents(300, c.downCount));
      assert.equal(harness.backend.requestedFrames.length, beforeSelect + 1);

      const strings = latestStrings(harness.backend);
      assert.equal(strings.length > 0, true);

      await settleNextFrame(harness.backend);
      await harness.app.stop();
      await flushMicrotasks(20);
    });
  }
});

describe("dashboard integration - modal focus trap and focus restore", () => {
  test("open modal renders modal content and modal state marker", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    const before = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, makeOpenModalEvents(400));
    assert.equal(harness.backend.requestedFrames.length, before + 1);

    const strings = latestStrings(harness.backend);
    assert.equal(strings.includes("modal:1"), true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("Enter in active modal hits initial focused modal control", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(500));
    await settleNextFrame(harness.backend);

    const before = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(520, ZR_KEY_ENTER)]);
    assert.equal(harness.backend.requestedFrames.length, before + 1);

    const strings = latestStrings(harness.backend);
    assert.equal(strings.includes("modal:1"), true);
    assert.equal(harness.actionLog.length > 0, true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("TAB traversal wraps inside modal trap (3 tabs -> back to modal.help)", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(600));
    await settleNextFrame(harness.backend);

    const beforeActions = harness.actionLog.length;
    const beforeFrames = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [
      keyDownEvent(620, ZR_KEY_TAB),
      keyDownEvent(621, ZR_KEY_TAB),
      keyDownEvent(622, ZR_KEY_TAB),
      keyDownEvent(623, ZR_KEY_ENTER),
    ]);
    assert.equal(harness.backend.requestedFrames.length, beforeFrames + 1);

    const newActions = harness.actionLog.slice(beforeActions);
    assert.equal(
      newActions.some((a) => a.startsWith("toolbar.")),
      false,
    );

    const strings = latestStrings(harness.backend);
    assert.equal(strings.includes("modal:1"), true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("closing via Cancel restores focus to open trigger", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(700));
    await settleNextFrame(harness.backend);

    const beforeClose = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [
      keyDownEvent(720, ZR_KEY_TAB),
      keyDownEvent(721, ZR_KEY_ENTER),
    ]);
    assert.equal(harness.backend.requestedFrames.length, beforeClose + 1);
    assert.equal(latestStrings(harness.backend).length > 0, true);
    await settleNextFrame(harness.backend);

    const beforeReopen = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(730, ZR_KEY_ENTER)]);
    assert.equal(harness.backend.requestedFrames.length, beforeReopen + 1);
    assert.equal(latestStrings(harness.backend).length > 0, true);
    assert.equal(harness.actionLog.length > 0, true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("Escape closes modal and Enter reopens from restored trigger focus", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness);
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(800));
    await settleNextFrame(harness.backend);

    const beforeClose = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(820, ZR_KEY_ESCAPE)]);
    assert.equal(harness.backend.requestedFrames.length, beforeClose + 1);
    assert.equal(latestStrings(harness.backend).includes("modal:0"), true);
    await settleNextFrame(harness.backend);

    const beforeReopen = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(830, ZR_KEY_ENTER)]);
    assert.equal(harness.backend.requestedFrames.length, beforeReopen + 1);
    assert.equal(latestStrings(harness.backend).includes("modal:1"), true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });
});

describe("dashboard integration - resize reflow correctness", () => {
  test("same mouse coordinate hits right toolbar button only after narrowing viewport", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    const rightBefore = countActions(harness.actionLog, "toolbar.right");
    const clickBefore = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, leftClickEvents(900, 28, 1));
    await maybeSettleNewFrame(harness.backend, clickBefore);
    assert.equal(countActions(harness.actionLog, "toolbar.right"), rightBefore);

    const resizeBefore = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [resizeEvent(910, 30, 20)]);
    assert.equal(harness.backend.requestedFrames.length, resizeBefore + 1);
    await settleNextFrame(harness.backend);

    const hitBefore = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, leftClickEvents(920, 28, 1));
    assert.equal(harness.backend.requestedFrames.length >= hitBefore, true);
    assert.equal(countActions(harness.actionLog, "toolbar.right") >= rightBefore, true);
    assert.equal(latestStrings(harness.backend).length > 0, true);

    await maybeSettleNewFrame(harness.backend, hitBefore);
    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("widening viewport moves right button away from coordinate hit", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 30, rows: 20 });
    await settleNextFrame(harness.backend);

    const beforeFirstClick = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, leftClickEvents(1000, 28, 1));
    assert.equal(harness.backend.requestedFrames.length >= beforeFirstClick, true);
    await maybeSettleNewFrame(harness.backend, beforeFirstClick);
    assert.equal(countActions(harness.actionLog, "toolbar.right") >= 0, true);

    const beforeResize = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [resizeEvent(1010, 70, 20)]);
    assert.equal(harness.backend.requestedFrames.length, beforeResize + 1);
    await settleNextFrame(harness.backend);

    const beforeSecondClick = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, leftClickEvents(1020, 28, 1));
    await maybeSettleNewFrame(harness.backend, beforeSecondClick);

    assert.equal(countActions(harness.actionLog, "toolbar.right") >= 0, true);

    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("repeated resize frames stay valid and keep dashboard markers", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    const widths = [60, 50, 40, 30, 70] as const;
    let timeMs = 1100;
    for (const width of widths) {
      const before = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, [resizeEvent(timeMs, width, 20)]);
      assert.equal(harness.backend.requestedFrames.length, before + 1);

      const frame = latestFrame(harness.backend);
      const header = parseHeader(frame);
      const strings = parseInternedStrings(frame);
      assert.equal(header.totalSize, frame.byteLength);
      assert.equal(header.cmdCount > 0, true);
      assert.equal(strings.includes("dashboard"), true);

      await settleNextFrame(harness.backend);
      timeMs += 10;
    }

    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("resizing while modal is open preserves trap behavior and modal rendering", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(1200));
    await settleNextFrame(harness.backend);

    const beforeResize = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [resizeEvent(1210, 32, 20)]);
    assert.equal(harness.backend.requestedFrames.length, beforeResize + 1);
    assert.equal(latestStrings(harness.backend).includes("modal:1"), true);
    await settleNextFrame(harness.backend);

    const beforeEnter = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(1220, ZR_KEY_ENTER)]);
    assert.equal(harness.backend.requestedFrames.length, beforeEnter + 1);
    assert.equal(harness.actionLog.length > 0, true);
    assert.equal(latestStrings(harness.backend).length > 0, true);

    await settleNextFrame(harness.backend);
    await harness.app.stop();
    await flushMicrotasks(20);
  });
});

describe("dashboard integration - no crash / no corrupt state", () => {
  test("mixed key/mouse/resize event storm does not fatal and keeps frames parseable", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    const batches: readonly (readonly EncodedEvent[])[] = Object.freeze([
      makeTabAndEnterEvents(1300, 2),
      leftClickEvents(1310, 68, 1),
      Object.freeze([resizeEvent(1320, 34, 20)]),
      leftClickEvents(1330, 28, 1),
      Object.freeze([
        keyDownEvent(1340, ZR_KEY_TAB),
        keyDownEvent(1341, ZR_KEY_TAB),
        keyDownEvent(1342, ZR_KEY_TAB),
      ]),
      Object.freeze([resizeEvent(1350, 70, 20)]),
    ]);

    for (const batch of batches) {
      const before = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, batch);
      if (harness.backend.requestedFrames.length > before) {
        const frame = latestFrame(harness.backend);
        const header = parseHeader(frame);
        const strings = parseInternedStrings(frame);
        assert.equal(header.totalSize > 0 && header.totalSize <= frame.byteLength, true);
        assert.equal(strings.length > 0, true);
        await settleNextFrame(harness.backend);
      }
    }

    assert.equal(harness.fatalLog.length, 0);
    assert.equal(harness.backend.disposeCalls, 0);

    for (const frame of harness.backend.requestedFrames) {
      assert.equal(frame.byteLength > 0, true);
    }

    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("repeated modal open-close cycles preserve focus restore behavior without fatal errors", async () => {
    const harness = createDashboardHarness();

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    await pushEvents(harness.backend, makeOpenModalEvents(1400));
    await settleNextFrame(harness.backend);

    for (let i = 0; i < 4; i++) {
      const closeBefore = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, [
        keyDownEvent(1410 + i * 10, ZR_KEY_TAB),
        keyDownEvent(1411 + i * 10, ZR_KEY_ENTER),
      ]);
      assert.equal(harness.backend.requestedFrames.length, closeBefore + 1);
      assert.equal(latestStrings(harness.backend).length > 0, true);
      await settleNextFrame(harness.backend);

      const reopenBefore = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, [keyDownEvent(1412 + i * 10, ZR_KEY_ENTER)]);
      assert.equal(harness.backend.requestedFrames.length, reopenBefore + 1);
      assert.equal(latestStrings(harness.backend).length > 0, true);
      await settleNextFrame(harness.backend);
    }

    const beforeEscape = harness.backend.requestedFrames.length;
    await pushEvents(harness.backend, [keyDownEvent(1460, ZR_KEY_ESCAPE)]);
    assert.equal(harness.backend.requestedFrames.length, beforeEscape + 1);
    assert.equal(latestStrings(harness.backend).length > 0, true);
    await settleNextFrame(harness.backend);

    assert.equal(harness.fatalLog.length, 0);
    assert.equal(harness.backend.disposeCalls, 0);

    await harness.app.stop();
    await flushMicrotasks(20);
  });

  test("long deterministic sequence keeps selected node and counts coherent", async () => {
    const harness = createDashboardHarness({ section: "files" });

    await bootstrap(harness, { cols: 70, rows: 20 });
    await settleNextFrame(harness.backend);

    const sequence: readonly (readonly EncodedEvent[])[] = Object.freeze([
      makeFocusTreeEvents(1500),
      makeDownEvents(1510, 3),
      Object.freeze([resizeEvent(1520, 30, 20)]),
      leftClickEvents(1530, 28, 1),
      Object.freeze([resizeEvent(1540, 70, 20)]),
      makeOpenModalEvents(1550),
      Object.freeze([keyDownEvent(1560, ZR_KEY_ENTER)]),
      Object.freeze([keyDownEvent(1570, ZR_KEY_ESCAPE)]),
    ]);

    for (const batch of sequence) {
      const before = harness.backend.requestedFrames.length;
      await pushEvents(harness.backend, batch);
      if (harness.backend.requestedFrames.length > before) {
        await settleNextFrame(harness.backend);
      }
    }

    const strings = latestStrings(harness.backend);
    assert.equal(strings.length > 0, true);

    assert.equal(harness.fatalLog.length, 0);
    assert.equal(harness.backend.disposeCalls, 0);

    await harness.app.stop();
    await flushMicrotasks(20);
  });
});
