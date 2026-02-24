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
import { formatPower, formatWarpFactor } from "../helpers/formatters.js";
import { selectedCrew } from "../helpers/state.js";
import { stylesForTheme } from "../theme.js";
import type { RouteDeps, StarshipState } from "../types.js";
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

function drawShipSchematic(
  ctx: CanvasContext,
  options: Readonly<{
    warp: number;
    pulse: number;
    sweep: number;
    reactor: number;
    shield: number;
  }>,
): void {
  const width = ctx.width;
  const height = ctx.height;
  const centerX = Math.floor(width * 0.35);
  const centerY = Math.floor(height * 0.52);

  ctx.clear("#0e1626");
  ctx.roundedRect(2, 2, Math.max(6, width - 4), Math.max(6, height - 4), 2, "#35608a");

  const hullPoints = [
    { x: 4, y: centerY },
    { x: centerX - 3, y: centerY - 3 },
    { x: centerX + 8, y: centerY - 2 },
    { x: width - 6, y: centerY },
    { x: centerX + 8, y: centerY + 2 },
    { x: centerX - 3, y: centerY + 3 },
    { x: 4, y: centerY },
  ] as const;
  ctx.polyline(hullPoints, "#89d0ff");

  const reactorRadius = 1.2 + options.reactor * 1.8;
  ctx.fillCircle(centerX - 4, centerY, reactorRadius, "#6ff0cf");
  ctx.circle(centerX - 4, centerY, reactorRadius + 1.2, "#afffe8");

  const shieldRadius = Math.max(2, Math.floor(5 + options.shield * 3 + options.pulse * 2));
  ctx.arc(centerX + 3, centerY, shieldRadius, 0.2, Math.PI * 1.8, "#7eb9ff");

  const sweepX = Math.floor(((options.sweep % 100) / 100) * (width - 8)) + 4;
  ctx.line(sweepX, 3, sweepX, height - 4, "#4fd3f7");

  const warpTrail: Array<Readonly<{ x: number; y: number }>> = [];
  for (let i = 0; i < 8; i++) {
    warpTrail.push({
      x: centerX + 9 + i * 2,
      y: centerY + Math.sin(i * 0.8 + options.warp * 2.1) * 1.2,
    });
  }
  ctx.polyline(warpTrail, "#80f5ff");

  for (let i = 0; i < 12; i++) {
    const x = Math.floor(3 + ((i * 17 + Math.floor(options.sweep)) % Math.max(3, width - 6)));
    const y = Math.floor(3 + ((i * 11 + Math.floor(options.sweep * 0.7)) % Math.max(3, height - 6)));
    ctx.setPixel(x, y, i % 3 === 0 ? "#d5f3ff" : "#8ec7ff");
  }

  ctx.text(4, 1, "USS REZI // COMMAND SCOPE", "#b6d9ff");
}

const BridgeCommandDeck = defineWidget<BridgeCommandDeckProps>((props, ctx): VNode => {
  const viewport = ctx.useViewport?.() ?? { width: 120, height: 40, breakpoint: "lg" as const };
  const redAlertId = ctx.id("red-alert");
  const [scanSweep, setScanSweep] = ctx.useState(0);
  const [scanBoost, setScanBoost] = ctx.useState(false);
  const [uptime, setUptime] = ctx.useState(0);
  const lastReactorRef = ctx.useRef(props.state.telemetry.reactorPower);

  const selected = selectedCrew(props.state);
  const subsystemNames = props.state.subsystems.map((item) => item.name);

  const chartWidth = clamp(Math.floor(viewport.width * 0.42), 28, 64);
  const lineSeries = ctx.useMemo(
    () =>
      Object.freeze([
        {
          data: props.state.telemetryHistory,
          color: "#7ec8ff",
          label: "Reactor",
        },
        {
          data: props.state.shieldHistory,
          color: "#7cf0c1",
          label: "Shields",
        },
      ]),
    [props.state.telemetryHistory, props.state.shieldHistory],
  );

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

  const leftPanel = ui.panel("Ship Schematic", [
    ui.canvas({
      id: ctx.id("ship-canvas"),
      width: clamp(Math.floor(viewport.width * 0.45), 34, 70),
      height: clamp(Math.floor(viewport.height * 0.32), 11, 16),
      blitter: "braille",
      draw: (canvasCtx) =>
        drawShipSchematic(canvasCtx, {
          warp,
          pulse: shieldPulse,
          sweep: scanSweep,
          reactor,
          shield: props.state.telemetry.shieldStrength / 100,
        }),
    }),
    ui.row({ gap: 1, wrap: true }, [
      ui.badge(`Warp ${warp.toFixed(2)}`, { variant: "info" }),
      ui.badge(`Reactor ${formatPower(reactor * 100)}`, { variant: "success" }),
      ui.badge(scanBoost ? "Scan Pulse" : "Scan Stable", {
        variant: scanBoost ? "warning" : "default",
      }),
      ui.text(`Uptime ${uptime}s`, { variant: "caption" }),
    ]),
  ]);

  const rightPanel = ui.panel("Telemetry", [
    ui.row({ gap: 1, wrap: true }, [
      ui.gauge(reactor, { label: "Reactor" }),
      ui.gauge(props.state.telemetry.shieldStrength / 100, { label: "Shields" }),
      ui.gauge(props.state.telemetry.hullIntegrity / 100, { label: "Hull" }),
    ]),
    ui.row({ gap: 1, wrap: true }, [
      ui.progress(props.state.telemetry.reactorPower / 100, {
        label: `Reactor ${formatPower(props.state.telemetry.reactorPower)}`,
      }),
      ui.progress(props.state.telemetry.fuelLevel / 100, {
        label: `Fuel ${formatPower(props.state.telemetry.fuelLevel)}`,
        dsTone: props.state.telemetry.fuelLevel < 30 ? "warning" : "default",
      }),
    ]),
    ui.text(formatWarpFactor(warp), { variant: "heading" }),
    ui.sparkline(props.state.telemetryHistory, { width: chartWidth, min: 0, max: 100 }),
    ui.lineChart({
      id: ctx.id("telemetry-line-chart"),
      width: chartWidth,
      height: 10,
      series: lineSeries,
      showLegend: true,
      blitter: "braille",
      axes: {
        x: { label: "ticks" },
        y: { min: 0, max: 100, label: "%" },
      },
    }),
  ]);

  const systemsPanel = ui.box(
    {
      border: "rounded",
      p: 1,
      transition: {
        duration: 200,
        properties: ["size", "opacity"],
      },
    },
    [
      ui.column({ gap: 1 }, [
        ui.text("Systems Status", { variant: "label" }),
        each(
          props.state.subsystems.slice(0, 8),
          (subsystem, index) => {
            const progress = bootProgress[index] ?? 0;
            const online = subsystem.health >= props.state.alertThreshold;
            return ui.row({ key: subsystem.id, gap: 1, items: "center", wrap: true }, [
              ui.status(online ? "online" : "busy", { showLabel: false }),
              ui.text(`${subsystem.name}: ${online ? "OK" : "CHECK"}`),
                ui.progress(progress, {
                  label: `${String(Math.round(progress * 100)).padStart(3, " ")}%`,
                  dsTone: online ? "default" : "warning",
                }),
            ]);
          },
          {
            key: (subsystem) => subsystem.id,
            empty: () => ui.text("No subsystem telemetry available", { variant: "caption" }),
          },
        ),
        ui.row({ gap: 1, wrap: true }, [
          ui.icon("ui.satellite"),
          ui.text(`Duty officer: ${selected?.name ?? "unassigned"}`, { variant: "caption" }),
        ]),
      ]),
    ],
  );

  return ui.column({ gap: 1 }, [
    ui.panel("Bridge Controls", [
      ui.actions([
        ui.button({
          id: ctx.id("toggle-autopilot"),
          label: props.state.autopilot ? "Disable Autopilot" : "Enable Autopilot",
          intent: "secondary",
          onPress: () => props.dispatch({ type: "toggle-autopilot" }),
        }),
        ui.button({
          id: ctx.id("scan-button"),
          label: "Run Scan",
          intent: "primary",
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
          onPress: () => props.dispatch({ type: "toggle-red-alert" }),
        }),
      ]),
    ]),
    ui.column({ gap: 1 }, [leftPanel, rightPanel]),
    systemsPanel,
  ]);
});

type BridgeScreenDeps = RouteDeps;

export function renderBridgeScreen(
  context: RouteRenderContext<StarshipState>,
  deps: BridgeScreenDeps,
): VNode {
  const state = context.state;
  const styles = stylesForTheme(state.themeName);

  return renderShell({
    title: "Bridge Overview",
    context,
    deps,
    body: ui.column({ gap: 1, style: styles.rootStyle }, [
      ui.card(
        {
          title: "Command Deck",
          style: styles.panelStyle,
        },
        [BridgeCommandDeck({ key: "bridge-command-deck", state, dispatch: deps.dispatch })],
      ),
    ]),
  });
}
