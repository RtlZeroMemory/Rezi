import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { RuntimeBreadcrumbSnapshot } from "../../app/runtimeBreadcrumbs.js";
import type { App } from "../../index.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_TAB,
  ZR_MOD_CTRL,
  ZR_MOD_SHIFT,
  charToKeyCode,
} from "../../keybindings/keyCodes.js";
import type { CommandItem, CommandSource, FileNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

type EncodedEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];

const FILE_CONTENTS = Object.freeze({
  "/README.md": Object.freeze(["# Workspace Readme", "This file opens on boot."]),
  "/src/app.ts": Object.freeze([
    "export const appReady = true;",
    "export function run() {",
    "  return 42;",
    "}",
  ]),
  "/src/utils.ts": Object.freeze(["export const sum = (a: number, b: number) => a + b;"]),
  "/docs/guide.md": Object.freeze(["## Guide", "Use Ctrl+P to open files quickly."]),
} as const);

type FilePath = keyof typeof FILE_CONTENTS;

const FILE_PATHS: readonly FilePath[] = Object.freeze(Object.keys(FILE_CONTENTS) as FilePath[]);

const FILE_TREE: FileNode = Object.freeze({
  name: "workspace",
  path: "/",
  type: "directory",
  children: Object.freeze([
    Object.freeze({
      name: "src",
      path: "/src",
      type: "directory",
      children: Object.freeze([
        Object.freeze({ name: "app.ts", path: "/src/app.ts", type: "file" }),
        Object.freeze({ name: "utils.ts", path: "/src/utils.ts", type: "file" }),
      ]),
    }),
    Object.freeze({
      name: "docs",
      path: "/docs",
      type: "directory",
      children: Object.freeze([
        Object.freeze({ name: "guide.md", path: "/docs/guide.md", type: "file" }),
      ]),
    }),
    Object.freeze({ name: "README.md", path: "/README.md", type: "file" }),
  ]),
});

type Cursor = Readonly<{ line: number; column: number }>;
type Selection = Readonly<{ anchor: Cursor; active: Cursor }>;

type EditorModel = Readonly<{
  lines: readonly string[];
  cursor: Cursor;
  selection: Selection | null;
  scrollTop: number;
  scrollLeft: number;
}>;

type PaletteCommandId = "close-active-tab" | "open-readme-tab" | "open-app-tab";

type PaletteData =
  | Readonly<{ kind: "file"; path: FilePath }>
  | Readonly<{ kind: "command"; id: PaletteCommandId }>;

type FileManagerState = Readonly<{
  expanded: readonly string[];
  selectedPath: string | null;
  openTabs: readonly FilePath[];
  activeTab: FilePath | null;
  editors: Readonly<Record<FilePath, EditorModel>>;
  paletteOpen: boolean;
  paletteQuery: string;
  paletteSelectedIndex: number;
}>;

const EMPTY_EDITOR_MODEL: EditorModel = Object.freeze({
  lines: Object.freeze(["// no file open"]),
  cursor: Object.freeze({ line: 0, column: 0 }),
  selection: null,
  scrollTop: 0,
  scrollLeft: 0,
});

const FILE_SOURCE_ITEMS: readonly CommandItem[] = Object.freeze(
  FILE_PATHS.map((path) =>
    Object.freeze({
      id: `file:${path}`,
      label: basename(path),
      description: path,
      sourceId: "files",
      data: Object.freeze({ kind: "file", path } as const),
    }),
  ),
);

const COMMAND_SOURCE_ITEMS: readonly CommandItem[] = Object.freeze([
  Object.freeze({
    id: "cmd:close-active-tab",
    label: "Close active tab",
    sourceId: "commands",
    data: Object.freeze({ kind: "command", id: "close-active-tab" } as const),
  }),
  Object.freeze({
    id: "cmd:open-readme",
    label: "Open README tab",
    sourceId: "commands",
    data: Object.freeze({ kind: "command", id: "open-readme-tab" } as const),
  }),
  Object.freeze({
    id: "cmd:open-app",
    label: "Open app.ts tab",
    sourceId: "commands",
    data: Object.freeze({ kind: "command", id: "open-app-tab" } as const),
  }),
]);

const PALETTE_SOURCES: readonly CommandSource[] = Object.freeze([
  Object.freeze({
    id: "files",
    name: "Files",
    getItems: () => FILE_SOURCE_ITEMS,
  }),
  Object.freeze({
    id: "commands",
    name: "Commands",
    prefix: ">",
    getItems: () => COMMAND_SOURCE_ITEMS,
  }),
]);

type Harness = {
  app: App<FileManagerState>;
  backend: StubBackend;
  getState: () => FileManagerState;
  renderSnapshots: RuntimeBreadcrumbSnapshot[];
  fatalCodes: string[];
  actionEvents: Array<Readonly<{ id: string; action: string }>>;
  ackedFrames: number;
  nextTimeMs: number;
};

function isFilePath(path: string): path is FilePath {
  return Object.prototype.hasOwnProperty.call(FILE_CONTENTS, path);
}

function basename(path: string): string {
  const parts = path.split("/").filter((segment) => segment.length > 0);
  const last = parts[parts.length - 1];
  return last ?? path;
}

function normalizeExpandedPaths(paths: Iterable<string>): readonly string[] {
  return Object.freeze(
    Array.from(new Set(paths)).sort((a, b) =>
      a.length === b.length ? a.localeCompare(b) : a.length - b.length,
    ),
  );
}

function parentDirectories(path: string): readonly string[] {
  const parts = path.split("/").filter((segment) => segment.length > 0);
  if (parts.length === 0) return Object.freeze(["/"]);

  const out: string[] = ["/"];
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    if (!segment) continue;
    acc += `/${segment}`;
    out.push(acc);
  }
  return Object.freeze(out);
}

function ensureExpandedForFile(expanded: readonly string[], path: FilePath): readonly string[] {
  return normalizeExpandedPaths([...expanded, ...parentDirectories(path)]);
}

function createEditorModel(lines: readonly string[]): EditorModel {
  return Object.freeze({
    lines: Object.freeze(lines.slice()),
    cursor: Object.freeze({ line: 0, column: 0 }),
    selection: null,
    scrollTop: 0,
    scrollLeft: 0,
  });
}

function cloneSelection(selection: Selection | null): Selection | null {
  if (selection === null) return null;
  return Object.freeze({
    anchor: Object.freeze({
      line: selection.anchor.line,
      column: selection.anchor.column,
    }),
    active: Object.freeze({
      line: selection.active.line,
      column: selection.active.column,
    }),
  });
}

function createInitialEditors(): Readonly<Record<FilePath, EditorModel>> {
  const next = {} as Record<FilePath, EditorModel>;
  for (const path of FILE_PATHS) {
    next[path] = createEditorModel(FILE_CONTENTS[path]);
  }
  return Object.freeze(next);
}

function createInitialState(): FileManagerState {
  return Object.freeze({
    expanded: Object.freeze(["/"]),
    selectedPath: "/README.md",
    openTabs: Object.freeze(["/README.md"] as FilePath[]),
    activeTab: "/README.md",
    editors: createInitialEditors(),
    paletteOpen: false,
    paletteQuery: "",
    paletteSelectedIndex: 0,
  });
}

function toggleExpandedPath(
  expanded: readonly string[],
  path: string,
  nextExpanded: boolean,
): readonly string[] {
  const next = new Set(expanded);
  if (nextExpanded) next.add(path);
  else next.delete(path);
  return normalizeExpandedPaths(next);
}

function openFileTab(state: FileManagerState, path: FilePath): FileManagerState {
  const nextTabs: readonly FilePath[] = state.openTabs.includes(path)
    ? state.openTabs
    : Object.freeze([...state.openTabs, path] as FilePath[]);

  return Object.freeze({
    ...state,
    expanded: ensureExpandedForFile(state.expanded, path),
    selectedPath: path,
    openTabs: nextTabs,
    activeTab: path,
  });
}

function closeActiveTab(state: FileManagerState): FileManagerState {
  if (state.activeTab === null) return state;

  const active = state.activeTab;
  const activeIndex = state.openTabs.indexOf(active);
  if (activeIndex < 0) return state;

  const nextTabs = Object.freeze(
    state.openTabs.filter((tabPath) => tabPath !== active) as FilePath[],
  );
  const nextActive: FilePath | null = nextTabs[activeIndex] ?? nextTabs[activeIndex - 1] ?? null;

  return Object.freeze({
    ...state,
    openTabs: nextTabs,
    activeTab: nextActive,
    selectedPath: nextActive,
  });
}

function updateActiveEditor(
  state: FileManagerState,
  updater: (current: EditorModel) => EditorModel,
): FileManagerState {
  const active = state.activeTab;
  if (active === null) return state;

  const current = state.editors[active];
  const nextEditor = updater(current);

  return Object.freeze({
    ...state,
    editors: Object.freeze({
      ...state.editors,
      [active]: nextEditor,
    }) as Readonly<Record<FilePath, EditorModel>>,
  });
}

function parsePaletteData(data: unknown): PaletteData | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as { kind?: unknown; path?: unknown; id?: unknown };

  if (
    candidate.kind === "file" &&
    typeof candidate.path === "string" &&
    isFilePath(candidate.path)
  ) {
    return Object.freeze({ kind: "file", path: candidate.path });
  }

  if (
    candidate.kind === "command" &&
    (candidate.id === "close-active-tab" ||
      candidate.id === "open-readme-tab" ||
      candidate.id === "open-app-tab")
  ) {
    return Object.freeze({ kind: "command", id: candidate.id });
  }

  return null;
}

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
  assert.equal(tableEnd <= bytes.byteLength, true);

  const out: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const start = bytesOffset + u32(bytes, span);
    const end = start + u32(bytes, span + 4);
    assert.equal(end <= tableEnd, true);
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return Object.freeze(out);
}

function containsText(strings: readonly string[], needle: string): boolean {
  return strings.some((entry) => entry.includes(needle));
}

function keyCode(char: string): number {
  const code = charToKeyCode(char);
  if (code === null) throw new Error(`Unable to resolve keycode for ${char}`);
  return code;
}

function nextTime(harness: Harness): number {
  const timeMs = harness.nextTimeMs;
  harness.nextTimeMs++;
  return timeMs;
}

function keyDownEvent(harness: Harness, key: number, mods = 0): EncodedEvent {
  return Object.freeze({
    kind: "key",
    timeMs: nextTime(harness),
    key,
    mods,
    action: "down",
  });
}

async function pushEncodedEvents(harness: Harness, events: readonly EncodedEvent[]): Promise<void> {
  harness.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleAllFrames(harness: Harness): Promise<void> {
  let guard = 0;
  while (guard < 120) {
    while (harness.ackedFrames < harness.backend.requestedFrames.length) {
      harness.backend.resolveNextFrame();
      harness.ackedFrames++;
      await flushMicrotasks(20);
      guard++;
      if (guard >= 120) {
        throw new Error("frame settle guard exceeded");
      }
    }

    const frameCountBefore = harness.backend.requestedFrames.length;
    await flushMicrotasks(10);
    if (harness.backend.requestedFrames.length === frameCountBefore) {
      return;
    }
  }

  throw new Error("frame settle guard exceeded");
}

async function startHarness(harness: Harness): Promise<void> {
  await harness.app.start();
  await pushEncodedEvents(
    harness,
    Object.freeze([
      Object.freeze({ kind: "resize", timeMs: nextTime(harness), cols: 120, rows: 36 }),
    ]),
  );
  await settleAllFrames(harness);
}

async function stopHarness(harness: Harness): Promise<void> {
  await settleAllFrames(harness);
  await harness.app.stop();
  await flushMicrotasks(20);
}

function latestFrameStrings(harness: Harness): readonly string[] {
  const lastIndex = harness.backend.requestedFrames.length - 1;
  const frame = harness.backend.requestedFrames[lastIndex];
  assert.notEqual(frame, undefined);
  return parseInternedStrings(frame ?? new Uint8Array());
}

function latestFocusId(harness: Harness): string | null {
  const latest = harness.renderSnapshots[harness.renderSnapshots.length - 1];
  return latest ? latest.focus.focusedId : null;
}

function assertNoFatalEvents(harness: Harness): void {
  assert.deepEqual(harness.fatalCodes, []);
}

async function pressKey(harness: Harness, key: number, mods = 0): Promise<void> {
  await pushEncodedEvents(harness, Object.freeze([keyDownEvent(harness, key, mods)]));
  await settleAllFrames(harness);
}

async function typeText(harness: Harness, text: string): Promise<void> {
  const events: EncodedEvent[] = [];
  for (const char of text) {
    const codepoint = char.codePointAt(0);
    if (codepoint === undefined) continue;
    events.push(
      Object.freeze({
        kind: "text",
        timeMs: nextTime(harness),
        codepoint,
      }),
    );
  }
  if (events.length === 0) return;
  await pushEncodedEvents(harness, Object.freeze(events));
  await settleAllFrames(harness);
}

async function focusTree(harness: Harness): Promise<void> {
  await pressKey(harness, ZR_KEY_TAB);
  await pressKey(harness, ZR_KEY_TAB);
}

async function focusEditor(harness: Harness): Promise<void> {
  await pressKey(harness, ZR_KEY_TAB);
  await pressKey(harness, ZR_KEY_TAB);
  await pressKey(harness, ZR_KEY_TAB);
}

async function selectAppFileFromTree(harness: Harness): Promise<void> {
  await focusTree(harness);
  await pressKey(harness, ZR_KEY_HOME);
  await pressKey(harness, ZR_KEY_DOWN);
  await pressKey(harness, ZR_KEY_RIGHT);
  await pressKey(harness, ZR_KEY_DOWN);
}

async function openPalette(harness: Harness): Promise<void> {
  await pressKey(harness, keyCode("p"), ZR_MOD_CTRL);
}

function createHarness(): Harness {
  const backend = new StubBackend();
  const initialState = createInitialState();
  let latestState = initialState;
  const renderSnapshots: RuntimeBreadcrumbSnapshot[] = [];
  const fatalCodes: string[] = [];
  const actionEvents: Array<Readonly<{ id: string; action: string }>> = [];

  const app = createApp<FileManagerState>({
    backend,
    initialState,
    config: {
      internal_onRender: (metrics) => {
        const breadcrumbs = (
          metrics as Readonly<{ runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot }>
        ).runtimeBreadcrumbs;
        if (breadcrumbs) renderSnapshots.push(breadcrumbs);
      },
    },
  });

  app.onEvent((ev) => {
    if (ev.kind === "fatal") {
      fatalCodes.push(ev.code);
      return;
    }
    if (ev.kind === "action") {
      actionEvents.push(Object.freeze({ id: ev.id, action: ev.action }));
    }
  });

  app.keys({
    "ctrl+p": () => {
      app.update((state) =>
        Object.freeze({
          ...state,
          paletteOpen: true,
          paletteQuery: "",
          paletteSelectedIndex: 0,
        }),
      );
    },
    "ctrl+w": () => {
      app.update((state) => closeActiveTab(state));
    },
  });

  app.view((state) => {
    latestState = state;
    const tabs = state.openTabs.map((path) =>
      ui.button({
        id: `tab:${path}`,
        label: state.activeTab === path ? `* ${basename(path)}` : basename(path),
        onPress: () => {
          app.update((current) =>
            Object.freeze({
              ...current,
              activeTab: path,
              selectedPath: path,
            }),
          );
        },
      }),
    );

    const treeProps: {
      id: string;
      data: FileNode;
      expanded: readonly string[];
      selected?: string;
      onToggle: (node: FileNode, expanded: boolean) => void;
      onSelect: (node: FileNode) => void;
      onActivate: (node: FileNode) => void;
    } = {
      id: "tree",
      data: FILE_TREE,
      expanded: state.expanded,
      onToggle: (node, expanded) => {
        app.update((current) =>
          Object.freeze({
            ...current,
            expanded: toggleExpandedPath(current.expanded, node.path, expanded),
          }),
        );
      },
      onSelect: (node) => {
        app.update((current) => {
          if (node.type === "file" && isFilePath(node.path)) {
            return openFileTab(current, node.path);
          }
          return Object.freeze({
            ...current,
            selectedPath: node.path,
          });
        });
      },
      onActivate: (node) => {
        app.update((current) => {
          if (node.type === "file" && isFilePath(node.path)) {
            return openFileTab(current, node.path);
          }
          if (node.type === "directory") {
            const isExpanded = current.expanded.includes(node.path);
            return Object.freeze({
              ...current,
              expanded: toggleExpandedPath(current.expanded, node.path, !isExpanded),
            });
          }
          return current;
        });
      },
    };

    if (state.selectedPath !== null) {
      treeProps.selected = state.selectedPath;
    }

    const activeEditor =
      state.activeTab === null ? EMPTY_EDITOR_MODEL : state.editors[state.activeTab];

    const editorView = ui.codeEditor({
      id: "editor",
      lines: activeEditor.lines,
      cursor: activeEditor.cursor,
      selection: activeEditor.selection,
      scrollTop: activeEditor.scrollTop,
      scrollLeft: activeEditor.scrollLeft,
      onChange: (lines, cursor) => {
        app.update((current) =>
          updateActiveEditor(current, (editor) =>
            Object.freeze({
              ...editor,
              lines: Object.freeze(lines.slice()),
              cursor: Object.freeze({ line: cursor.line, column: cursor.column }),
            }),
          ),
        );
      },
      onSelectionChange: (selection) => {
        app.update((current) =>
          updateActiveEditor(current, (editor) =>
            Object.freeze({
              ...editor,
              selection: cloneSelection(selection as Selection | null),
            }),
          ),
        );
      },
      onScroll: (scrollTop, scrollLeft) => {
        app.update((current) =>
          updateActiveEditor(current, (editor) =>
            Object.freeze({
              ...editor,
              scrollTop,
              scrollLeft,
            }),
          ),
        );
      },
    });

    const tabsChildren = tabs.length > 0 ? tabs : [ui.text("No open tabs")];

    const base = ui.column({ flex: 1, gap: 1, p: 1 }, [
      ui.text("File Manager"),
      ui.text(`Active tab: ${state.activeTab ?? "<none>"}`),
      ui.box({ title: "Tab Bar", border: "single", px: 1 }, [
        ui.focusZone(
          {
            id: "zone.tabs",
            tabIndex: 0,
            navigation: "linear",
            wrapAround: true,
          },
          tabsChildren,
        ),
      ]),
      ui.row({ flex: 1, gap: 1, items: "stretch" }, [
        ui.box({ title: "Tree", border: "single", width: 34 }, [
          ui.focusZone(
            {
              id: "zone.tree",
              tabIndex: 1,
              navigation: "linear",
              wrapAround: false,
            },
            [ui.fileTreeExplorer(treeProps)],
          ),
        ]),
        ui.box({ title: "Editor", border: "single", flex: 1 }, [
          ui.focusZone(
            {
              id: "zone.editor",
              tabIndex: 2,
              navigation: "linear",
              wrapAround: false,
            },
            [editorView],
          ),
        ]),
      ]),
      ui.text(`Selected: ${state.selectedPath ?? "<none>"}`),
    ]);

    const paletteLayer = ui.focusTrap(
      {
        id: "palette-trap",
        active: state.paletteOpen,
        initialFocus: "palette",
      },
      [
        ui.commandPalette({
          id: "palette",
          open: state.paletteOpen,
          query: state.paletteQuery,
          selectedIndex: state.paletteSelectedIndex,
          placeholder: "Find file or type > command",
          maxVisible: 8,
          sources: PALETTE_SOURCES,
          onQueryChange: (query) => {
            app.update((current) =>
              Object.freeze({
                ...current,
                paletteQuery: query,
                paletteSelectedIndex: 0,
              }),
            );
          },
          onSelectionChange: (selectedIndex) => {
            app.update((current) =>
              Object.freeze({
                ...current,
                paletteSelectedIndex: selectedIndex,
              }),
            );
          },
          onSelect: (item) => {
            const data = parsePaletteData(item.data);
            if (!data) return;

            app.update((current) => {
              if (data.kind === "file") return openFileTab(current, data.path);
              if (data.id === "close-active-tab") return closeActiveTab(current);
              if (data.id === "open-readme-tab") return openFileTab(current, "/README.md");
              return openFileTab(current, "/src/app.ts");
            });
          },
          onClose: () => {
            app.update((current) =>
              Object.freeze({
                ...current,
                paletteOpen: false,
                paletteQuery: "",
                paletteSelectedIndex: 0,
              }),
            );
          },
        }),
      ],
    );

    return ui.layers([base, paletteLayer]);
  });

  return {
    app,
    backend,
    getState: () => latestState,
    renderSnapshots,
    fatalCodes,
    actionEvents,
    ackedFrames: 0,
    nextTimeMs: 1,
  };
}

async function createStartedHarness(): Promise<Harness> {
  const harness = createHarness();
  await startHarness(harness);
  return harness;
}

async function withHarness(run: (harness: Harness) => Promise<void>): Promise<void> {
  const harness = await createStartedHarness();
  try {
    await run(harness);
  } finally {
    await stopHarness(harness);
  }
}

describe("file manager integration pipeline", () => {
  test("initial frame renders tab bar, tree, and editor content", async () => {
    await withHarness(async (harness) => {
      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Tab Bar"), true);
      assert.equal(containsText(strings, "README.md"), true);
      assert.equal(containsText(strings, "# Workspace Readme"), true);
      assert.equal(containsText(strings, "Tree"), true);
      assert.equal(containsText(strings, "Editor"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("tree selection opens file and shows content in the editor", async () => {
    await withHarness(async (harness) => {
      await selectAppFileFromTree(harness);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: /src/app.ts"), true);
      assert.equal(containsText(strings, "export const appReady = true;"), true);
      assert.equal(containsText(strings, "Selected: /src/app.ts"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("ArrowRight on a directory expands tree rows deterministically", async () => {
    await withHarness(async (harness) => {
      const before = latestFrameStrings(harness);
      assert.equal(containsText(before, "app.ts"), false);

      await focusTree(harness);
      await pressKey(harness, ZR_KEY_HOME);
      await pressKey(harness, ZR_KEY_DOWN);
      await pressKey(harness, ZR_KEY_RIGHT);

      const after = latestFrameStrings(harness);
      assert.equal(containsText(after, "app.ts"), true);
      assert.equal(containsText(after, "utils.ts"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("ArrowLeft collapses an expanded directory and hides children", async () => {
    await withHarness(async (harness) => {
      await focusTree(harness);
      await pressKey(harness, ZR_KEY_HOME);
      await pressKey(harness, ZR_KEY_DOWN);
      await pressKey(harness, ZR_KEY_RIGHT);
      await pressKey(harness, ZR_KEY_LEFT);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "app.ts"), false);
      assert.equal(containsText(strings, "utils.ts"), false);
      assert.equal(containsText(strings, "src"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("tab button activation switches active editor tab", async () => {
    await withHarness(async (harness) => {
      await selectAppFileFromTree(harness);

      await pressKey(harness, ZR_KEY_TAB, ZR_MOD_SHIFT);
      assert.equal(latestFocusId(harness), "tab:/README.md");

      await pressKey(harness, ZR_KEY_RIGHT);
      assert.equal(latestFocusId(harness), "tab:/src/app.ts");

      await pressKey(harness, ZR_KEY_LEFT);
      assert.equal(latestFocusId(harness), "tab:/README.md");

      await pressKey(harness, ZR_KEY_ENTER);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: /README.md"), true);
      assert.equal(containsText(strings, "# Workspace Readme"), true);
      assert.equal(
        harness.actionEvents.some(
          (event) => event.id === "tab:/README.md" && event.action === "press",
        ),
        true,
      );
      assertNoFatalEvents(harness);
    });
  });

  test("tab bar arrow navigation moves focus between open tabs", async () => {
    await withHarness(async (harness) => {
      await selectAppFileFromTree(harness);

      await pressKey(harness, ZR_KEY_TAB, ZR_MOD_SHIFT);
      assert.equal(latestFocusId(harness), "tab:/README.md");

      await pressKey(harness, ZR_KEY_LEFT);
      assert.equal(latestFocusId(harness), "tab:/src/app.ts");

      await pressKey(harness, ZR_KEY_RIGHT);
      assert.equal(latestFocusId(harness), "tab:/README.md");
      assertNoFatalEvents(harness);
    });
  });

  test("ctrl+p opens command palette and renders command rows", async () => {
    await withHarness(async (harness) => {
      await openPalette(harness);

      assert.equal(harness.getState().paletteOpen, true);
      assert.equal(latestFocusId(harness), "palette");
      assertNoFatalEvents(harness);
    });
  });

  test("palette query is driven by text events and filters results", async () => {
    await withHarness(async (harness) => {
      await openPalette(harness);
      const beforeFrames = harness.backend.requestedFrames.length;
      await typeText(harness, "app");
      assert.equal(harness.backend.requestedFrames.length > beforeFrames, true);

      await pressKey(harness, ZR_KEY_ENTER);
      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: /src/app.ts"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("palette Tab cycles source prefix and scopes to command source", async () => {
    await withHarness(async (harness) => {
      await openPalette(harness);
      await pressKey(harness, ZR_KEY_TAB);
      await pressKey(harness, ZR_KEY_ENTER);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: <none>"), true);
      assert.equal(containsText(strings, "Selected: <none>"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("palette Enter opens selected file and syncs editor output", async () => {
    await withHarness(async (harness) => {
      await openPalette(harness);
      await typeText(harness, "app");
      await pressKey(harness, ZR_KEY_ENTER);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: /src/app.ts"), true);
      assert.equal(containsText(strings, "export const appReady = true;"), true);
      assert.equal(containsText(strings, "Find file or type > command"), false);
      assertNoFatalEvents(harness);
    });
  });

  test("palette Escape closes overlay cleanly", async () => {
    await withHarness(async (harness) => {
      await openPalette(harness);
      await pressKey(harness, ZR_KEY_ESCAPE);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Find file or type > command"), false);
      assert.equal(latestFocusId(harness) === "palette", false);
      assertNoFatalEvents(harness);
    });
  });

  test("text events route to editor when editor is focused", async () => {
    await withHarness(async (harness) => {
      await focusEditor(harness);
      assert.equal(latestFocusId(harness), "editor");

      await typeText(harness, "!");

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "!# Workspace Readme"), true);
      assertNoFatalEvents(harness);
    });
  });

  test("text events route to palette query when palette is focused", async () => {
    await withHarness(async (harness) => {
      await focusEditor(harness);
      await openPalette(harness);
      await typeText(harness, "ut");

      assert.equal(harness.getState().paletteOpen, true);
      assert.equal(harness.getState().paletteQuery.includes("t"), true);
      assert.equal(latestFocusId(harness), "palette");
      await pressKey(harness, ZR_KEY_ESCAPE);
      assertNoFatalEvents(harness);
    });
  });

  test("Tab and Shift+Tab route focus across tab/tree/editor zones", async () => {
    await withHarness(async (harness) => {
      assert.equal(latestFocusId(harness), null);

      await pressKey(harness, ZR_KEY_TAB);
      assert.equal(latestFocusId(harness), "tab:/README.md");

      await pressKey(harness, ZR_KEY_TAB);
      assert.equal(latestFocusId(harness), "tree");

      await pressKey(harness, ZR_KEY_TAB, ZR_MOD_SHIFT);
      assert.equal(latestFocusId(harness), "tab:/README.md");

      await pressKey(harness, ZR_KEY_TAB);
      assert.equal(latestFocusId(harness), "tree");

      await pressKey(harness, ZR_KEY_TAB);
      assert.equal(latestFocusId(harness), "editor");
      assertNoFatalEvents(harness);
    });
  });

  test("full keyboard workflow stays stable and produces expected output", async () => {
    await withHarness(async (harness) => {
      await selectAppFileFromTree(harness);
      await openPalette(harness);
      await typeText(harness, "guide");
      await pressKey(harness, ZR_KEY_ENTER);
      await pressKey(harness, keyCode("w"), ZR_MOD_CTRL);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab: /src/app.ts"), true);
      assert.equal(harness.backend.requestedFrames.length >= 8, true);
      assertNoFatalEvents(harness);
    });
  });

  test("single encoded event batch across focus, tree, editor, and text does not crash", async () => {
    await withHarness(async (harness) => {
      const events: EncodedEvent[] = [
        keyDownEvent(harness, ZR_KEY_TAB),
        keyDownEvent(harness, ZR_KEY_TAB),
        keyDownEvent(harness, ZR_KEY_HOME),
        keyDownEvent(harness, ZR_KEY_DOWN),
        keyDownEvent(harness, ZR_KEY_RIGHT),
        keyDownEvent(harness, ZR_KEY_DOWN),
        keyDownEvent(harness, ZR_KEY_TAB),
      ];

      for (const char of "xyz") {
        const codepoint = char.codePointAt(0);
        if (codepoint === undefined) continue;
        events.push(
          Object.freeze({
            kind: "text",
            timeMs: nextTime(harness),
            codepoint,
          }),
        );
      }

      await pushEncodedEvents(harness, Object.freeze(events));
      await settleAllFrames(harness);

      const strings = latestFrameStrings(harness);
      assert.equal(containsText(strings, "Active tab:"), true);
      assert.equal(containsText(strings, "Selected:"), true);
      assert.equal(harness.backend.requestedFrames.length >= 2, true);
      assertNoFatalEvents(harness);
    });
  });
});
