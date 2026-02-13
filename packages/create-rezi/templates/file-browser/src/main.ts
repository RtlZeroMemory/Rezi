import { rgb, ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type EntryType = "dir" | "file";

type Entry = {
  name: string;
  type: EntryType;
  size: string;
  modified: string;
  preview: string;
};

type Tree = Record<string, Entry[]>;

const tree: Tree = {
  "/": [
    { name: "src", type: "dir", size: "-", modified: "2026-02-10", preview: "" },
    { name: "docs", type: "dir", size: "-", modified: "2026-02-08", preview: "" },
    {
      name: "package.json",
      type: "file",
      size: "2 KB",
      modified: "2026-02-07",
      preview: '{\n  "name": "__APP_NAME__"\n}',
    },
    { name: ".env", type: "file", size: "1 KB", modified: "2026-02-05", preview: "API_KEY=***" },
  ],
  "/src": [
    {
      name: "main.ts",
      type: "file",
      size: "4 KB",
      modified: "2026-02-10",
      preview: "import { createApp } from '@rezi-ui/core'",
    },
    { name: "components", type: "dir", size: "-", modified: "2026-02-09", preview: "" },
    { name: "styles", type: "dir", size: "-", modified: "2026-02-09", preview: "" },
  ],
  "/src/components": [
    {
      name: "Panel.ts",
      type: "file",
      size: "1 KB",
      modified: "2026-02-09",
      preview: "export function Panel() {}",
    },
    {
      name: "StatusBar.ts",
      type: "file",
      size: "1 KB",
      modified: "2026-02-09",
      preview: "export function StatusBar() {}",
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
  ],
  "/src/styles": [
    {
      name: "tokens.ts",
      type: "file",
      size: "2 KB",
      modified: "2026-02-08",
      preview: "export const colors = {}",
    },
  ],
};

const colors = {
  accent: rgb(120, 200, 255),
  muted: rgb(140, 150, 170),
  panel: rgb(18, 22, 34),
  panelAlt: rgb(22, 28, 44),
  ink: rgb(10, 14, 24),
};

type State = {
  path: string;
  selected: number;
  showHidden: boolean;
  opened: string | null;
};

const app = createNodeApp<State>({
  initialState: {
    path: "/",
    selected: 0,
    showHidden: false,
    opened: null,
  },
});

function clamp(value: number, min: number, max: number) {
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

function listEntries(state: State): Entry[] {
  const entries = tree[state.path] ?? [];
  if (state.showHidden) return entries;
  return entries.filter((entry) => !entry.name.startsWith("."));
}

function panel(title: string, children: ReturnType<typeof ui.column>[], flex = 1) {
  return ui.box(
    { title, flex, border: "rounded", px: 1, py: 0, style: { bg: colors.panel, fg: colors.muted } },
    children,
  );
}

app.view((state) => {
  const entries = listEntries(state);
  const selected = entries[state.selected];
  const preview = selected?.preview || "Select a file to preview.";

  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
      ui.text(`Path: ${state.path}`, { fg: colors.muted }),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Files",
        [
          ui.column(
            { gap: 0 },
            entries.map((entry, index) => {
              const active = index === state.selected;
              const prefix = active ? ">" : " ";
              const marker = entry.type === "dir" ? "[D]" : "[F]";
              return ui.text(`${prefix} ${marker} ${entry.name}`, {
                key: entry.name,
                style: {
                  fg: active ? colors.accent : colors.muted,
                  bold: active,
                },
              });
            }),
          ),
        ],
        1,
      ),

      panel(
        "Details",
        [
          ui.column({ gap: 1 }, [
            ui.text(selected ? selected.name : "-", { fg: colors.accent, bold: true }),
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
        "Pinned",
        [
          ui.column({ gap: 1 }, [
            ui.text("Last opened", { fg: colors.muted }),
            ui.text(state.opened ?? "-"),
            ui.text(""),
            ui.text("Hidden files"),
            ui.text(state.showHidden ? "Visible" : "Hidden"),
          ]),
        ],
        1,
      ),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text("File browser ready"),
        ui.row({ gap: 1 }, [
          ui.kbd("up"),
          ui.text("Move"),
          ui.kbd("enter"),
          ui.text("Open"),
          ui.kbd("backspace"),
          ui.text("Up"),
          ui.kbd("h"),
          ui.text("Hidden"),
          ui.kbd("q"),
          ui.text("Quit"),
        ]),
      ]),
    ]),
  ]);
});

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
  up: () =>
    app.update((s) => {
      const entries = listEntries(s);
      return { ...s, selected: clamp(s.selected - 1, 0, Math.max(0, entries.length - 1)) };
    }),
  down: () =>
    app.update((s) => {
      const entries = listEntries(s);
      return { ...s, selected: clamp(s.selected + 1, 0, Math.max(0, entries.length - 1)) };
    }),
  k: () =>
    app.update((s) => {
      const entries = listEntries(s);
      return { ...s, selected: clamp(s.selected - 1, 0, Math.max(0, entries.length - 1)) };
    }),
  j: () =>
    app.update((s) => {
      const entries = listEntries(s);
      return { ...s, selected: clamp(s.selected + 1, 0, Math.max(0, entries.length - 1)) };
    }),
  h: () => app.update((s) => ({ ...s, showHidden: !s.showHidden, selected: 0 })),
  backspace: () =>
    app.update((s) => ({
      ...s,
      path: parentPath(s.path),
      selected: 0,
    })),
  enter: () =>
    app.update((s) => {
      const entries = listEntries(s);
      const entry = entries[s.selected];
      if (!entry) return s;
      if (entry.type === "dir") {
        return { ...s, path: joinPath(s.path, entry.name), selected: 0 };
      }
      return { ...s, opened: joinPath(s.path, entry.name) };
    }),
});

await app.start();
