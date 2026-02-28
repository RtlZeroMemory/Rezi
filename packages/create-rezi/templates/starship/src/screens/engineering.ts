import {
  defineWidget,
  each,
  ui,
  useSequence,
  useSpring,
  useStagger,
  widthConstraints,
  type CanvasContext,
  type NodeState,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { debugSnapshot } from "../helpers/debug.js";
import { resolveLayout } from "../helpers/layout.js";
import { formatPower, formatTemperature } from "../helpers/formatters.js";
import { SPACE, themeTokens, toHex } from "../theme.js";
import type { RouteDeps, StarshipState, Subsystem } from "../types.js";
import { progressRow, sectionHeader, surfacePanel } from "./primitives.js";
import { renderShell } from "./shell.js";

function buildSubsystemChildren(subsystems: readonly Subsystem[]): Map<string | null, readonly Subsystem[]> {
  const map = new Map<string | null, Subsystem[]>();
  for (const subsystem of subsystems) {
    const list = map.get(subsystem.parent) ?? [];
    list.push(subsystem);
    map.set(subsystem.parent, list);
  }
  return map;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

type ReactorPalette = Readonly<{
  background: string;
  border: string;
  arcPrimary: string;
  arcSecondary: string;
  coreFill: string;
  coreStroke: string;
  linePrimary: string;
  lineAlternate: string;
  text: string;
}>;

function drawReactor(ctx: CanvasContext, pulse: number, boost: number, palette: ReactorPalette): void {
  const width = ctx.width;
  const height = ctx.height;
  const centerX = Math.floor(width * 0.45);
  const centerY = Math.floor(height * 0.5);
  const radius = 2 + pulse * 2 + boost;

  ctx.clear(palette.background);
  ctx.strokeRect(1, 1, Math.max(4, width - 2), Math.max(4, height - 2), palette.border);

  for (let i = 0; i < 3; i++) {
    const arcRadius = radius + i * 2;
    ctx.arc(
      centerX,
      centerY,
      arcRadius,
      i * 0.4 + boost,
      i * 0.4 + boost + Math.PI * (0.8 + pulse * 0.2),
      i === 2 ? palette.arcSecondary : palette.arcPrimary,
    );
  }

  ctx.fillCircle(centerX, centerY, radius, palette.coreFill);
  ctx.circle(centerX, centerY, radius + 1, palette.coreStroke);

  for (let line = 0; line < 4; line++) {
    ctx.line(
      centerX + radius + 1,
      centerY - 2 + line,
      width - 3,
      centerY - 2 + line + Math.sin(line + boost) * 1.4,
      line % 2 === 0 ? palette.linePrimary : palette.lineAlternate,
    );
  }

  ctx.text(2, 1, "REACTOR CORE", palette.text);
}

type EngineeringDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

const EngineeringDeck = defineWidget<EngineeringDeckProps>((props, ctx): VNode => {
  const tokens = themeTokens(props.state.themeName);
  const layout = resolveLayout({
    width: props.state.viewportCols,
    height: props.state.viewportRows,
  });
  const forceStackViaEnv = process.env.REZI_STARSHIP_DEBUG_FORCE_ENGINEERING_STACK === "1";
  const chromeRows =
    layout.height >= 58 ? 18 : layout.height >= 48 ? 16 : layout.height >= 40 ? 14 : 11;
  const contentRows = Math.max(12, layout.height - chromeRows);
  const veryCompactHeight = contentRows <= 14;
  const compactHeight = contentRows <= 24;
  const constrainedHeight = contentRows <= 34;
  const tallViewport = contentRows >= 46;
  const showSecondaryPanels = tallViewport && !layout.hideNonCritical && layout.width >= 120;
  const showControlsSummary = layout.wide && contentRows >= 50;
  const useWideRow = layout.wide && !forceStackViaEnv;
  const renderMode = veryCompactHeight ? "very-compact" : compactHeight ? "compact" : "full";
  const leftPanePanelCount = 1 + (showSecondaryPanels ? 1 : 0);
  const rightPanePanelCount = 1 + (showSecondaryPanels ? 2 : 0);
  const reactorCanvasHeight = Math.max(8, Math.min(14, Math.floor(contentRows * 0.42)));
  const chartWidth = clamp(Math.floor(layout.width * (layout.wide ? 0.5 : 0.9)), 28, 132);
  const canvasWidth = clamp(Math.floor(layout.width * (layout.wide ? 0.48 : 0.9)), 26, 116);
  debugSnapshot("engineering.layout", {
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
    tallViewport,
    showSecondaryPanels,
    showControlsSummary,
    useWideRow,
    forceStackViaEnv,
    renderMode,
    leftPanePanelCount,
    rightPanePanelCount,
    reactorCanvasHeight,
  });
  const subsystemNames = props.state.subsystems.map((subsystem) => subsystem.name);
  const [selectedSubsystemId, setSelectedSubsystemId] = ctx.useState<string | null>(
    props.state.subsystems[0]?.id ?? null,
  );

  const reactorPalette = ctx.useMemo(
    () =>
      Object.freeze({
        background: toHex(tokens.bg.panel.inset),
        border: toHex(tokens.border.default),
        arcPrimary: toHex(tokens.accent.brand),
        arcSecondary: toHex(tokens.accent.warn),
        coreFill: toHex(tokens.accent.success),
        coreStroke: toHex(tokens.state.focusRing),
        linePrimary: toHex(tokens.accent.info),
        lineAlternate: toHex(tokens.accent.brand),
        text: toHex(tokens.text.primary),
      }),
    [props.state.themeName],
  );
  const pulse = useSequence(ctx, [0.2, 1, 0.4, 0.8], {
    duration: 180,
    loop: true,
  });
  const boostValue = useSpring(ctx, props.state.boostActive ? 0.95 : 0.45, {
    stiffness: 170,
    damping: 18,
  });
  const stagger = useStagger(ctx, subsystemNames, { delay: 70, duration: 260 });

  const childrenByParent = ctx.useMemo(
    () => buildSubsystemChildren(props.state.subsystems),
    [props.state.subsystems],
  );
  const roots = childrenByParent.get(null) ?? [];

  const heatmapData = ctx.useMemo(
    () =>
      Object.freeze(
        Array.from({ length: 6 }, (_, row) =>
          Object.freeze(
            Array.from({ length: 8 }, (_, col) => {
              const index = (row * 8 + col) % props.state.subsystems.length;
              const subsystem = props.state.subsystems[index];
              return subsystem ? subsystem.temperature : 280;
            }),
          ),
        ),
      ),
    [props.state.subsystems],
  );

  const selectedSubsystem = selectedSubsystemId
    ? props.state.subsystems.find((item) => item.id === selectedSubsystemId) ?? null
    : null;
  const reactorPrev =
    props.state.telemetryHistory[props.state.telemetryHistory.length - 2] ??
    props.state.telemetry.reactorPower;
  const reactorTrend = props.state.telemetry.reactorPower - reactorPrev;
  const shieldPrev =
    props.state.shieldHistory[props.state.shieldHistory.length - 2] ?? props.state.telemetry.shieldStrength;
  const shieldTrend = props.state.telemetry.shieldStrength - shieldPrev;
  const degradedSubsystems = props.state.subsystems.filter(
    (subsystem) => subsystem.health < props.state.alertThreshold,
  ).length;

  const reactorPanel = layout.hideNonCritical
    ? surfacePanel(tokens, "Reactor Schematic", [
        ui.callout("Reactor canvas hidden in compact layout. Core metrics remain available.", {
          variant: "info",
          title: "Compact Mode",
        }),
        progressRow(tokens, "Boost", boostValue, {
          labelWidth: 12,
          width: 24,
          trend: props.state.boostActive ? 1 : 0,
          tone: props.state.boostActive ? "warning" : "default",
        }),
        progressRow(tokens, "Reactor", props.state.telemetry.reactorPower / 100, {
          labelWidth: 12,
          width: 24,
          trend: reactorTrend,
          tone: props.state.telemetry.reactorPower > 92 ? "warning" : "default",
        }),
      ])
    : surfacePanel(tokens, "Reactor Schematic", [
        ui.canvas({
          id: ctx.id("reactor-canvas"),
          width: Math.max(32, canvasWidth),
          height: reactorCanvasHeight,
          blitter: "braille",
          draw: (canvas) => {
            debugSnapshot("engineering.canvas.draw", {
              viewportCols: props.state.viewportCols,
              viewportRows: props.state.viewportRows,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              useWideRow,
              renderMode,
            });
            drawReactor(canvas, pulse, boostValue, reactorPalette);
          },
        }),
        progressRow(tokens, "Boost", boostValue, {
          labelWidth: 12,
          width: 28,
          trend: props.state.boostActive ? 1 : 0,
          tone: props.state.boostActive ? "warning" : "default",
        }),
        progressRow(tokens, "Reactor", props.state.telemetry.reactorPower / 100, {
          labelWidth: 12,
          width: 28,
          trend: reactorTrend,
          tone: props.state.telemetry.reactorPower > 92 ? "warning" : "default",
        }),
        ui.row({ gap: SPACE.sm, wrap: true }, [
          ui.text(`Core ${formatPower(props.state.telemetry.reactorPower)}`, {
            variant: "caption",
            style: { fg: tokens.text.dim, dim: true },
          }),
          ui.text("|", { variant: "caption", style: { fg: tokens.border.muted } }),
          ui.text(`Shields ${formatPower(props.state.telemetry.shieldStrength)}`, {
            variant: "caption",
            style: { fg: tokens.text.dim, dim: true },
          }),
          ui.text(`(${shieldTrend >= 0 ? "+" : ""}${Math.round(shieldTrend)})`, {
            variant: "code",
            style: {
              fg: shieldTrend >= 0 ? tokens.accent.success : tokens.accent.warn,
              bold: true,
            },
          }),
        ]),
      ]);

  const treePanel = surfacePanel(tokens, "Subsystem Tree", [
    sectionHeader(tokens, "Hierarchy", "Guided tree view with clear selection"),
    ui.tree<Subsystem>({
      id: ctx.id("engineering-tree"),
      data: roots,
      getKey: (node) => node.id,
      getChildren: (node) => childrenByParent.get(node.id),
      expanded: props.state.expandedSubsystemIds,
      ...(selectedSubsystemId ? { selected: selectedSubsystemId } : {}),
      showLines: true,
      indentSize: 2,
      onToggle: (node) => props.dispatch({ type: "toggle-subsystem", subsystemId: node.id }),
      onSelect: (node) => setSelectedSubsystemId(node.id),
      renderNode: (node, depth, state: NodeState) =>
        ui.row({ gap: SPACE.xs, wrap: false }, [
          ui.text(`${"| ".repeat(depth)}${state.expanded ? "v" : state.hasChildren ? ">" : "-"}`, {
            variant: "code",
            style: state.selected
              ? { fg: tokens.state.focusRing, bold: true }
              : { fg: tokens.border.muted },
          }),
          ui.text(node.name, {
            style: state.selected
              ? { fg: tokens.text.primary, bold: true }
              : { fg: tokens.text.primary },
          }),
          ui.spacer({ flex: 1 }),
          ui.tag(formatPower(node.health), {
            variant: node.health < props.state.alertThreshold ? "warning" : "success",
          }),
        ]),
      dsTone: "default",
    }),
    selectedSubsystem
      ? ui.callout(
          `${selectedSubsystem.name} · ${formatPower(selectedSubsystem.power)} power · ${formatTemperature(selectedSubsystem.temperature)}`,
          { variant: "info", title: "Selected" },
        )
      : ui.text("Select a subsystem for details", { variant: "caption" }),
  ]);

  const powerPanel = surfacePanel(tokens, "Power Distribution", [
    sectionHeader(tokens, "Power Lanes", "Fixed labels and aligned percentages"),
    each(
      props.state.subsystems,
      (subsystem, index) =>
        ui.column({ key: subsystem.id, gap: SPACE.xs }, [
          progressRow(tokens, subsystem.name, subsystem.power / 100, {
            labelWidth: 18,
            width: Math.max(22, chartWidth - 8),
            tone: subsystem.health < props.state.alertThreshold ? "warning" : "default",
            trend: subsystem.health < props.state.alertThreshold ? -1 : 1,
          }),
          ...(props.state.engineeringDiagMode
            ? [
                progressRow(tokens, "Boot", stagger[index] ?? 0, {
                  labelWidth: 18,
                  width: Math.max(22, chartWidth - 8),
                  tone: "success",
                  trend: 1,
                }),
              ]
            : []),
        ]),
      { key: (subsystem) => subsystem.id },
    ),
  ]);

  const thermalPanel = surfacePanel(tokens, "Thermal Map", [
    ui.heatmap({
      id: ctx.id("engineering-heatmap"),
      width: Math.max(30, chartWidth),
      height: 10,
      data: heatmapData,
      colorScale: "inferno",
      min: 200,
      max: 620,
    }),
  ]);

  const diagnosticsPanel = surfacePanel(tokens, "Subsystem Diagnostics", [
    ui.accordion({
      id: ctx.id("engineering-accordion"),
      items: props.state.subsystems.slice(0, 6).map((subsystem) => ({
        key: subsystem.id,
        title: subsystem.name,
        content: ui.column({ gap: SPACE.xs }, [
          ui.text(`Health ${formatPower(subsystem.health)}`),
          ui.text(`Power ${formatPower(subsystem.power)}`),
          ui.text(`Temp ${formatTemperature(subsystem.temperature)}`),
        ]),
      })),
      expanded: props.state.expandedSubsystemIds,
      allowMultiple: true,
      onChange: (expanded) => {
        const next = new Set(expanded);
        for (const id of props.state.expandedSubsystemIds) {
          if (!next.has(id)) {
            props.dispatch({ type: "toggle-subsystem", subsystemId: id });
          }
        }
        for (const id of expanded) {
          if (!props.state.expandedSubsystemIds.includes(id)) {
            props.dispatch({ type: "toggle-subsystem", subsystemId: id });
          }
        }
      },
    }),
  ]);

  const leftPane = showSecondaryPanels
    ? ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
        ui.box({ border: "none", p: 0, width: "full", flex: 3, minHeight: 12 }, [reactorPanel]),
        ui.box({ border: "none", p: 0, width: "full", flex: 2, minHeight: 10, overflow: "hidden" }, [
          treePanel,
        ]),
      ])
    : ui.column({ gap: SPACE.sm, width: "full" }, [reactorPanel]);
  const rightPane = showSecondaryPanels
    ? ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
        ui.box({ border: "none", p: 0, width: "full", flex: 3, minHeight: 12, overflow: "hidden" }, [
          powerPanel,
        ]),
        ui.box({ border: "none", p: 0, width: "full", flex: 2, minHeight: 10 }, [thermalPanel]),
        ui.box({ border: "none", p: 0, width: "full", flex: 2, minHeight: 10, overflow: "hidden" }, [
          diagnosticsPanel,
        ]),
      ])
    : ui.column({ gap: SPACE.sm, width: "full" }, [powerPanel]);

  const responsiveDeckMinHeight = Math.max(
    16,
    contentRows - (showControlsSummary ? 12 : 10) - (showSecondaryPanels ? 0 : 2),
  );
  const responsiveDeckBody = useWideRow
    ? ui.row({ gap: SPACE.sm, items: "stretch", width: "full" }, [
        ui.box({ border: "none", p: 0, flex: 2 }, [leftPane]),
        ui.box({ border: "none", p: 0, flex: 3 }, [rightPane]),
      ])
    : ui.column({ gap: SPACE.sm, width: "full" }, [leftPane, rightPane]);
  const responsiveDeck = ui.box(
    {
      border: "none",
      p: 0,
      width: "full",
      flex: 1,
      minHeight: responsiveDeckMinHeight,
      overflow: "scroll",
    },
    [responsiveDeckBody],
  );

  const controlsPanel = surfacePanel(tokens, "Engineering Controls", [
    ui.actions([
      ui.button({
        id: ctx.id("boost-toggle"),
        label: props.state.boostActive ? "Disable Boost" : "Enable Boost",
        intent: props.state.boostActive ? "warning" : "primary",
        dsSize: "md",
        onPress: () => props.dispatch({ type: "toggle-boost" }),
      }),
      ui.button({
        id: ctx.id("diag-toggle"),
        label: props.state.engineeringDiagMode ? "Diagnostics Off" : "Diagnostics On",
        intent: "secondary",
        dsSize: "md",
        onPress: () => props.dispatch({ type: "toggle-diagnostics" }),
      }),
    ]),
    ui.row({ gap: SPACE.sm, wrap: true }, [
      ui.badge(`Core ${formatPower(props.state.telemetry.reactorPower)}`, { variant: "info" }),
      ui.badge(
        `Heat ${formatTemperature(
          Math.round(
            props.state.subsystems.reduce((sum, subsystem) => sum + subsystem.temperature, 0) /
              Math.max(1, props.state.subsystems.length),
          ),
        )}`,
        { variant: "warning" },
      ),
    ]),
  ]);

  const controlsSummary = surfacePanel(
    tokens,
    "Deck Snapshot",
    [
      sectionHeader(tokens, "Status Grid", "Subsystem readiness and power envelope"),
      ui.row({ gap: SPACE.xs, wrap: true }, [
        ui.badge(`Subsystems ${props.state.subsystems.length}`, { variant: "info" }),
        ui.badge(`Degraded ${degradedSubsystems}`, {
          variant: degradedSubsystems > 0 ? "warning" : "success",
        }),
        ui.badge(props.state.engineeringDiagMode ? "Diagnostics Active" : "Diagnostics Idle", {
          variant: props.state.engineeringDiagMode ? "success" : "default",
        }),
      ]),
      progressRow(tokens, "Reactor", props.state.telemetry.reactorPower / 100, {
        labelWidth: 10,
        width: 20,
        trend: reactorTrend,
        tone: props.state.telemetry.reactorPower > 92 ? "warning" : "default",
      }),
      progressRow(tokens, "Shields", props.state.telemetry.shieldStrength / 100, {
        labelWidth: 10,
        width: 20,
        trend: shieldTrend,
        tone: props.state.telemetry.shieldStrength < 40 ? "warning" : "success",
      }),
    ],
    { tone: "inset" },
  );

  const controlsRegion = showControlsSummary
    ? ui.row({ gap: SPACE.sm, items: "start", width: "full", wrap: false }, [
        ui.box(
          {
            border: "none",
            p: 0,
            // Helper-first: replaces raw `expr("max(56, viewport.w * 0.62)")`.
            width: widthConstraints.minViewportPercent({ ratio: 0.62, min: 56 }),
          },
          [controlsPanel],
        ),
        ui.box(
          {
            border: "none",
            p: 0,
            // Helper-first: replaces raw `expr("max(34, viewport.w * 0.34)")`.
            width: widthConstraints.minViewportPercent({ ratio: 0.34, min: 34 }),
          },
          [controlsSummary],
        ),
      ])
    : controlsPanel;

  debugSnapshot("engineering.render", {
    viewportCols: props.state.viewportCols,
    viewportRows: props.state.viewportRows,
    renderMode,
    includeControlsSummary: showControlsSummary,
    includeResponsiveDeck: renderMode === "full",
    responsiveDeckMode: useWideRow ? "row" : "column",
    forceStackViaEnv,
    responsiveDeckMinHeight,
  });

  if (veryCompactHeight) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [controlsPanel]);
  }

  if (compactHeight) {
    return ui.column({ gap: SPACE.sm, width: "full" }, [controlsPanel, reactorPanel]);
  }

  return ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
    controlsRegion,
    responsiveDeck,
  ]);
});

export function renderEngineeringScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  return renderShell({
    title: "Engineering Deck",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "full", height: "full" }, [
      EngineeringDeck({
        key: "engineering-deck",
        state: context.state,
        dispatch: deps.dispatch,
      }),
    ]),
  });
}
