import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import {
  type TableStateStore,
  type TreeStateStore,
  type VirtualListStateStore,
  createTableStateStore,
  createTreeStateStore,
  createVirtualListStateStore,
} from "../../runtime/localState.js";
import { ui } from "../ui.js";

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function parseOpcodes(bytes: Uint8Array): readonly number[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: number[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    out.push(opcode);
    off += size;
  }
  return Object.freeze(out);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);

  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table in bounds");

  const decoder = new TextDecoder();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const strOff = u32(bytes, span);
    const strLen = u32(bytes, span + 4);
    const start = bytesOffset + strOff;
    const end = start + strLen;
    assert.ok(end <= tableEnd, "string span in bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return Object.freeze(out);
}

type CommandStyle = Readonly<{
  opcode: number;
  fg: number;
  bg: number;
  attrs: number;
}>;

function parseCommandStyles(bytes: Uint8Array): readonly CommandStyle[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: CommandStyle[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    if (opcode === 2 && size >= 40) {
      out.push({
        opcode,
        fg: u32(bytes, off + 24),
        bg: u32(bytes, off + 28),
        attrs: u32(bytes, off + 32),
      });
    } else if (opcode === 3 && size >= 48) {
      out.push({
        opcode,
        fg: u32(bytes, off + 28),
        bg: u32(bytes, off + 32),
        attrs: u32(bytes, off + 36),
      });
    }
    off += size;
  }

  return Object.freeze(out);
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function renderBytes(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 64, rows: 20 },
  stores?: Readonly<{
    virtualListStore?: VirtualListStateStore;
    tableStore?: TableStateStore;
    treeStore?: TreeStateStore;
  }>,
): Uint8Array {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return new Uint8Array();

  const layoutRes = layout(
    committed.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return new Uint8Array();

  const builder = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
    virtualListStore: stores?.virtualListStore,
    tableStore: stores?.tableStore,
    treeStore: stores?.treeStore,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist should build");
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

describe("renderer regressions", () => {
  const noop = (..._args: readonly unknown[]) => undefined;

  test("box shadow renders shade glyphs when enabled", () => {
    const withShadow = parseInternedStrings(
      renderBytes(
        ui.box({ width: 12, height: 4, border: "single", shadow: true }, [ui.text("x")]),
        { cols: 40, rows: 12 },
      ),
    );
    const withoutShadow = parseInternedStrings(
      renderBytes(ui.box({ width: 12, height: 4, border: "single" }, [ui.text("x")]), {
        cols: 40,
        rows: 12,
      }),
    );

    assert.equal(
      withShadow.some((s) => s.includes("▒")),
      true,
    );
    assert.equal(
      withoutShadow.some((s) => s.includes("▒")),
      false,
    );
  });

  test("table header renders sort indicator and right-aligned cells", () => {
    const bytes = renderBytes(
      ui.table({
        id: "tbl-sort",
        columns: [{ key: "size", header: "Size", width: 8, sortable: true, align: "right" }],
        data: [{ size: 7 }],
        getRowKey: (_row, index) => `row-${String(index)}`,
        sortColumn: "size",
        sortDirection: "asc",
        border: "none",
      }),
      { cols: 40, rows: 8 },
    );
    const strings = parseInternedStrings(bytes);

    assert.equal(
      strings.some((s) => s.includes("▲")),
      true,
    );
    assert.equal(strings.includes("       7"), true);
  });

  test("table stripedRows emits row background fills", () => {
    const tableProps = {
      id: "tbl-striped",
      columns: [{ key: "name", header: "Name", width: 10 }],
      data: [{ name: "A" }, { name: "B" }, { name: "C" }],
      getRowKey: (row: { name: string }) => row.name,
      border: "none",
      selectionMode: "none",
    } as const;

    const withStripedOpcodes = parseOpcodes(
      renderBytes(ui.table({ ...tableProps, stripedRows: true }), { cols: 40, rows: 8 }),
    );
    const withoutStripedOpcodes = parseOpcodes(
      renderBytes(ui.table({ ...tableProps, stripedRows: false }), { cols: 40, rows: 8 }),
    );

    const withFillCount = withStripedOpcodes.filter((op) => op === 2).length;
    const withoutFillCount = withoutStripedOpcodes.filter((op) => op === 2).length;
    assert.equal(withFillCount > withoutFillCount, true);
  });

  test("table column overflow policies render ellipsis, middle, and clip deterministically", () => {
    const strings = parseInternedStrings(
      renderBytes(
        ui.table({
          id: "tbl-overflow",
          columns: [
            { key: "ellipsis", header: "Ellipsis", width: 6 },
            { key: "middle", header: "Middle", width: 6, overflow: "middle" },
            { key: "clip", header: "Clip", width: 6, overflow: "clip" },
          ],
          data: [
            {
              ellipsis: "aaaaabbbbb",
              middle: "cccccddddd",
              clip: "eeeeefffff",
            },
          ],
          getRowKey: () => "row-0",
          border: "none",
        }),
        { cols: 60, rows: 8 },
      ),
    );

    assert.equal(strings.includes("aaaaa…"), true);
    assert.equal(strings.includes("ccc…dd"), true);
    assert.equal(strings.includes("eeeeefffff"), true);
  });

  test("table stripeStyle applies custom odd/even row background colors", () => {
    const bytes = renderBytes(
      ui.table({
        id: "tbl-stripe-style",
        columns: [{ key: "name", header: "Name", width: 12 }],
        data: [{ name: "A" }, { name: "B" }, { name: "C" }],
        getRowKey: (row) => row.name,
        stripedRows: false,
        stripeStyle: {
          odd: { r: 1, g: 2, b: 3 },
          even: { r: 4, g: 5, b: 6 },
        },
        border: "none",
      }),
      { cols: 40, rows: 8 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(1, 2, 3)),
      true,
    );
    assert.equal(
      styles.some((s) => s.bg === packRgb(4, 5, 6)),
      true,
    );
  });

  test("table borderStyle applies custom variant and border color", () => {
    const bytes = renderBytes(
      ui.table({
        id: "tbl-border-style",
        columns: [{ key: "name", header: "Name", width: 10 }],
        data: [{ name: "A" }],
        getRowKey: (row) => row.name,
        border: "single",
        borderStyle: {
          variant: "double",
          color: { r: 201, g: 202, b: 203 },
        },
      }),
      { cols: 40, rows: 8 },
    );

    const strings = parseInternedStrings(bytes);
    const styles = parseCommandStyles(bytes);
    assert.equal(
      strings.some((s) => s.includes("═")),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(201, 202, 203)),
      true,
    );
  });

  test("table border none keeps border hidden when borderStyle is provided", () => {
    const strings = parseInternedStrings(
      renderBytes(
        ui.table({
          id: "tbl-border-none-style",
          columns: [{ key: "name", header: "Name", width: 10 }],
          data: [{ name: "A" }],
          getRowKey: (row) => row.name,
          border: "none",
          borderStyle: {
            variant: "double",
            color: { r: 111, g: 112, b: 113 },
          },
        }),
        { cols: 40, rows: 8 },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("═") || s.includes("╔") || s.includes("╗")),
      false,
    );
  });

  test("dropdown renders shortcut text", () => {
    const bytes = renderBytes(
      ui.column({}, [
        ui.button("file-trigger", "File"),
        ui.dropdown({
          id: "file-menu",
          anchorId: "file-trigger",
          items: [
            { id: "new", label: "New File", shortcut: "Ctrl+N" },
            { id: "open", label: "Open", shortcut: "Ctrl+O" },
          ],
        }),
      ]),
      { cols: 60, rows: 20 },
    );
    const strings = parseInternedStrings(bytes);
    assert.equal(strings.includes("Ctrl+N"), true);
    assert.equal(strings.includes("Ctrl+O"), true);
  });

  test("modal backdrop config renders custom dim pattern and colors", () => {
    const bytes = renderBytes(
      ui.modal({
        id: "modal-backdrop-custom",
        title: "Backdrop",
        content: ui.text("Body"),
        backdrop: {
          variant: "dim",
          pattern: "#",
          foreground: { r: 1, g: 2, b: 3 },
          background: { r: 4, g: 5, b: 6 },
        },
      }),
      { cols: 60, rows: 20 },
    );

    const strings = parseInternedStrings(bytes);
    const styles = parseCommandStyles(bytes);
    assert.equal(
      strings.some((s) => s.includes("###")),
      true,
    );
    assert.equal(
      styles.some((s) => s.opcode === 3 && s.fg === packRgb(1, 2, 3) && s.bg === packRgb(4, 5, 6)),
      true,
    );
  });

  test("modal backdrop object keeps legacy dim defaults when fields are omitted", () => {
    const strings = parseInternedStrings(
      renderBytes(
        ui.modal({
          id: "modal-backdrop-defaults",
          content: ui.text("Body"),
          backdrop: { pattern: "" },
        }),
        { cols: 60, rows: 20 },
      ),
    );
    assert.equal(
      strings.some((s) => s.includes("░")),
      true,
    );
  });

  test("modal frameStyle encodes foreground, background, and border colors", () => {
    const bytes = renderBytes(
      ui.modal({
        id: "modal-frame-style",
        content: ui.text("Styled modal"),
        backdrop: "none",
        frameStyle: {
          background: { r: 12, g: 13, b: 14 },
          foreground: { r: 210, g: 211, b: 212 },
          border: { r: 90, g: 91, b: 92 },
        },
      }),
      { cols: 60, rows: 20 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(12, 13, 14)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(210, 211, 212)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(90, 91, 92)),
      true,
    );
  });

  test("layer frameStyle encodes foreground, background, and border colors", () => {
    const bytes = renderBytes(
      ui.layer({
        id: "layer-frame-style",
        backdrop: "none",
        frameStyle: {
          background: { r: 21, g: 22, b: 23 },
          foreground: { r: 181, g: 182, b: 183 },
          border: { r: 101, g: 102, b: 103 },
        },
        content: ui.text("Layer styled"),
      }),
      { cols: 60, rows: 20 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(21, 22, 23)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(181, 182, 183)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(101, 102, 103)),
      true,
    );
  });

  test("dropdown frameStyle encodes foreground, background, and border colors", () => {
    const bytes = renderBytes(
      ui.column({}, [
        ui.button("menu-anchor", "Menu"),
        ui.dropdown({
          id: "styled-dropdown",
          anchorId: "menu-anchor",
          items: [
            { id: "new", label: "New" },
            { id: "open", label: "Open" },
          ],
          frameStyle: {
            background: { r: 31, g: 32, b: 33 },
            foreground: { r: 191, g: 192, b: 193 },
            border: { r: 111, g: 112, b: 113 },
          },
        }),
      ]),
      { cols: 60, rows: 20 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(31, 32, 33)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(191, 192, 193)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(111, 112, 113)),
      true,
    );
  });

  test("commandPalette frameStyle encodes foreground, background, and border colors", () => {
    const bytes = renderBytes(
      ui.commandPalette({
        id: "palette-frame-style",
        open: true,
        query: "run",
        sources: [{ id: "cmd", name: "Commands", getItems: () => [] }],
        selectedIndex: 0,
        frameStyle: {
          background: { r: 41, g: 42, b: 43 },
          foreground: { r: 201, g: 202, b: 203 },
          border: { r: 121, g: 122, b: 123 },
        },
        onQueryChange: noop,
        onSelect: noop,
        onClose: noop,
      }),
      { cols: 70, rows: 24 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(41, 42, 43)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(201, 202, 203)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(121, 122, 123)),
      true,
    );
  });

  test("toastContainer frameStyle encodes foreground, background, and border colors", () => {
    const bytes = renderBytes(
      ui.toastContainer({
        toasts: [{ id: "toast-1", message: "Saved", type: "success" }],
        onDismiss: noop,
        frameStyle: {
          background: { r: 51, g: 52, b: 53 },
          foreground: { r: 211, g: 212, b: 213 },
          border: { r: 131, g: 132, b: 133 },
        },
      }),
      { cols: 70, rows: 24 },
    );

    const styles = parseCommandStyles(bytes);
    assert.equal(
      styles.some((s) => s.bg === packRgb(51, 52, 53)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(211, 212, 213)),
      true,
    );
    assert.equal(
      styles.some((s) => s.fg === packRgb(131, 132, 133)),
      true,
    );
  });

  test("virtualList clamps stale scrollTop after data shrink", () => {
    const virtualListStore = createVirtualListStateStore();
    const viewport = { cols: 40, rows: 6 } as const;
    const id = "vl-shrink";
    virtualListStore.set(id, { scrollTop: 15 });

    renderBytes(
      ui.virtualList({
        id,
        items: Array.from({ length: 20 }, (_, i) => `large-${String(i)}`),
        itemHeight: 1,
        renderItem: (item) => ui.text(item),
      }),
      viewport,
      { virtualListStore },
    );

    const strings = parseInternedStrings(
      renderBytes(
        ui.virtualList({
          id,
          items: ["small-0", "small-1"],
          itemHeight: 1,
          renderItem: (item) => ui.text(item),
        }),
        viewport,
        { virtualListStore },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("small-0")),
      true,
    );
  });

  test("table clamps stale scrollTop after data shrink", () => {
    const tableStore = createTableStateStore();
    const viewport = { cols: 40, rows: 6 } as const;
    const id = "tbl-shrink";
    tableStore.set(id, { scrollTop: 15 });

    renderBytes(
      ui.table({
        id,
        columns: [{ key: "name", header: "Name", width: 20 }],
        data: Array.from({ length: 20 }, (_, i) => ({ name: `large-row-${String(i)}` })),
        getRowKey: (row) => row.name,
        border: "none",
      }),
      viewport,
      { tableStore },
    );

    const strings = parseInternedStrings(
      renderBytes(
        ui.table({
          id,
          columns: [{ key: "name", header: "Name", width: 20 }],
          data: [{ name: "small-row-0" }, { name: "small-row-1" }],
          getRowKey: (row) => row.name,
          border: "none",
        }),
        viewport,
        { tableStore },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("small-row-0")),
      true,
    );
  });

  test("tree clamps stale scrollTop after data shrink", () => {
    const treeStore = createTreeStateStore();
    const viewport = { cols: 40, rows: 6 } as const;
    const id = "tree-shrink";
    treeStore.set(id, { scrollTop: 15 });

    renderBytes(
      ui.tree({
        id,
        data: Array.from({ length: 20 }, (_, i) =>
          Object.freeze({ id: `large-node-${String(i)}`, children: [] as const }),
        ),
        getKey: (node) => node.id,
        getChildren: (node) => node.children,
        expanded: [],
        onToggle: noop,
        renderNode: (node) => ui.text(node.id),
      }),
      viewport,
      { treeStore },
    );

    const strings = parseInternedStrings(
      renderBytes(
        ui.tree({
          id,
          data: Object.freeze([
            Object.freeze({ id: "small-node-0", children: [] as const }),
            Object.freeze({ id: "small-node-1", children: [] as const }),
          ]),
          getKey: (node) => node.id,
          getChildren: (node) => node.children,
          expanded: [],
          onToggle: noop,
          renderNode: (node) => ui.text(node.id),
        }),
        viewport,
        { treeStore },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("small-node-0")),
      true,
    );
  });

  test("filePicker clamps stale scrollTop after data shrink", () => {
    const treeStore = createTreeStateStore();
    const viewport = { cols: 40, rows: 6 } as const;
    const id = "picker-shrink";
    treeStore.set(id, { scrollTop: 15 });

    const largeData = Object.freeze({
      name: "root",
      path: "/",
      type: "directory" as const,
      children: Array.from({ length: 20 }, (_, i) =>
        Object.freeze({
          name: `large-file-${String(i)}`,
          path: `/large-file-${String(i)}`,
          type: "file" as const,
        }),
      ),
    });
    const smallData = Object.freeze({
      name: "root",
      path: "/",
      type: "directory" as const,
      children: Object.freeze([
        Object.freeze({ name: "small-file-0", path: "/small-file-0", type: "file" as const }),
        Object.freeze({ name: "small-file-1", path: "/small-file-1", type: "file" as const }),
      ]),
    });

    renderBytes(
      ui.filePicker({
        id,
        rootPath: "/",
        data: largeData,
        expandedPaths: ["/"],
        onSelect: noop,
        onToggle: noop,
        onOpen: noop,
      }),
      viewport,
      { treeStore },
    );

    const strings = parseInternedStrings(
      renderBytes(
        ui.filePicker({
          id,
          rootPath: "/",
          data: smallData,
          expandedPaths: ["/"],
          onSelect: noop,
          onToggle: noop,
          onOpen: noop,
        }),
        viewport,
        { treeStore },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("small-file-0")),
      true,
    );
  });

  test("fileTreeExplorer clamps stale scrollTop after data shrink", () => {
    const treeStore = createTreeStateStore();
    const viewport = { cols: 40, rows: 6 } as const;
    const id = "explorer-shrink";
    treeStore.set(id, { scrollTop: 15 });

    const largeData = Object.freeze({
      name: "root",
      path: "/",
      type: "directory" as const,
      children: Array.from({ length: 20 }, (_, i) =>
        Object.freeze({
          name: `large-node-${String(i)}`,
          path: `/large-node-${String(i)}`,
          type: "file" as const,
        }),
      ),
    });
    const smallData = Object.freeze({
      name: "root",
      path: "/",
      type: "directory" as const,
      children: Object.freeze([
        Object.freeze({ name: "small-node-0", path: "/small-node-0", type: "file" as const }),
        Object.freeze({ name: "small-node-1", path: "/small-node-1", type: "file" as const }),
      ]),
    });

    renderBytes(
      ui.fileTreeExplorer({
        id,
        data: largeData,
        expanded: ["/"],
        onToggle: noop,
        onSelect: noop,
        onActivate: noop,
      }),
      viewport,
      { treeStore },
    );

    const strings = parseInternedStrings(
      renderBytes(
        ui.fileTreeExplorer({
          id,
          data: smallData,
          expanded: ["/"],
          onToggle: noop,
          onSelect: noop,
          onActivate: noop,
        }),
        viewport,
        { treeStore },
      ),
    );

    assert.equal(
      strings.some((s) => s.includes("small-node-0")),
      true,
    );
  });
});
