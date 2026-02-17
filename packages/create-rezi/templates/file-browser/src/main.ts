import type { CommandItem, CommandSource, TableColumn, VNode } from "@rezi-ui/core";
import { createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type EntryType = "dir" | "file";
type PaletteAction = "toggle-hidden" | "go-root" | "go-parent" | "reveal-opened";

type Entry = {
  name: string;
  type: EntryType;
  size: string;
  modified: string;
  preview: string;
};

type Tree = Record<string, readonly Entry[]>;

type PaletteData =
  | {
      kind: "path";
      path: string;
      entryType: EntryType;
    }
  | {
      kind: "action";
      action: PaletteAction;
    };

type PaletteStats = {
  requests: number;
  completed: number;
  cancelled: number;
  lastDurationMs: number;
  activeRequestId: number | null;
};

type PaletteState = {
  open: boolean;
  query: string;
  selectedIndex: number;
  loading: boolean;
  lastAction: string;
  stats: PaletteStats;
};

type State = {
  path: string;
  selected: number;
  showHidden: boolean;
  opened: string | null;
  palette: PaletteState;
};

type SearchCandidate = {
  path: string;
  name: string;
  type: EntryType;
  nameLower: string;
  pathLower: string;
};

const tree: Tree = {
  "/": [
    { name: "src", type: "dir", size: "-", modified: "2026-02-10", preview: "" },
    { name: "docs", type: "dir", size: "-", modified: "2026-02-08", preview: "" },
    { name: "scripts", type: "dir", size: "-", modified: "2026-02-07", preview: "" },
    {
      name: "package.json",
      type: "file",
      size: "2 KB",
      modified: "2026-02-07",
      preview: '{\n  "name": "__APP_NAME__",\n  "private": true\n}',
    },
    {
      name: "README.md",
      type: "file",
      size: "3 KB",
      modified: "2026-02-06",
      preview: "# __APP_NAME__\\nProject documentation.",
    },
    { name: ".env", type: "file", size: "1 KB", modified: "2026-02-05", preview: "API_KEY=***" },
    {
      name: ".gitignore",
      type: "file",
      size: "1 KB",
      modified: "2026-02-05",
      preview: "node_modules\\ndist\\n.env",
    },
  ],
  "/src": [
    {
      name: "main.ts",
      type: "file",
      size: "5 KB",
      modified: "2026-02-10",
      preview: "import { createApp } from '@rezi-ui/core'",
    },
    { name: "components", type: "dir", size: "-", modified: "2026-02-09", preview: "" },
    { name: "styles", type: "dir", size: "-", modified: "2026-02-09", preview: "" },
    {
      name: "search.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-09",
      preview: "export function fuzzySearch(query: string) {}",
    },
  ],
  "/src/components": [
    {
      name: "Panel.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-09",
      preview: "export function Panel() {}",
    },
    {
      name: "StatusBar.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-09",
      preview: "export function StatusBar() {}",
    },
    {
      name: "Palette.ts",
      type: "file",
      size: "3 KB",
      modified: "2026-02-09",
      preview: "export function Palette() {}",
    },
  ],
  "/src/styles": [
    {
      name: "tokens.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-08",
      preview: "export const colors = {}",
    },
    {
      name: "layout.css",
      type: "file",
      size: "4 KB",
      modified: "2026-02-08",
      preview: ".layout { display: grid; }",
    },
  ],
  "/docs": [
    {
      name: "overview.md",
      type: "file",
      size: "3 KB",
      modified: "2026-02-08",
      preview: "# Overview",
    },
    { name: "usage.md", type: "file", size: "2 KB", modified: "2026-02-08", preview: "# Usage" },
    {
      name: "architecture.md",
      type: "file",
      size: "5 KB",
      modified: "2026-02-07",
      preview: "# Architecture",
    },
  ],
  "/scripts": [
    {
      name: "sync-data.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-07",
      preview: "export async function syncData() {}",
    },
    {
      name: "seed-db.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-07",
      preview: "export async function seedDb() {}",
    },
  ],
};

const colors = {
  accent: rgb(104, 216, 255),
  accentSoft: rgb(138, 176, 255),
  muted: rgb(134, 149, 178),
  text: rgb(215, 225, 246),
  panel: rgb(13, 20, 33),
  panelAlt: rgb(18, 28, 44),
  panelBorder: rgb(60, 78, 110),
  footer: rgb(8, 13, 22),
  info: rgb(120, 190, 255),
  success: rgb(104, 223, 157),
  warning: rgb(255, 194, 108),
};

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: {
    path: "/",
    selected: 0,
    showHidden: false,
    opened: null,
    palette: {
      open: false,
      query: "",
      selectedIndex: 0,
      loading: false,
      lastAction: "Ready",
      stats: {
        requests: 0,
        completed: 0,
        cancelled: 0,
        lastDurationMs: 0,
        activeRequestId: null,
      },
    },
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function joinPath(base: string, name: string): string {
  if (base === "/") return `/${name}`;
  return `${base}/${name}`;
}

function parentPath(path: string): string {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}` || "/";
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function listEntriesAt(path: string, showHidden: boolean): Entry[] {
  const entries = tree[path] ?? [];
  if (showHidden) return [...entries];
  return entries.filter((entry) => !entry.name.startsWith("."));
}

function listEntries(state: Pick<State, "path" | "showHidden">): Entry[] {
  return listEntriesAt(state.path, state.showHidden);
}

function panel(title: string, children: readonly VNode[], flex = 1): VNode {
  return ui.box(
    {
      title,
      flex,
      border: "rounded",
      px: 1,
      py: 0,
      style: { bg: colors.panel, fg: colors.muted },
    },
    children,
  );
}

function openEntry(state: State, entry: Entry): State {
  const fullPath = joinPath(state.path, entry.name);

  if (entry.type === "dir") {
    return {
      ...state,
      path: fullPath,
      selected: 0,
      palette: {
        ...state.palette,
        lastAction: `Entered ${fullPath}`,
      },
    };
  }

  return {
    ...state,
    opened: fullPath,
    palette: {
      ...state.palette,
      lastAction: `Opened ${fullPath}`,
    },
  };
}

function locatePath(path: string): { dir: string; entry: Entry } | null {
  const name = basename(path);
  if (!name) return null;

  const dir = parentPath(path);
  const entries = tree[dir] ?? [];
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) return null;

  return { dir, entry };
}

function parsePaletteData(data: unknown): PaletteData | null {
  if (typeof data !== "object" || data === null) return null;

  const candidate = data as {
    kind?: unknown;
    path?: unknown;
    entryType?: unknown;
    action?: unknown;
  };

  if (
    candidate.kind === "path" &&
    typeof candidate.path === "string" &&
    (candidate.entryType === "dir" || candidate.entryType === "file")
  ) {
    return {
      kind: "path",
      path: candidate.path,
      entryType: candidate.entryType,
    };
  }

  if (
    candidate.kind === "action" &&
    (candidate.action === "toggle-hidden" ||
      candidate.action === "go-root" ||
      candidate.action === "go-parent" ||
      candidate.action === "reveal-opened")
  ) {
    return {
      kind: "action",
      action: candidate.action,
    };
  }

  return null;
}

function applyPaletteAction(state: State, action: PaletteAction): State {
  if (action === "toggle-hidden") {
    const showHidden = !state.showHidden;
    const entries = listEntriesAt(state.path, showHidden);
    const selected = clamp(state.selected, 0, Math.max(0, entries.length - 1));

    return {
      ...state,
      showHidden,
      selected,
      palette: {
        ...state.palette,
        lastAction: showHidden ? "Hidden files are now visible" : "Hidden files are now hidden",
      },
    };
  }

  if (action === "go-root") {
    return {
      ...state,
      path: "/",
      selected: 0,
      palette: {
        ...state.palette,
        lastAction: "Moved to project root",
      },
    };
  }

  if (action === "go-parent") {
    const nextPath = parentPath(state.path);
    return {
      ...state,
      path: nextPath,
      selected: 0,
      palette: {
        ...state.palette,
        lastAction: `Moved to ${nextPath}`,
      },
    };
  }

  const openedPath = state.opened;
  if (!openedPath) {
    return {
      ...state,
      palette: {
        ...state.palette,
        lastAction: "No opened file to reveal",
      },
    };
  }

  const located = locatePath(openedPath);
  if (!located) {
    return {
      ...state,
      palette: {
        ...state.palette,
        lastAction: "Opened file no longer exists in current tree",
      },
    };
  }

  let showHidden = state.showHidden;
  let entries = listEntriesAt(located.dir, showHidden);
  let selected = entries.findIndex((entry) => entry.name === located.entry.name);

  if (selected < 0 && located.entry.name.startsWith(".")) {
    showHidden = true;
    entries = listEntriesAt(located.dir, true);
    selected = entries.findIndex((entry) => entry.name === located.entry.name);
  }

  return {
    ...state,
    path: located.dir,
    showHidden,
    selected: selected >= 0 ? selected : 0,
    palette: {
      ...state.palette,
      lastAction: `Revealed ${openedPath}`,
    },
  };
}

function openPathFromPalette(state: State, path: string, entryType: EntryType): State {
  if (entryType === "dir") {
    return {
      ...state,
      path,
      selected: 0,
      palette: {
        ...state.palette,
        lastAction: `Navigated to ${path}`,
      },
    };
  }

  const located = locatePath(path);
  if (!located) {
    return {
      ...state,
      opened: path,
      palette: {
        ...state.palette,
        lastAction: `Opened ${path}`,
      },
    };
  }

  const entries = listEntriesAt(located.dir, state.showHidden);
  const selected = entries.findIndex((entry) => entry.name === located.entry.name);

  return {
    ...state,
    path: located.dir,
    selected: selected >= 0 ? selected : 0,
    opened: path,
    palette: {
      ...state.palette,
      lastAction: `Opened ${path}`,
    },
  };
}

const searchCandidates: readonly SearchCandidate[] = Object.freeze(
  Object.entries(tree).flatMap(([dir, entries]) =>
    entries.map((entry) => {
      const path = joinPath(dir, entry.name);
      return {
        path,
        name: entry.name,
        type: entry.type,
        nameLower: entry.name.toLowerCase(),
        pathLower: path.toLowerCase(),
      };
    }),
  ),
);

function scoreCandidate(candidate: SearchCandidate, query: string): number {
  if (query.length === 0) {
    return candidate.type === "dir" ? 80 : 70;
  }

  if (candidate.nameLower === query) return 360;
  if (candidate.nameLower.startsWith(query)) return 280 - candidate.name.length;

  const nameIndex = candidate.nameLower.indexOf(query);
  if (nameIndex >= 0) return 230 - nameIndex * 3;

  const pathIndex = candidate.pathLower.indexOf(query);
  if (pathIndex >= 0) return 170 - Math.min(120, pathIndex * 2);

  let queryIndex = 0;
  let streak = 0;
  let bonus = 0;

  for (const char of candidate.pathLower) {
    if (queryIndex < query.length && char === query[queryIndex]) {
      queryIndex += 1;
      streak += 1;
      bonus += streak * 2;
    } else {
      streak = 0;
    }
  }

  if (queryIndex === query.length) {
    return 80 + bonus;
  }

  return 0;
}

function buildFileItems(query: string): readonly CommandItem[] {
  const normalized = query.trim().toLowerCase();
  const ranked = searchCandidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, normalized),
    }))
    .filter((rankedCandidate) => rankedCandidate.score > 0)
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;
      return a.candidate.path.localeCompare(b.candidate.path);
    })
    .slice(0, 16);

  return Object.freeze(
    ranked.map(({ candidate }) => ({
      id: `path:${candidate.path}`,
      label: candidate.name,
      description: candidate.path,
      sourceId: "files",
      icon: candidate.type === "dir" ? "D" : "F",
      data: {
        kind: "path",
        path: candidate.path,
        entryType: candidate.type,
      } as PaletteData,
    })),
  );
}

function buildCommandItems(query: string): readonly CommandItem[] {
  const lowerQuery = query.trim().toLowerCase();

  const catalog: readonly CommandItem[] = Object.freeze([
    {
      id: "cmd:toggle-hidden",
      label: "Toggle hidden files",
      description: "Show or hide dot-prefixed entries",
      sourceId: "commands",
      shortcut: "h",
      data: { kind: "action", action: "toggle-hidden" } as PaletteData,
    },
    {
      id: "cmd:go-root",
      label: "Go to project root",
      description: "Jump to /",
      sourceId: "commands",
      shortcut: "g",
      data: { kind: "action", action: "go-root" } as PaletteData,
    },
    {
      id: "cmd:go-parent",
      label: "Go to parent directory",
      description: "Move one level up",
      sourceId: "commands",
      shortcut: "backspace",
      data: { kind: "action", action: "go-parent" } as PaletteData,
    },
    {
      id: "cmd:reveal-opened",
      label: "Reveal last opened file",
      description: "Focus the file currently in preview",
      sourceId: "commands",
      shortcut: "r",
      data: { kind: "action", action: "reveal-opened" } as PaletteData,
    },
  ]);

  if (!lowerQuery) return catalog;

  return Object.freeze(
    catalog.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(lowerQuery);
      const descriptionMatch = item.description?.toLowerCase().includes(lowerQuery) ?? false;
      return labelMatch || descriptionMatch;
    }),
  );
}

type ActiveSearch = {
  id: number;
  controller: AbortController;
};

let requestCounter = 0;
let activeSearch: ActiveSearch | null = null;

function createAbortError(): Error {
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function cancelActiveSearch(): void {
  if (!activeSearch) return;
  activeSearch.controller.abort();
  activeSearch = null;
}

async function searchPaletteFiles(query: string): Promise<readonly CommandItem[]> {
  const requestId = ++requestCounter;

  if (activeSearch) {
    activeSearch.controller.abort();
  }

  const controller = new AbortController();
  activeSearch = { id: requestId, controller };

  app.update((state) => ({
    ...state,
    palette: {
      ...state.palette,
      loading: true,
      stats: {
        ...state.palette.stats,
        requests: state.palette.stats.requests + 1,
        activeRequestId: requestId,
      },
    },
  }));

  const startedAt = Date.now();

  try {
    await waitWithAbort(120 + Math.floor(Math.random() * 260), controller.signal);
    const items = buildFileItems(query);
    const durationMs = Date.now() - startedAt;

    app.update((state) => {
      if (state.palette.stats.activeRequestId !== requestId) return state;

      return {
        ...state,
        palette: {
          ...state.palette,
          loading: false,
          stats: {
            ...state.palette.stats,
            completed: state.palette.stats.completed + 1,
            lastDurationMs: durationMs,
            activeRequestId: null,
          },
        },
      };
    });

    if (activeSearch?.id === requestId) {
      activeSearch = null;
    }

    return items;
  } catch (error) {
    if (isAbortError(error)) {
      app.update((state) => {
        const isActive = state.palette.stats.activeRequestId === requestId;
        return {
          ...state,
          palette: {
            ...state.palette,
            loading: isActive ? false : state.palette.loading,
            stats: {
              ...state.palette.stats,
              cancelled: state.palette.stats.cancelled + 1,
              activeRequestId: isActive ? null : state.palette.stats.activeRequestId,
            },
          },
        };
      });

      if (activeSearch?.id === requestId) {
        activeSearch = null;
      }

      return Object.freeze([]);
    }

    app.update((state) => ({
      ...state,
      palette: {
        ...state.palette,
        loading: false,
        lastAction: "Search failed",
        stats: {
          ...state.palette.stats,
          activeRequestId: null,
        },
      },
    }));

    if (activeSearch?.id === requestId) {
      activeSearch = null;
    }

    return Object.freeze([]);
  }
}

const paletteSources: readonly CommandSource[] = Object.freeze([
  {
    id: "files",
    name: "Files",
    getItems: (query) => searchPaletteFiles(query),
  },
  {
    id: "commands",
    name: "Commands",
    prefix: ">",
    getItems: (query) => buildCommandItems(query),
  },
]);

function closePalette(): void {
  cancelActiveSearch();
  app.update((state) => ({
    ...state,
    palette: {
      ...state.palette,
      open: false,
      query: "",
      selectedIndex: 0,
      loading: false,
      stats: {
        ...state.palette.stats,
        activeRequestId: null,
      },
    },
  }));
}

app.view((state) => {
  const entries = listEntries(state);
  const selected = entries[state.selected] ?? entries[0];
  const preview = selected?.preview || "Select a file to preview.";
  const activeRequest = state.palette.stats.activeRequestId
    ? `#${state.palette.stats.activeRequestId}`
    : "-";

  const columns: readonly TableColumn<Entry>[] = [
    {
      key: "name",
      header: "Name",
      flex: 2,
      minWidth: 18,
      sortable: true,
      render: (_, entry) =>
        ui.text(`${entry.type === "dir" ? "[D]" : "[F]"} ${entry.name}`, {
          fg: entry.type === "dir" ? colors.accent : colors.text,
          bold: entry.type === "dir",
        }),
    },
    {
      key: "type",
      header: "Type",
      width: 8,
      render: (_, entry) => ui.text(entry.type.toUpperCase(), { fg: colors.muted }),
    },
    {
      key: "size",
      header: "Size",
      width: 9,
      align: "right",
      render: (_, entry) => ui.text(entry.size, { fg: colors.text }),
    },
    {
      key: "modified",
      header: "Modified",
      width: 12,
      render: (_, entry) => ui.text(entry.modified, { fg: colors.text }),
    },
  ];

  const base = ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.row({ gap: 1, items: "center" }, [
        ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
        ui.badge("File Browser", { variant: "info" }),
        ui.badge(state.palette.open ? "Palette Open" : "Explorer", {
          variant: state.palette.open ? "warning" : "success",
        }),
      ]),
      ui.row({ gap: 2, items: "center" }, [
        ui.text(`Path: ${state.path}`, { fg: colors.accentSoft }),
        ui.text(`Opened: ${state.opened ?? "-"}`, { fg: colors.text }),
      ]),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Directory",
        [
          ui.table<Entry>({
            id: "file-table",
            columns,
            data: entries,
            getRowKey: (entry) => entry.name,
            selection: selected ? [selected.name] : [],
            selectionMode: "single",
            onSelectionChange: (keys) => {
              const key = keys[0];
              if (!key) return;

              app.update((current) => {
                const currentEntries = listEntries(current);
                const nextIndex = currentEntries.findIndex((entry) => entry.name === key);
                return nextIndex < 0 ? current : { ...current, selected: nextIndex };
              });
            },
            onRowPress: (entry) => {
              app.update((current) => openEntry(current, entry));
            },
            stripeStyle: { odd: colors.panelAlt },
            borderStyle: { variant: "rounded", color: colors.panelBorder },
          }),
        ],
        2,
      ),

      ui.column({ flex: 1, gap: 1, items: "stretch" }, [
        panel(
          "Details",
          [
            ui.column({ gap: 1 }, [
              ui.text(selected?.name ?? "-", { fg: colors.accent, bold: true }),
              ui.text(`Type: ${selected?.type ?? "-"}`),
              ui.text(`Size: ${selected?.size ?? "-"}`),
              ui.text(`Modified: ${selected?.modified ?? "-"}`),
              ui.divider({ char: "-" }),
              ui.text("Preview", { fg: colors.muted }),
              ui.text(preview),
            ]),
          ],
          2,
        ),

        panel(
          "Palette Telemetry",
          [
            ui.column({ gap: 1 }, [
              ui.row({ gap: 1 }, [
                ui.text("Hidden", { fg: colors.muted }),
                ui.text(state.showHidden ? "Visible" : "Hidden", {
                  fg: state.showHidden ? colors.warning : colors.text,
                }),
              ]),
              ui.row({ gap: 1 }, [
                ui.text("Requests", { fg: colors.muted }),
                ui.text(`${state.palette.stats.requests}`, { fg: colors.text }),
              ]),
              ui.row({ gap: 1 }, [
                ui.text("Completed", { fg: colors.muted }),
                ui.text(`${state.palette.stats.completed}`, { fg: colors.success }),
              ]),
              ui.row({ gap: 1 }, [
                ui.text("Cancelled", { fg: colors.muted }),
                ui.text(`${state.palette.stats.cancelled}`, { fg: colors.warning }),
              ]),
              ui.row({ gap: 1 }, [
                ui.text("Last latency", { fg: colors.muted }),
                ui.text(`${state.palette.stats.lastDurationMs} ms`, { fg: colors.text }),
              ]),
              ui.row({ gap: 1 }, [
                ui.text("In-flight", { fg: colors.muted }),
                ui.text(activeRequest, { fg: colors.info }),
              ]),
              ui.divider({ char: "-" }),
              ui.text(`Last action: ${state.palette.lastAction}`, { fg: colors.accentSoft }),
            ]),
          ],
          1,
        ),
      ]),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.footer, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text(state.palette.loading ? "Palette searching..." : "Explorer ready"),
        ui.row({ gap: 1 }, [
          ui.kbd(["up", "down"]),
          ui.text("Move"),
          ui.kbd("enter"),
          ui.text("Open"),
          ui.kbd("backspace"),
          ui.text("Up"),
          ui.kbd("h"),
          ui.text("Hidden"),
          ui.kbd("ctrl+p"),
          ui.text("Palette"),
          ui.kbd("tab"),
          ui.text("Source"),
          ui.kbd(">"),
          ui.text("Commands"),
          ui.kbd("q"),
          ui.text("Quit"),
        ]),
      ]),
    ]),
  ]);

  return ui.layers([
    base,
    ui.commandPalette({
      id: "command-palette",
      open: state.palette.open,
      query: state.palette.query,
      selectedIndex: state.palette.selectedIndex,
      loading: state.palette.loading,
      maxVisible: 12,
      placeholder: "Search files or type > for commands",
      frameStyle: {
        background: colors.panel,
        foreground: colors.text,
        border: colors.panelBorder,
      },
      sources: paletteSources,
      onQueryChange: (query) => {
        app.update((current) => ({
          ...current,
          palette: {
            ...current.palette,
            query,
            selectedIndex: 0,
          },
        }));
      },
      onSelectionChange: (selectedIndex) => {
        app.update((current) => ({
          ...current,
          palette: {
            ...current.palette,
            selectedIndex,
          },
        }));
      },
      onSelect: (item) => {
        const data = parsePaletteData(item.data);
        if (!data) return;

        app.update((current) => {
          if (data.kind === "path") {
            return openPathFromPalette(current, data.path, data.entryType);
          }

          return applyPaletteAction(current, data.action);
        });
      },
      onClose: () => {
        closePalette();
      },
    }),
  ]);
});

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
  up: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const entries = listEntries(state);
      return {
        ...state,
        selected: clamp(state.selected - 1, 0, Math.max(0, entries.length - 1)),
      };
    }),
  down: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const entries = listEntries(state);
      return {
        ...state,
        selected: clamp(state.selected + 1, 0, Math.max(0, entries.length - 1)),
      };
    }),
  k: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const entries = listEntries(state);
      return {
        ...state,
        selected: clamp(state.selected - 1, 0, Math.max(0, entries.length - 1)),
      };
    }),
  j: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const entries = listEntries(state);
      return {
        ...state,
        selected: clamp(state.selected + 1, 0, Math.max(0, entries.length - 1)),
      };
    }),
  h: () =>
    app.update((state) => {
      if (state.palette.open) return state;

      const showHidden = !state.showHidden;
      const entries = listEntriesAt(state.path, showHidden);
      return {
        ...state,
        showHidden,
        selected: clamp(state.selected, 0, Math.max(0, entries.length - 1)),
        palette: {
          ...state.palette,
          lastAction: showHidden ? "Hidden files shown" : "Hidden files hidden",
        },
      };
    }),
  backspace: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const nextPath = parentPath(state.path);
      return {
        ...state,
        path: nextPath,
        selected: 0,
        palette: {
          ...state.palette,
          lastAction: `Moved to ${nextPath}`,
        },
      };
    }),
  enter: () =>
    app.update((state) => {
      if (state.palette.open) return state;
      const entries = listEntries(state);
      const entry = entries[state.selected];
      if (!entry) return state;
      return openEntry(state, entry);
    }),
  "ctrl+p": () =>
    app.update((state) => ({
      ...state,
      palette: {
        ...state.palette,
        open: true,
        query: state.palette.open ? state.palette.query : "",
        selectedIndex: 0,
      },
    })),
});

try {
  await app.start();
} finally {
  cancelActiveSearch();
}
