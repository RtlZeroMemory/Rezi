import { rgb, ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type ServiceStatus = "healthy" | "warning" | "down";

type Service = {
  name: string;
  region: string;
  status: ServiceStatus;
  latencyMs: number;
  errorRate: number;
};

const services: readonly Service[] = [
  { name: "Auth Gateway", region: "us-east", status: "healthy", latencyMs: 18, errorRate: 0.2 },
  { name: "Billing", region: "us-west", status: "warning", latencyMs: 74, errorRate: 1.7 },
  { name: "Search", region: "eu-central", status: "healthy", latencyMs: 32, errorRate: 0.4 },
  { name: "Realtime", region: "ap-south", status: "warning", latencyMs: 96, errorRate: 2.1 },
  { name: "Exports", region: "us-east", status: "down", latencyMs: 0, errorRate: 9.4 },
];

const incidents = [
  "Exports queue is backing up (ETA 15m)",
  "Realtime jitter above 90ms in ap-south",
  "Billing retries spiked 2x from baseline",
];

const activity = [
  "Deploy #491 rolled to 50%",
  "Cache warm-up completed",
  "Latency budget tightened to 80ms",
  "Tracing sampling bumped to 20%",
];

type Filter = "all" | "healthy" | "warning" | "down";

type State = {
  selected: number;
  filter: Filter;
  pinned: string | null;
  showHelp: boolean;
};

const app = createNodeApp<State>({
  initialState: {
    selected: 0,
    filter: "all",
    pinned: null,
    showHelp: false,
  },
});

const colors = {
  accent: rgb(120, 200, 255),
  muted: rgb(140, 150, 170),
  panel: rgb(18, 22, 34),
  panelAlt: rgb(22, 28, 44),
  ok: rgb(120, 220, 160),
  warn: rgb(255, 190, 120),
  down: rgb(255, 120, 140),
  ink: rgb(10, 14, 24),
  inkSoft: rgb(30, 36, 54),
};

function statusColor(status: ServiceStatus) {
  if (status === "healthy") return colors.ok;
  if (status === "warning") return colors.warn;
  return colors.down;
}

function filterServices(filter: Filter): Service[] {
  if (filter === "all") return [...services];
  return services.filter((svc) => svc.status === filter);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function panel(title: string, children: ReturnType<typeof ui.column>[], flex = 1) {
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

app.view((state) => {
  const visible = filterServices(state.filter);
  const selected = visible[state.selected] ?? visible[0] ?? services[0];
  const pinned = state.pinned ?? selected?.name ?? "-";

  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
      ui.row({ gap: 2, items: "center" }, [
        ui.text("Filter", { fg: colors.muted }),
        ui.text(state.filter.toUpperCase(), { fg: colors.accent, bold: true }),
        ui.text("Pinned", { fg: colors.muted }),
        ui.text(pinned, { fg: colors.ok, bold: true }),
      ]),
    ]),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Services",
        [
          ui.column(
            { gap: 0 },
            visible.map((svc, index) => {
              const active = index === state.selected;
              return ui.row(
                {
                  key: svc.name,
                  gap: 1,
                  style: active ? { bg: colors.inkSoft, fg: colors.accent } : { fg: colors.muted },
                },
                [
                  ui.text(active ? ">" : " "),
                  ui.text(svc.name, { bold: active }),
                  ui.text(`(${svc.region})`, { fg: colors.muted }),
                  ui.text(svc.status.toUpperCase(), {
                    fg: statusColor(svc.status),
                    bold: true,
                  }),
                ],
              );
            }),
          ),
        ],
        1,
      ),

      panel(
        "Service Health",
        [
          ui.column({ gap: 1 }, [
            ui.text(selected ? selected.name : "-", { fg: colors.accent, bold: true }),
            ui.row({ gap: 2 }, [
              ui.text(`Latency: ${selected ? selected.latencyMs : "-"} ms`),
              ui.text(`Errors: ${selected ? selected.errorRate : "-"}%`, {
                fg: selected && selected.errorRate > 2 ? colors.warn : colors.muted,
              }),
            ]),
            ui.divider({ char: "-" }),
            ui.text("Active incidents", { fg: colors.muted }),
            ...incidents.map((line) => ui.text(`- ${line}`)),
          ]),
        ],
        2,
      ),

      panel(
        "Activity",
        [
          ui.column({ gap: 1 }, [
            ui.text("Recent deploys", { fg: colors.muted }),
            ...activity.map((line) => ui.text(`- ${line}`)),
            ui.divider({ char: "-" }),
            ui.text("Escalations", { fg: colors.muted }),
            ui.text("- On-call rotation starts in 2h"),
            ui.text("- 3 alerts awaiting acknowledgement"),
          ]),
        ],
        1,
      ),
    ]),

    state.showHelp
      ? ui.box(
          {
            border: "rounded",
            px: 1,
            py: 0,
            style: { bg: colors.panelAlt, fg: colors.muted },
          },
          [
            ui.row({ gap: 1 }, [
              ui.kbd(["up", "down"]),
              ui.text("Move"),
              ui.kbd("f"),
              ui.text("Filter"),
              ui.kbd("enter"),
              ui.text("Pin"),
              ui.kbd("?"),
              ui.text("Help"),
              ui.kbd("q"),
              ui.text("Quit"),
            ]),
          ],
        )
      : ui.box({ px: 1, py: 0, style: { bg: colors.ink, fg: colors.muted } }, [
          ui.row({ justify: "between", items: "center" }, [
            ui.text("Status: nominal"),
            ui.row({ gap: 1 }, [
              ui.kbd("up/down"),
              ui.text("Move"),
              ui.kbd("f"),
              ui.text("Filter"),
              ui.kbd("?"),
              ui.text("Help"),
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
      const list = filterServices(s.filter);
      return { ...s, selected: clamp(s.selected - 1, 0, Math.max(0, list.length - 1)) };
    }),
  down: () =>
    app.update((s) => {
      const list = filterServices(s.filter);
      return { ...s, selected: clamp(s.selected + 1, 0, Math.max(0, list.length - 1)) };
    }),
  k: () =>
    app.update((s) => {
      const list = filterServices(s.filter);
      return { ...s, selected: clamp(s.selected - 1, 0, Math.max(0, list.length - 1)) };
    }),
  j: () =>
    app.update((s) => {
      const list = filterServices(s.filter);
      return { ...s, selected: clamp(s.selected + 1, 0, Math.max(0, list.length - 1)) };
    }),
  f: () =>
    app.update((s) => {
      const next: Filter =
        s.filter === "all"
          ? "warning"
          : s.filter === "warning"
            ? "healthy"
            : s.filter === "healthy"
              ? "down"
              : "all";
      return { ...s, filter: next, selected: 0 };
    }),
  enter: () =>
    app.update((s) => {
      const list = filterServices(s.filter);
      const svc = list[s.selected];
      return { ...s, pinned: svc ? svc.name : s.pinned };
    }),
  "?": () => app.update((s) => ({ ...s, showHelp: !s.showHelp })),
});

await app.start();
