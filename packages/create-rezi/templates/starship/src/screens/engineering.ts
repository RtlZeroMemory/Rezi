import {
  defineWidget,
  each,
  ui,
  useSequence,
  useSpring,
  useStagger,
  type CanvasContext,
  type NodeState,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { formatPower, formatTemperature } from "../helpers/formatters.js";
import { stylesForTheme, themeSpec } from "../theme.js";
import type { RouteDeps, StarshipState, Subsystem } from "../types.js";
import { renderShell } from "./shell.js";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildSubsystemChildren(subsystems: readonly Subsystem[]): Map<string | null, readonly Subsystem[]> {
  const map = new Map<string | null, Subsystem[]>();
  for (const subsystem of subsystems) {
    const list = map.get(subsystem.parent) ?? [];
    list.push(subsystem);
    map.set(subsystem.parent, list);
  }
  return map;
}

function toHex(color: Readonly<{ r: number; g: number; b: number }>): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
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
  const subsystemNames = props.state.subsystems.map((subsystem) => subsystem.name);
  const themeColors = themeSpec(props.state.themeName).theme.colors;
  const reactorPalette = ctx.useMemo(
    () =>
      Object.freeze({
        background: toHex(themeColors.bg.base),
        border: toHex(themeColors.border.default),
        arcPrimary: toHex(themeColors.accent.primary),
        arcSecondary: toHex(themeColors.warning),
        coreFill: toHex(themeColors.success),
        coreStroke: toHex(themeColors.accent.tertiary),
        linePrimary: toHex(themeColors.info),
        lineAlternate: toHex(themeColors.accent.secondary),
        text: toHex(themeColors.fg.primary),
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

  const leftPane = ui.column({ gap: 1 }, [
    ui.panel("Reactor Schematic", [
      ui.canvas({
        id: ctx.id("reactor-canvas"),
        width: 44,
        height: 14,
        blitter: "braille",
        draw: (canvas) => drawReactor(canvas, pulse, boostValue, reactorPalette),
      }),
      ui.gauge(boostValue, {
        label: `Boost ${formatPower(boostValue * 100)}`,
      }),
      ui.progress(props.state.telemetry.reactorPower / 100, {
        label: `Reactor Output ${formatPower(props.state.telemetry.reactorPower)}`,
      }),
    ]),
    ui.panel("Subsystem Tree", [
      ui.tree<Subsystem>({
        id: ctx.id("engineering-tree"),
        data: roots,
        getKey: (node) => node.id,
        getChildren: (node) => childrenByParent.get(node.id),
        expanded: props.state.expandedSubsystemIds,
        onToggle: (node) => props.dispatch({ type: "toggle-subsystem", subsystemId: node.id }),
        renderNode: (node, _depth, state: NodeState) =>
          ui.row({ gap: 1 }, [
            ui.text(state.expanded ? "v" : state.hasChildren ? ">" : "-", {
              variant: "code",
            }),
            ui.text(node.name),
            ui.tag(formatPower(node.health), {
              variant: node.health < props.state.alertThreshold ? "warning" : "success",
            }),
          ]),
        dsTone: "default",
      }),
    ]),
  ]);

  const rightPane = ui.column({ gap: 1 }, [
    ui.box(
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
          ui.text("Power Distribution", { variant: "heading" }),
          each(
            props.state.subsystems,
            (subsystem, index) =>
              ui.row({ key: subsystem.id, gap: 1, wrap: true }, [
                ui.text(subsystem.name, { variant: "caption" }),
                ui.progress(subsystem.power / 100, {
                  label: formatPower(subsystem.power),
                  dsTone: subsystem.health < props.state.alertThreshold ? "warning" : "default",
                }),
                ui.progress(stagger[index] ?? 0, {
                  label: "Init",
                }),
              ]),
            { key: (subsystem) => subsystem.id },
          ),
        ]),
      ],
    ),
    ui.panel("Thermal Map", [
      ui.heatmap({
        id: ctx.id("engineering-heatmap"),
        width: 44,
        height: 10,
        data: heatmapData,
        colorScale: "inferno",
        min: 200,
        max: 620,
      }),
    ]),
    ui.panel("Subsystem Diagnostics", [
      ui.accordion({
        id: ctx.id("engineering-accordion"),
        items: props.state.subsystems.slice(0, 6).map((subsystem) => ({
          key: subsystem.id,
          title: subsystem.name,
          content: ui.column({ gap: 1 }, [
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
    ]),
  ]);

  return ui.column({ gap: 1 }, [
    ui.panel("Engineering Controls", [
      ui.actions([
        ui.button({
          id: ctx.id("boost-toggle"),
          label: props.state.boostActive ? "Disable Boost" : "Enable Boost",
          intent: props.state.boostActive ? "warning" : "primary",
          onPress: () => props.dispatch({ type: "toggle-boost" }),
        }),
        ui.button({
          id: ctx.id("diag-toggle"),
          label: props.state.engineeringDiagMode ? "Diagnostics Off" : "Diagnostics On",
          intent: "secondary",
          onPress: () => props.dispatch({ type: "toggle-diagnostics" }),
        }),
      ]),
    ]),
    ui.splitPane(
      {
        id: ctx.id("engineering-split-pane"),
        direction: "horizontal",
        sizes: props.state.splitSizes,
        onResize: (sizes) => props.dispatch({ type: "set-split-sizes", sizes }),
      },
      [leftPane, rightPane],
    ),
  ]);
});

export function renderEngineeringScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  const styles = stylesForTheme(context.state.themeName);

  return renderShell({
    title: "Engineering Deck",
    context,
    deps,
    body: ui.card(
      {
        title: "Power and Thermal Control",
        style: styles.panelStyle,
      },
      [EngineeringDeck({ state: context.state, dispatch: deps.dispatch })],
    ),
  });
}
