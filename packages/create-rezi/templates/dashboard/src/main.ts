import type { BadgeVariant, TableColumn, VNode } from "@rezi-ui/core";
import { createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type ServiceStatus = "healthy" | "warning" | "down";
type Filter = "all" | ServiceStatus;
type SortKey = "name" | "latencyMs" | "errorRate" | "trafficRpm";
type SortDirection = "asc" | "desc";

type Service = {
  id: string;
  name: string;
  region: string;
  tier: "edge" | "core" | "stateful";
  status: ServiceStatus;
  latencyMs: number;
  errorRate: number;
  trafficRpm: number;
  saturation: number;
  history: readonly number[];
};

type Incident = {
  id: number;
  at: string;
  severity: "info" | "warn" | "critical";
  message: string;
};

type State = {
  services: readonly Service[];
  selectedId: string;
  pinnedId: string | null;
  filter: Filter;
  sort: SortKey;
  sortDirection: SortDirection;
  paused: boolean;
  debug: boolean;
  ticks: number;
  updatesApplied: number;
  incidents: readonly Incident[];
  nextIncidentId: number;
  startedAt: number;
  lastUpdateAt: number;
};

function timeStamp(date = new Date()): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

const seedServices = [
  {
    id: "auth",
    name: "Auth Gateway",
    region: "us-east-1",
    tier: "edge",
    status: "healthy",
    latencyMs: 22,
    errorRate: 0.18,
    trafficRpm: 14250,
    saturation: 41,
  },
  {
    id: "billing",
    name: "Billing API",
    region: "us-west-2",
    tier: "stateful",
    status: "warning",
    latencyMs: 84,
    errorRate: 1.12,
    trafficRpm: 7340,
    saturation: 66,
  },
  {
    id: "search",
    name: "Search Index",
    region: "eu-central-1",
    tier: "core",
    status: "healthy",
    latencyMs: 36,
    errorRate: 0.32,
    trafficRpm: 9860,
    saturation: 52,
  },
  {
    id: "realtime",
    name: "Realtime Fanout",
    region: "ap-south-1",
    tier: "core",
    status: "warning",
    latencyMs: 98,
    errorRate: 1.92,
    trafficRpm: 12320,
    saturation: 79,
  },
  {
    id: "exports",
    name: "Export Workers",
    region: "us-east-1",
    tier: "stateful",
    status: "down",
    latencyMs: 0,
    errorRate: 8.4,
    trafficRpm: 640,
    saturation: 97,
  },
  {
    id: "notify",
    name: "Notification Bus",
    region: "eu-west-1",
    tier: "edge",
    status: "healthy",
    latencyMs: 31,
    errorRate: 0.27,
    trafficRpm: 8110,
    saturation: 48,
  },
] as const satisfies readonly Omit<Service, "history">[];

const initialServices: readonly Service[] = Object.freeze(
  seedServices.map((service) => ({
    ...service,
    history: Object.freeze(Array.from({ length: 18 }, () => service.latencyMs)),
  })),
);

const initialIncidents: readonly Incident[] = Object.freeze([
  {
    id: 1,
    at: timeStamp(),
    severity: "critical",
    message: "Export Workers entered fail-safe mode after queue timeout.",
  },
  {
    id: 2,
    at: timeStamp(),
    severity: "warn",
    message: "Realtime Fanout jitter exceeded 90 ms in ap-south-1.",
  },
  {
    id: 3,
    at: timeStamp(),
    severity: "info",
    message: "Deploy #491 fully rolled out with canary checks passing.",
  },
]);

const colors = {
  accent: rgb(96, 214, 255),
  accentSoft: rgb(130, 176, 255),
  muted: rgb(134, 148, 176),
  text: rgb(214, 225, 245),
  panel: rgb(13, 20, 33),
  panelAlt: rgb(18, 28, 44),
  panelBorder: rgb(62, 78, 107),
  footer: rgb(8, 13, 22),
  healthy: rgb(110, 223, 159),
  warning: rgb(255, 196, 108),
  down: rgb(255, 119, 139),
  info: rgb(123, 194, 255),
};

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: {
    services: initialServices,
    selectedId: initialServices[0]?.id ?? "",
    pinnedId: null,
    filter: "all",
    sort: "latencyMs",
    sortDirection: "desc",
    paused: false,
    debug: false,
    ticks: 0,
    updatesApplied: 0,
    incidents: initialIncidents,
    nextIncidentId: 4,
    startedAt: Date.now(),
    lastUpdateAt: Date.now(),
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTraffic(rpm: number): string {
  if (rpm >= 1000) return `${(rpm / 1000).toFixed(1)}k`;
  return `${rpm}`;
}

function statusColor(status: ServiceStatus) {
  if (status === "healthy") return colors.healthy;
  if (status === "warning") return colors.warning;
  return colors.down;
}

function severityColor(severity: Incident["severity"]) {
  if (severity === "critical") return colors.down;
  if (severity === "warn") return colors.warning;
  return colors.info;
}

function statusBadge(status: ServiceStatus): { text: string; variant: BadgeVariant } {
  if (status === "healthy") return { text: "Healthy", variant: "success" };
  if (status === "warning") return { text: "At Risk", variant: "warning" };
  return { text: "Critical", variant: "error" };
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

function applyFilter(services: readonly Service[], filter: Filter): Service[] {
  if (filter === "all") return [...services];
  return services.filter((service) => service.status === filter);
}

function sortServices(
  services: readonly Service[],
  sort: SortKey,
  direction: SortDirection,
): Service[] {
  const directionWeight = direction === "asc" ? 1 : -1;
  const sorted = [...services].sort((a, b) => {
    let baseComparison = 0;

    if (sort === "name") {
      baseComparison = a.name.localeCompare(b.name);
    } else if (sort === "latencyMs") {
      baseComparison = a.latencyMs - b.latencyMs;
    } else if (sort === "errorRate") {
      baseComparison = a.errorRate - b.errorRate;
    } else {
      baseComparison = a.trafficRpm - b.trafficRpm;
    }

    if (baseComparison === 0) {
      baseComparison = a.name.localeCompare(b.name);
    }

    return baseComparison * directionWeight;
  });

  return sorted;
}

function visibleServicesFor(
  services: readonly Service[],
  filter: Filter,
  sort: SortKey,
  direction: SortDirection,
): Service[] {
  return sortServices(applyFilter(services, filter), sort, direction);
}

function selectedFromVisible(visible: readonly Service[], selectedId: string): Service | undefined {
  return visible.find((service) => service.id === selectedId) ?? visible[0];
}

function moveSelection(state: State, delta: number): State {
  const visible = visibleServicesFor(state.services, state.filter, state.sort, state.sortDirection);
  if (visible.length === 0) return state;

  const currentIndex = visible.findIndex((service) => service.id === state.selectedId);
  const nextIndex = clamp((currentIndex < 0 ? 0 : currentIndex) + delta, 0, visible.length - 1);
  const next = visible[nextIndex];
  if (!next) return state;

  return { ...state, selectedId: next.id };
}

function cycleFilter(filter: Filter): Filter {
  if (filter === "all") return "warning";
  if (filter === "warning") return "down";
  if (filter === "down") return "healthy";
  return "all";
}

function defaultDirectionForSort(sort: SortKey): SortDirection {
  return sort === "name" ? "asc" : "desc";
}

function cycleSort(sort: SortKey): SortKey {
  const sequence: readonly SortKey[] = ["latencyMs", "errorRate", "trafficRpm", "name"];
  const index = sequence.indexOf(sort);
  const nextIndex = index < 0 ? 0 : (index + 1) % sequence.length;
  const fallback: SortKey = "latencyMs";
  return sequence[nextIndex] ?? fallback;
}

function toSortKey(value: string): SortKey | null {
  if (value === "name") return "name";
  if (value === "latencyMs") return "latencyMs";
  if (value === "errorRate") return "errorRate";
  if (value === "trafficRpm") return "trafficRpm";
  return null;
}

function deriveStatus(latencyMs: number, errorRate: number, saturation: number): ServiceStatus {
  if (errorRate >= 4.2 || saturation >= 95 || latencyMs >= 180) {
    return "down";
  }
  if (errorRate >= 1.4 || saturation >= 82 || latencyMs >= 95) {
    return "warning";
  }
  return "healthy";
}

function pushHistory(history: readonly number[], latencyMs: number): readonly number[] {
  const next = [...history, latencyMs].slice(-18);
  return Object.freeze(next);
}

function simulateTick(state: State): State {
  const nextTick = state.ticks + 1;
  if (state.paused) {
    return { ...state, ticks: nextTick };
  }

  let nextIncidentId = state.nextIncidentId;
  const freshIncidents: Incident[] = [];

  const addIncident = (severity: Incident["severity"], message: string): void => {
    freshIncidents.push({
      id: nextIncidentId,
      at: timeStamp(),
      severity,
      message,
    });
    nextIncidentId += 1;
  };

  const nextServices = state.services.map((service, index) => {
    const wave = Math.sin(nextTick * 0.65 + index * 1.7);
    const burst = Math.cos(nextTick * 0.35 + index * 0.9);

    const latencyMs = clamp(
      Math.round(service.latencyMs + wave * 8 + burst * 3 + (Math.random() - 0.5) * 14),
      12,
      280,
    );

    const errorRate = clamp(
      round2(service.errorRate + wave * 0.16 + (Math.random() - 0.5) * 0.28),
      0.05,
      9.9,
    );

    const trafficRpm = clamp(
      Math.round(service.trafficRpm + burst * 380 + (Math.random() - 0.5) * 560),
      400,
      32000,
    );

    const saturation = clamp(
      Math.round(service.saturation + wave * 4 + (Math.random() - 0.5) * 6),
      20,
      99,
    );

    const status = deriveStatus(latencyMs, errorRate, saturation);

    if (status !== service.status) {
      const transition = `${service.name} ${service.status.toUpperCase()} -> ${status.toUpperCase()}`;
      addIncident(
        status === "down" ? "critical" : status === "warning" ? "warn" : "info",
        transition,
      );
    }

    if (latencyMs >= 150 && status !== "down" && Math.random() > 0.9) {
      addIncident("warn", `${service.name} crossed ${latencyMs} ms latency budget.`);
    }

    return {
      ...service,
      status,
      latencyMs,
      errorRate,
      trafficRpm,
      saturation,
      history: pushHistory(service.history, latencyMs),
    };
  });

  if (nextTick % 7 === 0 && nextServices.length > 0) {
    const hottest = nextServices.reduce((current, candidate) =>
      candidate.saturation > current.saturation ? candidate : current,
    );
    addIncident("info", `${hottest.name} saturation now ${hottest.saturation}%.`);
  }

  const visible = visibleServicesFor(nextServices, state.filter, state.sort, state.sortDirection);
  const selected = selectedFromVisible(visible, state.selectedId) ?? nextServices[0];

  return {
    ...state,
    services: nextServices,
    selectedId: selected ? selected.id : state.selectedId,
    ticks: nextTick,
    updatesApplied: state.updatesApplied + 1,
    incidents: Object.freeze([...freshIncidents, ...state.incidents].slice(0, 10)),
    nextIncidentId,
    lastUpdateAt: Date.now(),
  };
}

app.view((state) => {
  const visible = visibleServicesFor(state.services, state.filter, state.sort, state.sortDirection);
  const selected = selectedFromVisible(visible, state.selectedId) ?? state.services[0];
  const pinned = state.pinnedId
    ? (state.services.find((service) => service.id === state.pinnedId) ?? null)
    : null;

  const healthyCount = state.services.filter((service) => service.status === "healthy").length;
  const warningCount = state.services.filter((service) => service.status === "warning").length;
  const downCount = state.services.filter((service) => service.status === "down").length;

  const overallStatus: ServiceStatus =
    downCount > 0 ? "down" : warningCount > 0 ? "warning" : "healthy";

  const overallBadge = statusBadge(overallStatus);

  const uptimeSeconds = Math.max(1, Math.floor((Date.now() - state.startedAt) / 1000));
  const updateRate = state.updatesApplied / uptimeSeconds;
  const stalenessMs = Date.now() - state.lastUpdateAt;

  const tableColumns: readonly TableColumn<Service>[] = [
    {
      key: "name",
      header: "Service",
      flex: 2,
      minWidth: 18,
      sortable: true,
      render: (_, row) => {
        const pinnedRow = row.id === state.pinnedId;
        return ui.text(`${pinnedRow ? "* " : ""}${row.name}`, {
          fg: pinnedRow ? colors.accent : colors.text,
          bold: pinnedRow,
        });
      },
    },
    {
      key: "region",
      header: "Region",
      width: 13,
      overflow: "clip",
      render: (_, row) => ui.text(row.region, { fg: colors.muted }),
    },
    {
      key: "status",
      header: "Status",
      width: 10,
      render: (_, row) =>
        ui.text(row.status.toUpperCase(), { fg: statusColor(row.status), bold: true }),
    },
    {
      key: "latencyMs",
      header: "P95 ms",
      width: 8,
      align: "right",
      sortable: true,
      render: (_, row) =>
        ui.text(`${row.latencyMs}`, {
          fg: row.latencyMs >= 110 ? colors.warning : colors.text,
        }),
    },
    {
      key: "errorRate",
      header: "Err %",
      width: 8,
      align: "right",
      sortable: true,
      render: (_, row) =>
        ui.text(row.errorRate.toFixed(2), {
          fg: row.errorRate >= 1.5 ? colors.down : colors.text,
        }),
    },
    {
      key: "trafficRpm",
      header: "RPM",
      width: 8,
      align: "right",
      sortable: true,
      render: (_, row) => ui.text(formatTraffic(row.trafficRpm), { fg: colors.text }),
    },
  ];

  return ui.column({ flex: 1, p: 1, gap: 1, items: "stretch" }, [
    ui.row({ justify: "between", items: "center" }, [
      ui.row({ gap: 1, items: "center" }, [
        ui.text("__APP_NAME__", { fg: colors.accent, bold: true }),
        ui.badge("Live Ops", { variant: "info" }),
        ui.badge(state.paused ? "Paused" : "Streaming", {
          variant: state.paused ? "warning" : "success",
        }),
      ]),
      ui.row({ gap: 1, items: "center" }, [
        ui.text("Cluster", { fg: colors.muted }),
        ui.badge(overallBadge.text, { variant: overallBadge.variant }),
        ui.text(`Pinned: ${pinned?.name ?? "-"}`, { fg: colors.text }),
      ]),
    ]),

    ui.box(
      {
        border: "rounded",
        px: 1,
        py: 0,
        style: { bg: colors.panelAlt, fg: colors.muted },
      },
      [
        ui.row({ justify: "between", items: "center" }, [
          ui.row({ gap: 2 }, [
            ui.text(`Healthy ${healthyCount}`, { fg: colors.healthy, bold: true }),
            ui.text(`Warning ${warningCount}`, { fg: colors.warning, bold: true }),
            ui.text(`Down ${downCount}`, { fg: colors.down, bold: true }),
            ui.text(`Total ${state.services.length}`, { fg: colors.text }),
          ]),
          ui.row({ gap: 2 }, [
            ui.text(`Filter ${state.filter.toUpperCase()}`, { fg: colors.accentSoft }),
            ui.text(`Sort ${state.sort} (${state.sortDirection})`, { fg: colors.accentSoft }),
          ]),
        ]),
      ],
    ),

    ui.row({ flex: 1, gap: 1, items: "stretch" }, [
      panel(
        "Service Matrix",
        [
          ui.table<Service>({
            id: "service-table",
            columns: tableColumns,
            data: visible,
            getRowKey: (row) => row.id,
            selection: selected ? [selected.id] : [],
            selectionMode: "single",
            onSelectionChange: (keys) => {
              const nextId = keys[0];
              if (!nextId) return;
              app.update((s) => ({ ...s, selectedId: nextId }));
            },
            onRowPress: (row) => {
              app.update((s) => ({ ...s, selectedId: row.id, pinnedId: row.id }));
            },
            sortColumn: state.sort,
            sortDirection: state.sortDirection,
            onSort: (column, direction) => {
              const nextSort = toSortKey(column);
              if (!nextSort) return;
              app.update((s) => {
                const nextVisible = visibleServicesFor(s.services, s.filter, nextSort, direction);
                const nextSelected = selectedFromVisible(nextVisible, s.selectedId);
                return {
                  ...s,
                  sort: nextSort,
                  sortDirection: direction,
                  selectedId: nextSelected ? nextSelected.id : s.selectedId,
                };
              });
            },
            stripeStyle: { odd: colors.panelAlt },
            borderStyle: { variant: "rounded", color: colors.panelBorder },
          }),
        ],
        2,
      ),

      ui.column({ flex: 1, gap: 1, items: "stretch" }, [
        panel(
          "Selected Service",
          [
            ui.column({ gap: 1 }, [
              ui.row({ gap: 1, items: "center" }, [
                ui.text(selected?.name ?? "-", { fg: colors.accent, bold: true }),
                ui.badge(statusBadge(selected?.status ?? "healthy").text, {
                  variant: statusBadge(selected?.status ?? "healthy").variant,
                }),
              ]),
              ui.text(`Region: ${selected?.region ?? "-"}`),
              ui.text(`Tier: ${selected?.tier ?? "-"}`),
              ui.text(`Latency: ${selected?.latencyMs ?? "-"} ms`),
              ui.text(`Error rate: ${selected?.errorRate.toFixed(2) ?? "-"}%`),
              ui.text(`Saturation: ${selected?.saturation ?? "-"}%`, {
                fg: (selected?.saturation ?? 0) >= 82 ? colors.warning : colors.text,
              }),
              ui.divider({ char: "-" }),
              ui.text("Latency trend", { fg: colors.muted }),
              ui.sparkline(selected?.history ?? [0], {
                width: 22,
                min: 0,
                max: 220,
                style: { fg: colors.accent },
              }),
            ]),
          ],
          2,
        ),

        panel(
          state.debug ? "Incident Feed + Debug" : "Incident Feed",
          [
            ui.column({ gap: 1 }, [
              ...(state.incidents.length === 0
                ? [ui.text("No incidents", { fg: colors.muted })]
                : state.incidents.slice(0, 6).map((incident) =>
                    ui.text(`[${incident.at}] ${incident.message}`, {
                      fg: severityColor(incident.severity),
                    }),
                  )),
              state.debug
                ? ui.column({ gap: 1 }, [
                    ui.divider({ char: "-" }),
                    ui.text("Debug", { fg: colors.accentSoft, bold: true }),
                    ui.text(`Ticks: ${state.ticks}`),
                    ui.text(`Applied updates: ${state.updatesApplied}`),
                    ui.text(`Update cadence: ${updateRate.toFixed(2)} Hz`),
                    ui.text(`Last update age: ${stalenessMs} ms`),
                    ui.text("No-flicker pattern: stable row keys + immutable row patching.", {
                      fg: colors.muted,
                    }),
                  ])
                : ui.text("Press d to show render/debug counters.", { fg: colors.muted }),
            ]),
          ],
          2,
        ),
      ]),
    ]),

    ui.box({ px: 1, py: 0, style: { bg: colors.footer, fg: colors.muted } }, [
      ui.row({ justify: "between", items: "center" }, [
        ui.text(state.paused ? "Live updates paused" : "Live updates running"),
        ui.row({ gap: 1 }, [
          ui.kbd(["up", "down"]),
          ui.text("Select"),
          ui.kbd("f"),
          ui.text("Filter"),
          ui.kbd("s"),
          ui.text("Sort"),
          ui.kbd("o"),
          ui.text("Order"),
          ui.kbd(["p", "space"]),
          ui.text("Pause"),
          ui.kbd("enter"),
          ui.text("Pin"),
          ui.kbd("d"),
          ui.text("Debug"),
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
  up: () => app.update((s) => moveSelection(s, -1)),
  down: () => app.update((s) => moveSelection(s, 1)),
  k: () => app.update((s) => moveSelection(s, -1)),
  j: () => app.update((s) => moveSelection(s, 1)),
  f: () =>
    app.update((s) => {
      const filter = cycleFilter(s.filter);
      const visible = visibleServicesFor(s.services, filter, s.sort, s.sortDirection);
      const selected = selectedFromVisible(visible, s.selectedId);
      return {
        ...s,
        filter,
        selectedId: selected ? selected.id : s.selectedId,
      };
    }),
  s: () =>
    app.update((s) => {
      const sort = cycleSort(s.sort);
      const sortDirection = defaultDirectionForSort(sort);
      const visible = visibleServicesFor(s.services, s.filter, sort, sortDirection);
      const selected = selectedFromVisible(visible, s.selectedId);
      return {
        ...s,
        sort,
        sortDirection,
        selectedId: selected ? selected.id : s.selectedId,
      };
    }),
  o: () =>
    app.update((s) => {
      const sortDirection: SortDirection = s.sortDirection === "asc" ? "desc" : "asc";
      const visible = visibleServicesFor(s.services, s.filter, s.sort, sortDirection);
      const selected = selectedFromVisible(visible, s.selectedId);
      return {
        ...s,
        sortDirection,
        selectedId: selected ? selected.id : s.selectedId,
      };
    }),
  p: () => app.update((s) => ({ ...s, paused: !s.paused })),
  space: () => app.update((s) => ({ ...s, paused: !s.paused })),
  enter: () =>
    app.update((s) => {
      const visible = visibleServicesFor(s.services, s.filter, s.sort, s.sortDirection);
      const selected = selectedFromVisible(visible, s.selectedId);
      if (!selected) return s;
      return {
        ...s,
        pinnedId: s.pinnedId === selected.id ? null : selected.id,
      };
    }),
  d: () => app.update((s) => ({ ...s, debug: !s.debug })),
});

const ticker = setInterval(() => {
  app.update((state) => simulateTick(state));
}, 900);

try {
  await app.start();
} finally {
  clearInterval(ticker);
}
