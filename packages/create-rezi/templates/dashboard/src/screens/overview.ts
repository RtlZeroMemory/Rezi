import type { VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import {
  filterLabel,
  fleetCounts,
  formatErrorRate,
  formatLatency,
  formatTraffic,
  overallStatus,
  statusBadge,
  statusGlyph,
} from "../helpers/formatters.js";
import { selectedService, visibleServices } from "../helpers/state.js";
import { PRODUCT_NAME, PRODUCT_TAGLINE, TEMPLATE_LABEL, stylesForTheme, themeSpec } from "../theme.js";
import type { DashboardState } from "../types.js";

type DashboardScreenHandlers = Readonly<{
  onTogglePause: () => void;
  onCycleFilter: () => void;
  onCycleTheme: () => void;
  onToggleHelp: () => void;
  onSelectService: (serviceId: string) => void;
}>;

function panel(title: string, body: readonly VNode[], style: Readonly<Record<string, unknown>>): VNode {
  return ui.panel({ title, style }, body);
}

export function renderOverviewScreen(state: DashboardState, handlers: DashboardScreenHandlers): VNode {
  const styles = stylesForTheme(state.themeName);
  const visible = visibleServices(state);
  const selected = selectedService(state);
  const counts = fleetCounts(state.services);
  const health = statusBadge(overallStatus(state.services));
  const theme = themeSpec(state.themeName);

  const serviceRows: readonly VNode[] =
    visible.length === 0
      ? [ui.text("No services match the current filter.", { style: styles.mutedStyle })]
      : visible.map((service) => {
          const selectedMarker = service.id === selected?.id ? "▸" : " ";
          return ui.row({ key: service.id, gap: 1, items: "center", wrap: true }, [
            ui.text(selectedMarker, { style: styles.accentStyle }),
            ui.badge(statusGlyph(service.status), { variant: statusBadge(service.status).variant }),
            ui.button({
              id: `service-${service.id}`,
              label: `${service.name} · ${service.region}`,
              onPress: () => handlers.onSelectService(service.id),
            }),
            ui.tag(formatLatency(service.latencyMs), {
              variant: service.status === "down" ? "error" : service.status === "warning" ? "warning" : "info",
            }),
            ui.tag(formatErrorRate(service.errorRate), {
              variant: service.errorRate >= 3 ? "error" : service.errorRate >= 1 ? "warning" : "default",
            }),
            ui.text(formatTraffic(service.trafficRpm), { style: styles.mutedStyle }),
          ]);
        });

  const uptimeSec = Math.max(1, Math.floor((Date.now() - state.startedAtMs) / 1000));
  const updateRate = (state.tick / uptimeSec).toFixed(2);

  const content = ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: PRODUCT_NAME,
      subtitle: PRODUCT_TAGLINE,
      actions: [
        ui.badge(TEMPLATE_LABEL, { variant: "info" }),
        ui.badge(`Fleet ${health.label}`, { variant: health.variant }),
        ui.status(state.paused ? "away" : "online", {
          label: state.paused ? "Paused" : "Streaming",
        }),
        ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
      ],
    }),
    body: ui.column({ gap: 1 }, [
      ui.actions([
        ui.button({
          id: "filter",
          label: `Filter: ${filterLabel(state.filter)}`,
          intent: "secondary",
          onPress: handlers.onCycleFilter,
        }),
        ui.button({
          id: "theme",
          label: "Cycle Theme",
          intent: "secondary",
          onPress: handlers.onCycleTheme,
        }),
        ui.button({
          id: "pause",
          label: state.paused ? "Resume Stream" : "Pause Stream",
          intent: state.paused ? "primary" : "warning",
          onPress: handlers.onTogglePause,
        }),
        ui.button({
          id: "help",
          label: "Help",
          intent: "link",
          onPress: handlers.onToggleHelp,
        }),
      ]),
      ui.row({ gap: 1, wrap: true, items: "stretch" }, [
        panel(
          "Service Fleet",
          [
            ui.row({ gap: 1, wrap: true }, [
              ui.badge(`Healthy ${String(counts.healthy)}`, { variant: "success" }),
              ui.badge(`Warning ${String(counts.warning)}`, { variant: "warning" }),
              ui.badge(`Down ${String(counts.down)}`, { variant: "error" }),
            ]),
            ui.box({ height: 10, overflow: "scroll", border: "none" }, [...serviceRows]),
            ui.table({
              id: "fleet-table",
              columns: [
                { key: "name", header: "Service", flex: 1 },
                { key: "status", header: "Status", width: 8 },
                { key: "latencyMs", header: "Latency", width: 9, align: "right" },
              ],
              data: visible,
              getRowKey: (service) => service.id,
              selection: selected ? [selected.id] : [],
              selectionMode: "single",
              onSelectionChange: (keys) => {
                const key = keys[0];
                if (typeof key === "string") handlers.onSelectService(key);
              },
              onRowPress: (row) => handlers.onSelectService(row.id),
              dsSize: "sm",
              dsTone: "default",
            }),
          ],
          styles.panelStyle,
        ),
        panel(
          "Inspector",
          selected
            ? [
                ui.column({ gap: 1 }, [
                  ui.row({ gap: 1, wrap: true }, [
                    ui.badge(selected.name, { variant: statusBadge(selected.status).variant }),
                    ui.tag(selected.owner, { variant: "default" }),
                    ui.tag(selected.region, { variant: "info" }),
                  ]),
                  ui.text(`Latency: ${formatLatency(selected.latencyMs)}`),
                  ui.text(`Error Rate: ${formatErrorRate(selected.errorRate)}`),
                  ui.text(`Traffic: ${formatTraffic(selected.trafficRpm)}`),
                  ui.text(`Update rate: ${updateRate} Hz`, { style: styles.mutedStyle }),
                  ui.sparkline(selected.history, { width: 18, min: 0, max: 220 }),
                ]),
              ]
            : [ui.text("No service selected.", { style: styles.mutedStyle })],
          styles.panelStyle,
        ),
      ]),
    ]),
    footer: ui.statusBar({
      left: [ui.text("Keys: q quit · j/k or arrows move · f filter · t theme · p pause · h/? help", {
        style: styles.mutedStyle,
      })],
      right: [ui.text(`Tick ${String(state.tick)}`, { style: styles.mutedStyle })],
    }),
  });

  if (!state.showHelp) return content;

  return ui.layers([
    content,
    ui.modal({
      id: "dashboard-help",
      title: `${PRODUCT_NAME} Commands`,
      width: 70,
      backdrop: "none",
      returnFocusTo: "help",
      content: ui.column({ gap: 1 }, [
        ui.text("q, ctrl+c : quit"),
        ui.text("j/k, up/down : move selection"),
        ui.text("f : cycle service filter"),
        ui.text("t : cycle theme"),
        ui.text("p or space : pause stream"),
        ui.text("h, ? or escape : close help"),
      ]),
      actions: [
        ui.button({
          id: "help-close",
          label: "Close",
          onPress: handlers.onToggleHelp,
        }),
      ],
      onClose: handlers.onToggleHelp,
    }),
  ]);
}
