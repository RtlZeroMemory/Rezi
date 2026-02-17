import { type VNode, createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type StreamStatus = "healthy" | "unstable" | "critical";

type StreamSnapshot = Readonly<{
  index: number;
  name: string;
  region: string;
  category: string;
  viewers: number;
  bitrate: number;
  latency: number;
  droppedFrames: number;
  status: StreamStatus;
}>;

type State = {
  selectedRow: number;
  paused: boolean;
  follow: boolean;
  liveTick: number;
  ingestPerSecond: number;
  scrollTop: number;
  visibleRange: [number, number];
  feed: readonly string[];
  statusLine: string;
};

const STREAM_COUNT = 15360;
const LIVE_TICK_MS = 260;
const LIVE_FEED_LIMIT = 12;

const regions = ["us-east", "us-west", "eu-central", "ap-south", "sa-east"] as const;
const categories = ["Urban", "Nature", "Transit", "Retail", "Industrial", "Campus"] as const;

const streamIndexes: readonly number[] = Object.freeze(
  Array.from({ length: STREAM_COUNT }, (_value, index) => index),
);

const initialFeed: readonly string[] = Object.freeze([
  "00:00.0 ingest connected",
  "00:00.0 receiving edge events",
  "00:00.0 virtual list warm and ready",
]);

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: {
    selectedRow: 0,
    paused: false,
    follow: true,
    liveTick: 0,
    ingestPerSecond: 480,
    scrollTop: 0,
    visibleRange: [0, 0],
    feed: initialFeed,
    statusLine: "Live ingest started",
  },
});

const colors = {
  accent: rgb(112, 205, 248),
  muted: rgb(139, 151, 173),
  panel: rgb(17, 23, 34),
  panelAlt: rgb(22, 30, 45),
  ink: rgb(8, 12, 20),
  inkSoft: rgb(34, 42, 60),
  ok: rgb(120, 214, 163),
  warn: rgb(249, 190, 114),
  danger: rgb(255, 122, 124),
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function clockLabel(tick: number): string {
  const totalMs = tick * LIVE_TICK_MS;
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes}:${seconds}.${String(tenths)}`;
}

function statusColor(status: StreamStatus) {
  if (status === "healthy") return colors.ok;
  if (status === "unstable") return colors.warn;
  return colors.danger;
}

function streamSnapshot(index: number, tick: number): StreamSnapshot {
  const safeIndex = clamp(index, 0, STREAM_COUNT - 1);
  const region = regions[safeIndex % regions.length] ?? "us-east";
  const category = categories[safeIndex % categories.length] ?? "Urban";
  const name = `${category.toLowerCase()}-${String(safeIndex).padStart(5, "0")}`;

  const viewersBase = 220 + ((safeIndex * 113) % 9400);
  const viewersWave = Math.round((Math.sin((tick + safeIndex) / 9) + 1) * 130);
  const viewers = viewersBase + viewersWave;

  const bitrateBase = 2.2 + (safeIndex % 9) * 0.45;
  const bitrateWave = Math.sin((tick + safeIndex) / 13) * 0.35;
  const bitrate = Math.max(1.1, Number((bitrateBase + bitrateWave).toFixed(2)));

  const latencyBase = 16 + (safeIndex % 48);
  const latencyWave = Math.round((Math.cos((tick + safeIndex) / 7) + 1) * 8);
  const latency = latencyBase + latencyWave;

  const dropDrift = Math.round((Math.sin((tick + safeIndex * 3) / 15) + 1) * 1.8);
  const droppedFrames = Math.max(0, dropDrift - (safeIndex % 3 === 0 ? 1 : 0));

  const status: StreamStatus =
    droppedFrames >= 3 || latency > 68
      ? "critical"
      : droppedFrames >= 1 || latency > 52
        ? "unstable"
        : "healthy";

  return {
    index: safeIndex,
    name,
    region,
    category,
    viewers,
    bitrate,
    latency,
    droppedFrames,
    status,
  };
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

function pushFeed(state: Readonly<State>, line: string): readonly string[] {
  return Object.freeze([line, ...state.feed].slice(0, LIVE_FEED_LIMIT));
}

app.view((state) => {
  const selected = streamSnapshot(state.selectedRow, state.liveTick);
  const quality = Math.max(0.05, 1 - selected.droppedFrames / 4);
  const bitratePercent = Math.min(1, selected.bitrate / 8);
  const visibleStart = state.visibleRange[0];
  const visibleEnd = Math.max(visibleStart, state.visibleRange[1] - 1);

  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
      ui.row({ gap: 2, items: "center" }, [
        ui.text(`Mode: ${state.paused ? "Paused" : "Live"}`, {
          fg: state.paused ? colors.warn : colors.ok,
          bold: true,
        }),
        ui.text(`Follow: ${state.follow ? "On" : "Off"}`, {
          fg: state.follow ? colors.accent : colors.muted,
        }),
        ui.text(`Ingest: ${formatCount(state.ingestPerSecond)}/s`, { fg: colors.muted }),
      ]),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Global Stream Index (15,360 streams)",
        [
          ui.column({ flex: 1, gap: 1, items: "stretch" }, [
            ui.row({ justify: "between", items: "center" }, [
              ui.text(`Visible rows: ${String(visibleStart)}-${String(visibleEnd)}`),
              ui.text(`Scroll: ${String(state.scrollTop)}`, { fg: colors.muted }),
            ]),
            ui.virtualList({
              id: "streams-vlist",
              items: streamIndexes,
              itemHeight: 1,
              overscan: 6,
              renderItem: (item, index, focused) => {
                const snapshot = streamSnapshot(item, state.liveTick);
                const active = index === state.selectedRow;
                return ui.row(
                  {
                    key: `stream-${String(item)}`,
                    gap: 1,
                    style: active
                      ? { bg: colors.inkSoft, fg: colors.accent }
                      : { fg: colors.muted },
                  },
                  [
                    ui.text(active ? ">" : " "),
                    ui.text(snapshot.name, { bold: active }),
                    ui.text(snapshot.region, { fg: colors.muted }),
                    ui.text(`${formatCount(snapshot.viewers)} viewers`),
                    ui.text(`${String(snapshot.latency)}ms`, {
                      fg: snapshot.latency > 58 ? colors.warn : colors.muted,
                    }),
                    ui.text(snapshot.status.toUpperCase(), {
                      fg: statusColor(snapshot.status),
                      bold: focused || snapshot.status !== "healthy",
                    }),
                  ],
                );
              },
              onScroll: (scrollTop, visibleRange) =>
                app.update((s) => {
                  if (
                    s.scrollTop === scrollTop &&
                    s.visibleRange[0] === visibleRange[0] &&
                    s.visibleRange[1] === visibleRange[1]
                  ) {
                    return s;
                  }
                  return {
                    ...s,
                    scrollTop,
                    visibleRange: [visibleRange[0], visibleRange[1]],
                  };
                }),
              onSelect: (_item, index) =>
                app.update((s) => {
                  const snapshot = streamSnapshot(index, s.liveTick);
                  return {
                    ...s,
                    selectedRow: index,
                    feed: pushFeed(s, `${clockLabel(s.liveTick)} pinned ${snapshot.name}`),
                    statusLine: `Pinned ${snapshot.name}`,
                  };
                }),
            }),
          ]),
        ],
        2,
      ),

      ui.column({ flex: 1, gap: 1, items: "stretch" }, [
        panel(
          "Selected Stream",
          [
            ui.column({ gap: 1 }, [
              ui.text(selected.name, { fg: colors.accent, bold: true }),
              ui.row({ gap: 2 }, [
                ui.text(`Region: ${selected.region}`),
                ui.text(`Category: ${selected.category}`),
              ]),
              ui.row({ gap: 2 }, [
                ui.text(`Viewers: ${formatCount(selected.viewers)}`),
                ui.text(`Latency: ${String(selected.latency)}ms`, {
                  fg: selected.latency > 58 ? colors.warn : colors.ok,
                }),
              ]),
              ui.text(`Status: ${selected.status.toUpperCase()}`, {
                fg: statusColor(selected.status),
                bold: true,
              }),
              ui.progress(bitratePercent, { label: "Bitrate headroom", showPercent: true }),
              ui.progress(quality, { label: "Frame quality", showPercent: true }),
            ]),
          ],
          1,
        ),
        panel(
          "Live Feed Context",
          [
            ui.column({ gap: 1 }, [
              ui.text(state.follow ? "Following pinned stream" : "Sampling global ingest", {
                fg: colors.muted,
              }),
              ...state.feed.map((line, index) =>
                ui.text(line, {
                  key: `feed-${String(index)}`,
                  style: { fg: index === 0 ? colors.accent : colors.muted },
                }),
              ),
            ]),
          ],
          1,
        ),
      ]),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text(state.statusLine),
        ui.row({ gap: 1 }, [
          ui.kbd("tab"),
          ui.text("Focus list"),
          ui.kbd(["up", "down"]),
          ui.text("Scroll"),
          ui.kbd(["pageup", "pagedown"]),
          ui.text("Fast scroll"),
          ui.kbd("enter"),
          ui.text("Pin"),
          ui.kbd("up"),
          ui.text("Navigate"),
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
  space: () =>
    app.update((s) => ({
      ...s,
      paused: !s.paused,
      statusLine: s.paused ? "Ingest resumed" : "Ingest paused",
    })),
  f: () =>
    app.update((s) => ({
      ...s,
      follow: !s.follow,
      statusLine: s.follow ? "Follow mode disabled" : "Follow mode enabled",
    })),
  "ctrl+l": () =>
    app.update((s) => ({
      ...s,
      feed: initialFeed,
      statusLine: "Live feed reset",
    })),
});

const liveTimer = setInterval(() => {
  app.update((state) => {
    if (state.paused) return state;

    const nextTick = state.liveTick + 1;
    const eventIndex = state.follow ? state.selectedRow : (nextTick * 17) % STREAM_COUNT;
    const snapshot = streamSnapshot(eventIndex, nextTick);
    const eventLine = `${clockLabel(nextTick)} ${snapshot.name} ${snapshot.status.toUpperCase()} ${
      snapshot.latency
    }ms`;

    return {
      ...state,
      liveTick: nextTick,
      ingestPerSecond: 360 + ((nextTick * 31) % 340),
      feed: pushFeed(state, eventLine),
      statusLine: state.follow ? `Following ${snapshot.name}` : "Sampling global ingest stream",
    };
  });
}, LIVE_TICK_MS);

try {
  await app.start();
} finally {
  clearInterval(liveTimer);
}
