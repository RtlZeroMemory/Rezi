import {
  defineWidget,
  each,
  ui,
  useInterval,
  useSequence,
  useSpring,
  useStagger,
  useTransition,
  type CanvasContext,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { debugSnapshot } from "../helpers/debug.js";
import { resolveLayout } from "../helpers/layout.js";
import { formatPower, formatWarpFactor } from "../helpers/formatters.js";
import { selectedCrew } from "../helpers/state.js";
import { SPACE, alertBadgeVariant, themeTokens, toHex } from "../theme.js";
import type { RouteDeps, StarshipState } from "../types.js";
import { progressRow, sectionHeader, surfacePanel } from "./primitives.js";
import { renderShell } from "./shell.js";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

type BridgeCommandDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

type SchematicPalette = Readonly<{
  background: string;
  frame: string;
  hull: string;
  reactorFill: string;
  reactorRing: string;
  shield: string;
  sweep: string;
  trail: string;
  starA: string;
  starB: string;
  label: string;
}>;

function drawShipSchematic(
  ctx: CanvasContext,
  options: Readonly<{
    warp: number;
    pulse: number;
    sweep: number;
    reactor: number;
    shield: number;
    palette: SchematicPalette;
  }>,
): void {
  const width = ctx.width;
  const height = ctx.height;
  const centerX = Math.floor(width * 0.35);
  const centerY = Math.floor(height * 0.52);

  ctx.clear(options.palette.background);
  ctx.roundedRect(
    2,
    2,
    Math.max(6, width - 4),
    Math.max(6, height - 4),
    2,
    options.palette.frame,
  );

  const hullPoints = [
    { x: 4, y: centerY },
    { x: centerX - 3, y: centerY - 3 },
    { x: centerX + 8, y: centerY - 2 },
    { x: width - 6, y: centerY },
    { x: centerX + 8, y: centerY + 2 },
    { x: centerX - 3, y: centerY + 3 },
    { x: 4, y: centerY },
  ] as const;
  ctx.polyline(hullPoints, options.palette.hull);

  const reactorRadius = 1.2 + options.reactor * 1.8;
  ctx.fillCircle(centerX - 4, centerY, reactorRadius, options.palette.reactorFill);
  ctx.circle(centerX - 4, centerY, reactorRadius + 1.2, options.palette.reactorRing);

  const shieldRadius = Math.max(2, Math.floor(5 + options.shield * 3 + options.pulse * 2));
  ctx.arc(centerX + 3, centerY, shieldRadius, 0.2, Math.PI * 1.8, options.palette.shield);

  const sweepX = Math.floor(((options.sweep % 100) / 100) * (width - 8)) + 4;
  ctx.line(sweepX, 3, sweepX, height - 4, options.palette.sweep);

  const warpTrail: Array<Readonly<{ x: number; y: number }>> = [];
  for (let i = 0; i < 8; i++) {
    warpTrail.push({
      x: centerX + 9 + i * 2,
      y: centerY + Math.sin(i * 0.8 + options.warp * 2.1) * 1.2,
    });
  }
  ctx.polyline(warpTrail, options.palette.trail);

  for (let i = 0; i < 12; i++) {
    const x = Math.floor(3 + ((i * 17 + Math.floor(options.sweep)) % Math.max(3, width - 6)));
    const y = Math.floor(3 + ((i * 11 + Math.floor(options.sweep * 0.7)) % Math.max(3, height - 6)));
    ctx.setPixel(x, y, i % 3 === 0 ? options.palette.starA : options.palette.starB);
  }

  ctx.text(4, 1, "USS REZI // COMMAND SCOPE", options.palette.label);
}

const BridgeCommandDeck = defineWidget<BridgeCommandDeckProps>((props, ctx): VNode => {
  const tokens = themeTokens(props.state.themeName);
  const layout = resolveLayout({
    width: props.state.viewportCols,
    height: props.state.viewportRows,
  });
  const chromeRows =
    layout.height >= 58 ? 18 : layout.height >= 48 ? 16 : layout.height >= 40 ? 14 : 11;
  const contentRows = Math.max(12, layout.height - chromeRows);
  const veryCompactHeight = contentRows <= 16;
  const compactHeight = contentRows <= 22;
  const constrainedHeight = contentRows <= 32;
  const redAlertId = ctx.id("red-alert");
  const [scanSweep, setScanSweep] = ctx.useState(0);
  const [scanBoost, setScanBoost] = ctx.useState(false);
  const [uptime, setUptime] = ctx.useState(0);
  const lastReactorRef = ctx.useRef(props.state.telemetry.reactorPower);

  const selected = selectedCrew(props.state);
  const subsystemNames = props.state.subsystems.map((item) => item.name);
  const chartWidth = clamp(Math.floor(layout.width * (layout.wide ? 0.5 : 0.9)), 28, 132);
  const schematicWidth = clamp(Math.floor(layout.width * (layout.wide ? 0.48 : 0.9)), 26, 116);
  const schematicHeight = clamp(Math.floor(contentRows * 0.38), 8, 14);
  const showGaugeRow = contentRows >= 28;
  const showSparkline = contentRows >= 24;
  const showLineChart = contentRows >= 34;
  const lineChartHeight = contentRows >= 46 ? 8 : contentRows >= 38 ? 6 : 5;
  debugSnapshot("bridge.layout", {
    viewportCols: props.state.viewportCols,
    viewportRows: props.state.viewportRows,
    layoutWidth: layout.width,
    layoutHeight: layout.height,
    chromeRows,
    contentRows,
    hideNonCritical: layout.hideNonCritical,
    veryCompactHeight,
    compactHeight,
    constrainedHeight,
    showGaugeRow,
    showSparkline,
    showLineChart,
  });

  const palette = ctx.useMemo(
    () =>
      Object.freeze({
        background: toHex(tokens.bg.panel.inset),
        frame: toHex(tokens.border.default),
        hull: toHex(tokens.accent.info),
        reactorFill: toHex(tokens.accent.success),
        reactorRing: toHex(tokens.state.focusRing),
        shield: toHex(tokens.accent.brand),
        sweep: toHex(tokens.state.focusRing),
        trail: toHex(tokens.accent.info),
        starA: toHex(tokens.text.primary),
        starB: toHex(tokens.text.muted),
        label: toHex(tokens.text.primary),
      }),
    [props.state.themeName],
  );

  const lineSeries = ctx.useMemo(
    () =>
      Object.freeze([
        {
          data: props.state.telemetryHistory,
          color: toHex(tokens.accent.info),
          label: "Reactor",
        },
        {
          data: props.state.shieldHistory,
          color: toHex(tokens.accent.success),
          label: "Shields",
        },
      ]),
    [props.state.telemetryHistory, props.state.shieldHistory, props.state.themeName],
  );
  const reactorPrev =
    props.state.telemetryHistory[props.state.telemetryHistory.length - 2] ??
    props.state.telemetry.reactorPower;
  const shieldPrev =
    props.state.shieldHistory[props.state.shieldHistory.length - 2] ?? props.state.telemetry.shieldStrength;
  const reactorTrend = props.state.telemetry.reactorPower - reactorPrev;
  const shieldTrend = props.state.telemetry.shieldStrength - shieldPrev;

  const handleScanPulse = ctx.useCallback(() => {
    setScanSweep((previous) => (previous + 13) % 100);
    setScanBoost((previous) => !previous);
  }, []);

  ctx.useEffect(() => {
    if (Math.abs(props.state.telemetry.reactorPower - lastReactorRef.current) > 4) {
      setScanBoost(true);
    }
    lastReactorRef.current = props.state.telemetry.reactorPower;
  }, [props.state.telemetry.reactorPower]);

  useInterval(ctx, () => {
    setUptime((value) => value + 1);
    handleScanPulse();
  }, 1000);

  const warp = useTransition(ctx, props.state.telemetry.warpFactor, {
    duration: 400,
    easing: "easeOutCubic",
  });
  const reactor = useSpring(ctx, props.state.telemetry.reactorPower / 100, {
    stiffness: 180,
    damping: 22,
  });
  const shieldPulse = useSequence(ctx, [0.3, 1, 0.5, 0.9], {
    duration: 150,
    loop: true,
  });
  const bootProgress = useStagger(ctx, subsystemNames, {
    delay: 60,
    duration: 240,
  });

  const commandDeck = surfacePanel(tokens, "Command Deck", [
    ui.actions([
      ui.button({
        id: ctx.id("toggle-autopilot"),
        label: props.state.autopilot ? "Disable Autopilot" : "Enable Autopilot",
        intent: "secondary",
        dsSize: "md",
        onPress: () => props.dispatch({ type: "toggle-autopilot" }),
      }),
      ui.button({
        id: ctx.id("scan-button"),
        label: "Run Scan",
        intent: "primary",
        dsSize: "md",
        onPress: () => {
          handleScanPulse();
          props.dispatch({
            type: "add-toast",
            toast: {
              id: `bridge-scan-${props.state.tick}`,
              message: "Bridge scan complete",
              level: "info",
              timestamp: props.state.nowMs,
              durationMs: 2800,
            },
          });
        },
      }),
      ui.button({
        id: redAlertId,
        label: props.state.alertLevel === "red" ? "Lower Alert" : "Raise Red Alert",
        intent: props.state.alertLevel === "red" ? "warning" : "danger",
        dsSize: "md",
        onPress: () => props.dispatch({ type: "toggle-red-alert" }),
      }),
    ]),
    ui.row({ gap: SPACE.sm, wrap: true }, [
      ui.badge(`Warp ${warp.toFixed(2)}`, { variant: "info" }),
      ui.badge(`Reactor ${formatPower(reactor * 100)}`, { variant: "success" }),
      ui.badge(scanBoost ? "Scan Pulse" : "Scan Stable", {
        variant: scanBoost ? "warning" : "default",
      }),
      ui.text(`Uptime ${uptime}s`, { variant: "caption", style: { fg: tokens.text.muted } }),
    ]),
  ]);

  const commandSummary = surfacePanel(
    tokens,
    "Bridge Status",
    [
      sectionHeader(tokens, "Live Overview", "Command-state mirror for quick scan"),
      ui.row({ gap: SPACE.xs, wrap: true }, [
        ui.badge(
          props.state.alertLevel === "red"
            ? "Red Alert"
            : props.state.alertLevel === "yellow"
              ? "Yellow Alert"
              : "Green Alert",
          {
            variant: alertBadgeVariant(props.state.alertLevel),
          },
        ),
        ui.badge(props.state.autopilot ? "Autopilot On" : "Manual Helm", {
          variant: props.state.autopilot ? "success" : "warning",
        }),
        ui.badge(props.state.paused ? "Simulation Paused" : "Live Tick", {
          variant: props.state.paused ? "warning" : "info",
        }),
      ]),
      progressRow(tokens, "Warp Lane", Math.min(1, warp / 9), {
        labelWidth: 10,
        width: 20,
        tone: "default",
        trend: props.state.telemetry.warpFactor > 3 ? 1 : 0,
      }),
      progressRow(tokens, "Fuel", props.state.telemetry.fuelLevel / 100, {
        labelWidth: 10,
        width: 20,
        tone: props.state.telemetry.fuelLevel < 35 ? "warning" : "success",
        trend: props.state.telemetry.fuelLevel < 35 ? -1 : 1,
      }),
      ui.text(`Duty officer: ${selected?.name ?? "unassigned"}`, {
        variant: "caption",
        style: { fg: tokens.text.muted, dim: true },
      }),
    ],
    { tone: "inset" },
  );

  const showCommandSummary = layout.wide && contentRows >= 54;
  debugSnapshot("bridge.panels", {
    showCommandSummary,
    showSchematicRail: layout.wide && !layout.hideNonCritical && contentRows >= 28,
    showSystemsPanel: contentRows >= 60,
  });
  const commandRegion = showCommandSummary
    ? ui.row({ gap: SPACE.sm, items: "stretch", width: "full" }, [
        ui.box({ border: "none", p: 0, flex: 2 }, [commandDeck]),
        ui.box({ border: "none", p: 0, flex: 1 }, [commandSummary]),
      ])
    : commandDeck;

  const telemetryPanel = surfacePanel(tokens, "Telemetry", [
    sectionHeader(tokens, "Bridge Telemetry", "Aligned gauges and deterministic live signals"),
    progressRow(tokens, "Reactor", props.state.telemetry.reactorPower / 100, {
      labelWidth: 12,
      width: clamp(chartWidth - 14, 18, 68),
      trend: reactorTrend,
      tone: props.state.telemetry.reactorPower > 92 ? "warning" : "default",
    }),
    progressRow(tokens, "Shields", props.state.telemetry.shieldStrength / 100, {
      labelWidth: 12,
      width: clamp(chartWidth - 14, 18, 68),
      trend: shieldTrend,
      tone: props.state.telemetry.shieldStrength < 40 ? "warning" : "success",
    }),
    progressRow(tokens, "Hull", props.state.telemetry.hullIntegrity / 100, {
      labelWidth: 12,
      width: clamp(chartWidth - 14, 18, 68),
      trend: 0,
      tone: props.state.telemetry.hullIntegrity < 70 ? "danger" : "success",
    }),
    ui.row({ gap: SPACE.sm, wrap: true }, [
      ui.text(`Reactor ${formatPower(props.state.telemetry.reactorPower)}`, {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
      ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
      ui.text(`Shields ${formatPower(props.state.telemetry.shieldStrength)}`, {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
      ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
      ui.text(`Hull ${formatPower(props.state.telemetry.hullIntegrity)}`, {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
      ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
      ui.text(`Warp ${formatWarpFactor(warp)}`, {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
    ]),
    ...(showGaugeRow
      ? [
          ui.row({ gap: SPACE.sm, wrap: true }, [
            ui.gauge(reactor, { label: "Reactor" }),
            ui.gauge(props.state.telemetry.shieldStrength / 100, { label: "Shields" }),
            ui.gauge(props.state.telemetry.hullIntegrity / 100, { label: "Hull" }),
            ui.text(formatWarpFactor(warp), { variant: "heading" }),
          ]),
        ]
      : []),
    ...(showSparkline
      ? [ui.sparkline(props.state.telemetryHistory, { width: chartWidth, min: 0, max: 100 })]
      : []),
    ...(showLineChart
      ? [
          ui.lineChart({
            id: ctx.id("telemetry-line-chart"),
            width: chartWidth,
            height: lineChartHeight,
            series: lineSeries,
            showLegend: true,
            blitter: "braille",
            axes: {
              x: { label: "Ticks" },
              y: { min: 0, max: 100, label: "%" },
            },
          }),
        ]
      : []),
  ]);

  const schematicPanel = layout.hideNonCritical
    ? surfacePanel(tokens, "Ship Schematic", [
        ui.callout("Schematic hidden in compact viewport. Telemetry summary remains active.", {
          variant: "info",
          title: "Compact Mode",
        }),
      ], {
        tone: "inset",
      })
    : surfacePanel(
        tokens,
        "Ship Schematic",
        [
          ui.canvas({
            id: ctx.id("ship-canvas"),
            width: schematicWidth,
            height: schematicHeight,
            blitter: "braille",
            draw: (canvasCtx) => {
              debugSnapshot("bridge.canvas.draw", {
                viewportCols: props.state.viewportCols,
                viewportRows: props.state.viewportRows,
                canvasWidth: canvasCtx.width,
                canvasHeight: canvasCtx.height,
                renderMode: veryCompactHeight
                  ? "very-compact"
                  : compactHeight
                    ? "compact"
                    : constrainedHeight
                      ? "constrained"
                      : "full",
              });
              drawShipSchematic(canvasCtx, {
                warp,
                pulse: shieldPulse,
                sweep: scanSweep,
                reactor,
                shield: props.state.telemetry.shieldStrength / 100,
                palette,
              });
            },
          }),
          ui.row({ gap: SPACE.sm, wrap: true }, [
            ui.tag(`Fuel ${formatPower(props.state.telemetry.fuelLevel)}`, { variant: "warning" }),
            ui.tag(`Life ${formatPower(props.state.telemetry.lifeSupportPct)}`, { variant: "success" }),
          ]),
        ],
        {
          tone: "inset",
        },
      );

  const systemsPanel = surfacePanel(
    tokens,
    "Systems Status",
    [
      each(
        props.state.subsystems.slice(0, layout.hideNonCritical ? 4 : 8),
        (subsystem, index) => {
          const progress = bootProgress[index] ?? 0;
          const online = subsystem.health >= props.state.alertThreshold;
          return ui.row({ key: subsystem.id, gap: SPACE.sm, items: "center", wrap: true }, [
            ui.status(online ? "online" : "busy", { showLabel: false }),
            ui.text(subsystem.name, {
              variant: "caption",
              style: online ? { fg: tokens.text.primary } : { fg: tokens.accent.warn, bold: true },
            }),
            ui.spacer({ flex: 1 }),
            progressRow(tokens, "Boot", progress, {
              labelWidth: 6,
              width: 20,
              tone: online ? "success" : "warning",
            }),
          ]);
        },
        {
          key: (subsystem) => subsystem.id,
          empty: () => ui.text("No subsystem telemetry available", { variant: "caption" }),
        },
      ),
      ui.row({ gap: SPACE.sm, wrap: true }, [
        ui.icon("ui.satellite"),
        ui.text(`Duty officer: ${selected?.name ?? "unassigned"}`, { variant: "caption" }),
      ]),
    ],
    {
      tone: props.state.alertLevel === "red" ? "danger" : "default",
      p: SPACE.sm,
      gap: SPACE.sm,
    },
  );

  const showSchematicRail = layout.wide && !layout.hideNonCritical && contentRows >= 28;
  const telemetryRegion = showSchematicRail
    ? ui.row({ gap: SPACE.sm, items: "stretch", wrap: false, width: "full" }, [
        ui.box({ border: "none", p: 0, flex: 2 }, [telemetryPanel]),
        ui.box({ border: "none", p: 0, flex: 1 }, [schematicPanel]),
      ])
    : telemetryPanel;

  if (veryCompactHeight) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [commandDeck]);
  }

  if (compactHeight) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [
      commandDeck,
      surfacePanel(
        tokens,
        "Systems Snapshot",
        [
          ui.row({ gap: SPACE.sm, wrap: true }, [
            ui.badge(`Reactor ${formatPower(props.state.telemetry.reactorPower)}`, { variant: "info" }),
            ui.badge(`Shields ${formatPower(props.state.telemetry.shieldStrength)}`, {
              variant: props.state.telemetry.shieldStrength < 40 ? "warning" : "success",
            }),
            ui.badge(`Hull ${formatPower(props.state.telemetry.hullIntegrity)}`, {
              variant: props.state.telemetry.hullIntegrity < 70 ? "error" : "success",
            }),
          ]),
          ui.text(`Duty officer: ${selected?.name ?? "unassigned"}`, { variant: "caption" }),
        ],
        { tone: props.state.alertLevel === "red" ? "danger" : "default" },
      ),
    ]);
  }

  if (constrainedHeight) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [commandDeck, telemetryPanel]);
  }

  return ui.column({ gap: SPACE.sm, width: "full" }, [
    commandRegion,
    telemetryRegion,
    ...(contentRows >= 60 ? [systemsPanel] : []),
  ]);
});

type BridgeScreenDeps = RouteDeps;

export function renderBridgeScreen(
  context: RouteRenderContext<StarshipState>,
  deps: BridgeScreenDeps,
): VNode {
  const state = context.state;

  return renderShell({
    title: "Bridge Overview",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
      BridgeCommandDeck({ key: "bridge-command-deck", state, dispatch: deps.dispatch }),
    ]),
  });
}
