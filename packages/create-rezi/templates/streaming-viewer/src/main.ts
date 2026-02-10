import { createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type Stream = {
  name: string;
  category: string;
  viewers: number;
  bitrate: number;
  health: "good" | "warning";
};

const streams: readonly Stream[] = [
  { name: "city-cam-01", category: "Urban", viewers: 1280, bitrate: 6.4, health: "good" },
  { name: "forest-node", category: "Nature", viewers: 860, bitrate: 4.8, health: "good" },
  { name: "harbor-live", category: "Maritime", viewers: 420, bitrate: 3.9, health: "warning" },
  { name: "lab-monitor", category: "Science", viewers: 96, bitrate: 2.1, health: "good" },
];

const chatByStream: Record<string, string[]> = {
  "city-cam-01": ["switch to night mode?", "pan left a bit", "traffic spike @ 18:00"],
  "forest-node": ["birdsong level: high", "new fox spotted", "wind noise up"],
  "harbor-live": ["dock 3 unloading", "signal jitter", "fog incoming"],
  "lab-monitor": ["temperature stable", "note: calibrate sensor", "airflow normal"],
};

type State = {
  selected: number;
  paused: boolean;
  follow: boolean;
};

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: {
    selected: 0,
    paused: false,
    follow: true,
  },
});

const colors = {
  accent: rgb(116, 200, 255),
  muted: rgb(140, 150, 170),
  panel: rgb(18, 22, 34),
  panelAlt: rgb(22, 28, 44),
  ok: rgb(130, 220, 170),
  warn: rgb(255, 180, 120),
  ink: rgb(10, 14, 24),
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function panel(title: string, children: ReturnType<typeof ui.column>[], flex = 1) {
  return ui.box(
    { title, flex, border: "rounded", px: 1, py: 0, style: { bg: colors.panel, fg: colors.muted } },
    children,
  );
}

app.view((state) => {
  const current = streams[state.selected] ?? streams[0];
  const chat = chatByStream[current?.name ?? ""] ?? [];
  const bufferValue = state.paused ? 0.2 : current ? Math.min(1, current.bitrate / 7) : 0;

  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
      ui.row({ gap: 2 }, [
        ui.text(`Mode: ${state.paused ? "Paused" : "Live"}`, {
          fg: state.paused ? colors.warn : colors.ok,
          bold: true,
        }),
        ui.text(`Follow: ${state.follow ? "On" : "Off"}`, { fg: colors.muted }),
      ]),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Streams",
        [
          ui.column(
            { gap: 0 },
            streams.map((stream, index) => {
              const active = index === state.selected;
              const prefix = active ? ">" : " ";
              return ui.text(`${prefix} ${stream.name}`, {
                key: stream.name,
                fg: active ? colors.accent : colors.muted,
                bold: active,
              });
            }),
          ),
        ],
        1,
      ),

      ui.column({ flex: 2, gap: 1, items: "stretch" }, [
        panel(
          "Viewer",
          [
            ui.column({ gap: 1 }, [
              ui.text(current ? current.name : "-", { fg: colors.accent, bold: true }),
              ui.text(`Category: ${current?.category ?? "-"}`),
              ui.text(`Viewers: ${current?.viewers ?? 0}`),
              ui.text(`Health: ${current?.health ?? "-"}`, {
                fg: current?.health === "warning" ? colors.warn : colors.ok,
              }),
              ui.text(`Bitrate: ${current?.bitrate ?? 0} Mbps`),
              ui.progress(bufferValue, { label: "Buffer", showPercent: true }),
            ]),
          ],
          1,
        ),
        panel(
          "Chat",
          [
            ui.column({ gap: 1 }, [
              ui.text("Live chat", { fg: colors.muted }),
              ...chat.map((line) => ui.text(`- ${line}`)),
            ]),
          ],
          1,
        ),
      ]),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text("Streaming console ready"),
        ui.row({ gap: 1 }, [
          ui.kbd("up"),
          ui.text("Stream"),
          ui.kbd("space"),
          ui.text("Pause"),
          ui.kbd("f"),
          ui.text("Follow"),
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
    app.update((s) => ({
      ...s,
      selected: clamp(s.selected - 1, 0, streams.length - 1),
    })),
  down: () =>
    app.update((s) => ({
      ...s,
      selected: clamp(s.selected + 1, 0, streams.length - 1),
    })),
  k: () =>
    app.update((s) => ({
      ...s,
      selected: clamp(s.selected - 1, 0, streams.length - 1),
    })),
  j: () =>
    app.update((s) => ({
      ...s,
      selected: clamp(s.selected + 1, 0, streams.length - 1),
    })),
  space: () => app.update((s) => ({ ...s, paused: !s.paused })),
  f: () => app.update((s) => ({ ...s, follow: !s.follow })),
});

await app.start();
