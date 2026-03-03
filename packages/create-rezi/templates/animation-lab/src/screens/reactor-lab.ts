import {
  defineWidget,
  heightConstraints,
  rgb,
  ui,
  useSequence,
  useSpring,
  useStagger,
  useTransition,
  visibilityConstraints,
  widthConstraints,
  type CanvasContext,
  type VNode,
} from "@rezi-ui/core";
import { APP_NAME, PRODUCT_TAGLINE, TEMPLATE_LABEL } from "../theme.js";
import type { AnimationLabState } from "../types.js";

type Palette = Readonly<{
  title: number;
  accent: string;
  core: string;
  hot: string;
  wave: string;
  module: number;
}>;

const PALETTES: readonly Palette[] = Object.freeze([
  Object.freeze({
    title: rgb(120, 225, 255),
    accent: "#80dfff",
    core: "#62ffd2",
    hot: "#ffd28a",
    wave: "#98ffc2",
    module: rgb(204, 232, 244),
  }),
  Object.freeze({
    title: rgb(173, 198, 255),
    accent: "#9fb4ff",
    core: "#7ee6ff",
    hot: "#ffb26b",
    wave: "#c4ff8f",
    module: rgb(214, 222, 245),
  }),
  Object.freeze({
    title: rgb(160, 255, 205),
    accent: "#84ffd4",
    core: "#65f5b2",
    hot: "#ffc66f",
    wave: "#9cf4ff",
    module: rgb(209, 239, 224),
  }),
  Object.freeze({
    title: rgb(255, 212, 150),
    accent: "#ffd48e",
    core: "#ffc871",
    hot: "#ff8c6a",
    wave: "#a7ffe3",
    module: rgb(240, 224, 208),
  }),
]);

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function toHex(r: number, g: number, b: number): string {
  const rr = Math.round(clamp(r, 0, 255)).toString(16).padStart(2, "0");
  const gg = Math.round(clamp(g, 0, 255)).toString(16).padStart(2, "0");
  const bb = Math.round(clamp(b, 0, 255)).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

function paletteForPhase(phase: number): Palette {
  return PALETTES[phase % PALETTES.length] ?? PALETTES[0]!;
}

function buildSeries(
  points: number,
  clock: number,
  flux: number,
  drift: number,
  orbit: number,
  offset: number,
): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = clock * 0.16 + i * 0.34 + offset;
    const value =
      0.5 +
      Math.sin(t + orbit * 1.7) * 0.28 +
      Math.sin(t * 0.37 + drift * 2.2) * 0.16 +
      Math.cos(t * 0.19 + offset) * 0.09 +
      (flux - 0.5) * 0.24;
    out.push(clamp01(value));
  }
  return Object.freeze(out);
}

function buildScatterPoints(
  count: number,
  clock: number,
  flux: number,
  drift: number,
  orbit: number,
  phase: number,
): readonly Readonly<{ x: number; y: number; color?: string }>[] {
  const out: Array<Readonly<{ x: number; y: number; color?: string }>> = [];
  for (let i = 0; i < count; i++) {
    const base = clock * 0.08 + i * 0.77;
    const x = 50 + Math.sin(base + drift * 1.5 + phase * 0.2) * 46;
    const y = 30 + Math.cos(base * 1.31 + orbit * 2.2) * (20 + flux * 8);
    const t = clamp01((i % 10) / 9);

    out.push(
      Object.freeze({
        x,
        y,
        color: toHex(130 + 90 * t, 190 + 50 * (1 - t), 220 + 25 * Math.sin(base * 0.4)),
      }),
    );
  }
  return Object.freeze(out);
}

type ReactorDrawParams = Readonly<{
  clock: number;
  phase: number;
  flux: number;
  drift: number;
  orbit: number;
  burst: number;
  pulse: number;
  palette: Palette;
}>;

function drawReactorField(ctx: CanvasContext, params: ReactorDrawParams): void {
  const width = ctx.width;
  const height = ctx.height;
  const centerX = width * 0.34 + params.drift * 3;
  const centerY = height * 0.48 + Math.sin(params.clock * 0.08) * 1.1;

  for (let y = 0; y < height; y++) {
    const ny = (y / Math.max(1, height - 1)) * 2 - 1;
    const scan = 0.92 + 0.08 * Math.sin(y * 1.3 + params.clock * 0.28);

    for (let x = 0; x < width; x++) {
      const nx = (x / Math.max(1, width - 1)) * 2 - 1;
      const radial = Math.sqrt((nx + params.drift * 0.15) ** 2 + (ny * 1.05) ** 2);
      const haze = clamp01(1 - radial * 1.2);
      const swirl = 0.5 + 0.5 * Math.sin(nx * 5 - ny * 3.5 + params.clock * 0.1 + params.orbit * 3);
      const aurora = (0.5 + 0.5 * Math.sin(nx * 8 + params.clock * 0.12)) * 0.28;
      const burstGlow = params.burst * 0.32 * clamp01(1 - radial * 1.7);
      const r = (6 + 22 * haze + 32 * swirl + 80 * burstGlow) * scan;
      const g = (10 + 32 * haze + 78 * aurora + 34 * swirl + 70 * params.flux) * scan;
      const b = (18 + 70 * haze + 58 * swirl + 88 * params.orbit) * scan;
      ctx.setPixel(x, y, toHex(r, g, b));
    }
  }

  for (let i = 0; i < 64; i++) {
    const layer = i % 2 === 0 ? 1 : 2;
    const sx = Math.round(
      fract(noise(i * 13 + params.phase * 5) + params.clock * 0.0018 * layer + params.drift * 0.04) *
        (width - 1),
    );
    const sy = Math.round(
      fract(noise(i * 29 + params.phase * 11) + params.clock * 0.0011 * layer + params.orbit * 0.03) *
        Math.max(1, height - 2),
    );
    const twinkle = 0.5 + 0.5 * Math.sin(params.clock * 0.22 + i * 0.7);
    const color = toHex(160 + 80 * twinkle, 180 + 50 * twinkle, 220 + 35 * params.orbit);
    ctx.setPixel(sx, sy, color);
    if (layer === 2 && twinkle > 0.86) {
      ctx.setPixel(clamp(sx + 1, 0, width - 1), sy, "#d7f5ff");
    }
  }

  const coreRadius = 1.8 + params.flux * 2.6;
  const outerRadius = coreRadius + 3 + params.orbit * 2.3;
  ctx.fillCircle(centerX, centerY, coreRadius + params.burst * 0.6, params.palette.core);
  ctx.circle(centerX, centerY, coreRadius + 1.6, params.palette.accent);

  for (let ring = 0; ring < 3; ring++) {
    const rr = outerRadius + ring * 1.6;
    const direction = ring % 2 === 0 ? 1 : -1;
    const start = params.clock * 0.09 * direction + ring * 1.7;
    const span = Math.PI * (0.42 + ring * 0.17 + params.pulse * 0.18);
    const color = ring === 2 ? params.palette.hot : params.palette.accent;
    ctx.arc(centerX, centerY, rr, start, start + span, color);
  }

  for (let i = 0; i < 3; i++) {
    const angle = params.clock * 0.1 * (1 + i * 0.25) * (i % 2 === 0 ? 1 : -1) + i * 2.2 + params.orbit * Math.PI;
    const rr = outerRadius + 2.8 + i * 1.7;
    const x = centerX + Math.cos(angle) * rr;
    const y = centerY + Math.sin(angle) * rr * 0.6;
    ctx.fillCircle(x, y, 0.9, i === 1 ? params.palette.hot : params.palette.accent);

    const trail: Array<Readonly<{ x: number; y: number }>> = [];
    for (let trailStep = 1; trailStep <= 4; trailStep++) {
      const past = angle - trailStep * 0.22 * (i % 2 === 0 ? 1 : -1);
      trail.push(
        Object.freeze({
          x: centerX + Math.cos(past) * rr,
          y: centerY + Math.sin(past) * rr * 0.6,
        }),
      );
    }
    ctx.polyline(trail, "#8ad8ff");
  }

  if (params.burst > 0.08) {
    const shock = outerRadius + 2 + params.burst * 10;
    ctx.circle(centerX, centerY, shock, "#ffe2b6");
    ctx.circle(centerX, centerY, shock + 1.2, "#ffc79e");
  }

  for (let row = -1; row <= 1; row++) {
    const stream: Array<Readonly<{ x: number; y: number }>> = [];
    const span = Math.max(8, width - Math.round(centerX) - 3);
    for (let i = 0; i <= 12; i++) {
      const x = centerX + coreRadius + (i / 12) * span;
      const y =
        centerY +
        row * 1.8 +
        Math.sin(i * 0.7 + params.clock * 0.27 + row * 0.9) * (0.4 + params.flux * 1.1) +
        params.drift * 0.4;
      stream.push(Object.freeze({ x, y }));
    }
    ctx.polyline(stream, row === 0 ? "#9be6ff" : "#73ffd3");
  }

  const waveA: Array<Readonly<{ x: number; y: number }>> = [];
  const waveB: Array<Readonly<{ x: number; y: number }>> = [];
  const ampA = 0.9 + params.flux * 1.8 + params.burst * 1.3;
  const ampB = 0.7 + params.orbit * 1.6;

  for (let x = 0; x < width; x++) {
    const a = Math.sin(x * 0.35 - params.clock * 0.22 + params.drift * 2.1);
    const b = Math.sin(x * 0.2 + params.clock * 0.18 + params.orbit * 2.3);
    waveA.push(
      Object.freeze({
        x,
        y: clamp(Math.round(height - 2 - ((a * 0.5 + 0.5) * ampA + params.burst * 0.8)), 0, height - 1),
      }),
    );
    waveB.push(
      Object.freeze({
        x,
        y: clamp(Math.round(height - 2 - ((b * 0.5 + 0.5) * ampB)), 0, height - 1),
      }),
    );
  }

  ctx.polyline(waveA, params.palette.wave);
  ctx.polyline(waveB, "#8fd4ff");

  const stability = clamp01(0.58 + params.flux * 0.24 - params.burst * 0.2 + params.orbit * 0.08);
  ctx.text(2, 1, `flux ${String(Math.round(params.flux * 100)).padStart(3, "0")}%`, "#c8ffe7");
  ctx.text(
    Math.max(0, width - 18),
    1,
    `orbit ${String(Math.round(params.orbit * 100)).padStart(3, "0")}`,
    "#ffd7ac",
  );
  ctx.text(
    Math.max(0, Math.floor(width * 0.52)),
    Math.max(2, height - 3),
    `stability ${String(Math.round(stability * 100)).padStart(3, "0")}%`,
    "#b7cadf",
  );
}

type SpectrumRadarParams = Readonly<{
  clock: number;
  phase: number;
  flux: number;
  drift: number;
  orbit: number;
  burst: number;
  palette: Palette;
}>;

function drawSpectrumRadar(ctx: CanvasContext, params: SpectrumRadarParams): void {
  const width = ctx.width;
  const height = ctx.height;
  const splitY = clamp(Math.floor(height * 0.54), 3, height - 4);

  for (let y = 0; y < height; y++) {
    const blend = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const scan = 0.5 + 0.5 * Math.sin(x * 0.2 - params.clock * 0.35 + y * 0.14);
      const r = 6 + 12 * scan * (1 - blend);
      const g = 14 + 26 * scan + 20 * params.flux;
      const b = 18 + 34 * blend + 24 * params.orbit;
      ctx.setPixel(x, y, toHex(r, g, b));
    }
  }

  const bars = Math.max(8, Math.floor(width / 2));
  const bandWidth = width / bars;
  for (let i = 0; i < bars; i++) {
    const t = params.clock * 0.23 + i * 0.58;
    const level = clamp01(
      0.26 +
        Math.sin(t + params.phase * 0.4) * 0.3 +
        Math.sin(t * 0.37 + params.drift * 1.8) * 0.2 +
        params.flux * 0.36,
    );
    const barHeight = Math.max(1, Math.round(level * (splitY - 1)));
    const x0 = Math.floor(i * bandWidth);
    const x1 = Math.max(x0 + 1, Math.floor((i + 1) * bandWidth));
    for (let x = x0; x < x1 && x < width; x++) {
      for (let barY = 0; barY < barHeight; barY++) {
        const y = splitY - 1 - barY;
        const heat = barY / Math.max(1, splitY - 1);
        ctx.setPixel(
          x,
          y,
          toHex(
            48 + 105 * heat + params.burst * 55,
            130 + 105 * (1 - heat),
            102 + 118 * (0.42 + 0.58 * Math.sin(t + barY * 0.18)),
          ),
        );
      }
    }
  }

  const beamX = Math.floor(fract(params.clock * 0.03) * width);
  ctx.fillRect(beamX, 0, 2, splitY, "#a2f6d3");
  ctx.line(0, splitY - 1, width - 1, splitY - 1, params.palette.accent);

  const radarTop = splitY + 1;
  const radarHeight = Math.max(2, height - radarTop);
  const centerX = Math.floor(width * 0.5);
  const centerY = radarTop + Math.floor(radarHeight * 0.56);
  const radius = Math.max(2, Math.min(Math.floor(width * 0.42), Math.floor(radarHeight * 0.9)));

  ctx.circle(centerX, centerY, radius, "#3b7698");
  ctx.circle(centerX, centerY, Math.max(1, Math.floor(radius * 0.62)), "#58b7dc");
  ctx.line(centerX - radius, centerY, centerX + radius, centerY, "#2e6a86");
  ctx.line(
    centerX,
    centerY - Math.floor(radius * 0.58),
    centerX,
    centerY + Math.floor(radius * 0.58),
    "#2e6a86",
  );

  const sweep = params.clock * 0.17;
  const sweepX = Math.round(centerX + Math.cos(sweep) * radius);
  const sweepY = Math.round(centerY + Math.sin(sweep) * radius * 0.58);
  ctx.line(centerX, centerY, sweepX, sweepY, params.palette.wave);

  for (let i = 0; i < 10; i++) {
    const n = noise(i * 111 + params.phase * 9);
    const angle = n * Math.PI * 2 + params.clock * 0.05 * (1 + (i % 3));
    const rr = radius * (0.25 + fract(n * 6.3) * 0.72);
    const x = Math.round(centerX + Math.cos(angle) * rr);
    const y = Math.round(centerY + Math.sin(angle) * rr * 0.58);
    const blink = 0.45 + 0.55 * Math.sin(params.clock * 0.35 + i);
    ctx.setPixel(x, y, toHex(130 + 90 * blink, 205 + 40 * params.flux, 190 + 30 * params.orbit));
  }

  const lissa: Array<Readonly<{ x: number; y: number }>> = [];
  for (let i = 0; i < 28; i++) {
    const t = params.clock * 0.05 + i * 0.21;
    lissa.push(
      Object.freeze({
        x: centerX + Math.sin(t * 1.5 + params.drift) * radius * 0.8,
        y: centerY + Math.cos(t * 2.1 + params.orbit * 1.4) * radius * 0.36,
      }),
    );
  }
  ctx.polyline(lissa, "#8fd8ff");
}

type CommandDeckProps = Readonly<{
  key?: string;
  tick: number;
  phase: number;
  viewportCols: number;
  viewportRows: number;
  driftTarget: number;
  fluxTarget: number;
  orbitTarget: number;
  burstTarget: number;
  modules: readonly string[];
}>;

const CommandDeck = defineWidget<CommandDeckProps>((props, ctx): VNode => {
  const drift = useTransition(ctx, props.driftTarget, {
    duration: 460,
    easing: "easeInOutCubic",
  });
  const orbit = useTransition(ctx, props.orbitTarget, {
    duration: 520,
    easing: "easeInOutQuad",
  });
  const flux = useSpring(ctx, props.fluxTarget, {
    stiffness: 185,
    damping: 20,
    restDelta: 0.0005,
    restSpeed: 0.0005,
  });
  const burst = useSpring(ctx, props.burstTarget, {
    stiffness: 260,
    damping: 19,
    restDelta: 0.0005,
    restSpeed: 0.0005,
  });
  const pulse = useSequence(ctx, [0.2, 1, 0.35, 0.88], {
    duration: 200,
    easing: "easeInOutCubic",
    loop: true,
  });
  const stagger = useStagger(ctx, props.modules, {
    delay: 85,
    duration: 340,
    easing: "easeOutCubic",
  });

  const palette = paletteForPhase(props.phase);
  const shellWidth = clamp(props.viewportCols - 4, 20, 140);
  const shellHeight = clamp(props.viewportRows - 4, 8, 40);
  const compact = shellWidth < 72 || shellHeight < 26;
  const sidePanelWidth = compact ? clamp(Math.floor(shellWidth * 0.31), 14, 20) : 22;
  const leftPanelWidth = clamp(shellWidth - sidePanelWidth - 2, 20, 64);
  const coreCanvasWidth = clamp(leftPanelWidth - 4, 14, 48);
  const coreCanvasHeight = clamp(Math.floor(shellHeight * 0.24), 7, 13);
  const sideCanvasWidth = clamp(sidePanelWidth - 4, 8, 18);
  const spectrumHeight = compact ? 8 : 10;
  const streamChartHeight = compact ? 4 : 6;
  const streamScatterHeight = compact ? 4 : 6;
  const sparklineWidth = compact ? 14 : 22;
  const moduleLabelWidth = compact ? 20 : 32;
  const moduleProgressWidth = compact ? 10 : 16;
  const laneMax = compact ? 3 : 8;
  const visibleModules = compact ? props.modules.slice(0, 3) : props.modules;

  const reactorClock = props.tick + pulse * 7 + burst * 4;
  const streamA = buildSeries(40, reactorClock, flux, drift, orbit, 0);
  const streamB = buildSeries(40, reactorClock + 5, flux * 0.92, -drift, orbit, 1.8);
  const scatter = buildScatterPoints(26, reactorClock, flux, drift, orbit, props.phase);

  const beaconLane = clamp(
    Math.round((Math.sin(reactorClock * 0.18 + orbit * Math.PI) * 0.5 + 0.5) * Math.max(0, coreCanvasWidth - 3)),
    0,
    Math.max(0, coreCanvasWidth - 3),
  );

  const moduleRows = visibleModules.map((label, index) => {
    const reveal = clamp01(stagger[index] ?? 0);
    const progress = clamp01(
      0.14 +
        reveal *
          (0.62 + 0.38 * Math.sin(reactorClock * 0.21 + index * 0.84)) *
          (0.6 + flux * 0.45 + burst * 0.1),
    );
    const lane = clamp(Math.round((1 - reveal) * laneMax), 0, laneMax);
    const opacity = 0.22 + reveal * 0.78;

    return ui.row({ key: `module-row-${String(index)}`, gap: 1 }, [
      ui.spacer({ key: `module-spacer-${String(index)}`, size: lane }),
      ui.box(
        {
          key: `module-label-box-${String(index)}`,
          border: "none",
          width: moduleLabelWidth,
          height: 1,
          opacity,
          transition: {
            duration: 220,
            easing: "easeOutCubic",
            properties: ["position", "opacity"],
          },
        },
        [
          ui.text(`${String(index + 1).padStart(2, "0")}  ${label}`, {
            key: `module-label-${String(index)}`,
            style: { fg: palette.module },
          }),
        ],
      ),
      ui.progress(progress, {
        key: `module-progress-${String(index)}`,
        width: moduleProgressWidth,
        variant: "blocks",
        showPercent: false,
        style: { fg: rgb(122, 255, 203) },
        trackStyle: { fg: rgb(58, 86, 82) },
      }),
    ]);
  });

  return ui.column({ key: "command-root", gap: 1 }, [
    ui.row({ key: "top-grid", gap: 2 }, [
      ui.box(
        {
          key: "core-panel",
          border: "single",
          width: leftPanelWidth,
          p: 1,
          transition: {
            duration: 320,
            easing: "easeInOutCubic",
            properties: ["opacity"],
          },
        },
        [
          ui.row({ key: "hero-header", gap: 1, wrap: true }, [
            ui.text("Hyper Reactor Field", {
              key: "core-title",
              style: { fg: palette.title },
            }),
            ui.badge(TEMPLATE_LABEL, { key: "template-badge", variant: "info" }),
          ]),
          ui.text(PRODUCT_TAGLINE, {
            key: "core-tagline",
            style: { fg: rgb(152, 176, 200) },
          }),
          ui.row({ key: "beacon-lane", gap: 0 }, [
            ui.spacer({ key: "beacon-spacer", size: beaconLane }),
            ui.box(
              {
                key: "beacon-dot-box",
                border: "none",
                width: 3,
                height: 1,
                opacity: pulse,
                transition: {
                  duration: 160,
                  easing: "easeOutCubic",
                  properties: ["position", "opacity"],
                },
              },
              [
                ui.text("◆", {
                  key: "beacon-dot",
                  style: { fg: rgb(255, 228, 158) },
                }),
              ],
            ),
          ]),
          ui.canvas({
            key: "reactor-canvas",
            width: coreCanvasWidth,
            height: coreCanvasHeight,
            blitter: "braille",
            draw: (canvas) => {
              drawReactorField(canvas, {
                clock: reactorClock,
                phase: props.phase,
                flux,
                drift,
                orbit,
                burst,
                pulse,
                palette,
              });
            },
          }),
          ui.row({ key: "core-meters", gap: 2 }, [
            ui.gauge(flux, {
              key: "flux-gauge",
              label: "Flux",
              variant: "linear",
              thresholds: [
                { value: 0.35, variant: "warning" },
                { value: 0.7, variant: "success" },
                { value: 0.9, variant: "info" },
              ],
            }),
            ui.sparkline(streamA, {
              key: "flux-sparkline",
              width: sparklineWidth,
              highRes: true,
              blitter: "braille",
              style: { fg: rgb(132, 246, 198) },
            }),
          ]),
        ],
      ),
      ui.column({ key: "side-stack", gap: 1 }, [
        ui.box(
          {
            key: "spectrum-radar-panel",
            border: "single",
            width: sidePanelWidth,
            // Helper-first visibility over `expr("if(viewport.w < 70, 0, 1)")`.
            display: visibilityConstraints.viewportWidthAtLeast(70),
            p: 1,
            transition: {
              duration: 300,
              easing: "easeInOutQuad",
              properties: ["opacity"],
            },
          },
          [
            ui.text("Spectrum and Radar", {
              key: "spectrum-radar-title",
              style: { fg: rgb(174, 232, 255) },
            }),
            ui.canvas({
              key: "spectrum-radar-canvas",
              width: sideCanvasWidth,
              height: spectrumHeight,
              blitter: "braille",
              draw: (canvas) => {
                drawSpectrumRadar(canvas, {
                  clock: reactorClock,
                  phase: props.phase,
                  flux,
                  drift,
                  orbit,
                  burst,
                  palette,
                });
              },
            }),
          ],
        ),
        ui.box(
          {
            key: "stream-panel",
            border: "single",
            width: sidePanelWidth,
            // Helper-first visibility over `expr("if(viewport.h < 24, 0, 1)")`.
            display: visibilityConstraints.viewportHeightAtLeast(24),
            p: 1,
            transition: {
              duration: 320,
              easing: "easeInOutQuad",
              properties: ["opacity"],
            },
          },
          [
            ui.text("Telemetry Streams", {
              key: "stream-title",
              style: { fg: rgb(154, 198, 255) },
            }),
            ui.lineChart({
              key: "stream-chart",
              width: sideCanvasWidth,
              height: streamChartHeight,
              series: [
                {
                  label: "alpha",
                  color: "#8fe6ff",
                  data: streamA,
                },
                {
                  label: "beta",
                  color: "#ffd188",
                  data: streamB,
                },
              ],
              axes: { y: { min: 0, max: 1 } },
              showLegend: false,
              blitter: "quadrant",
            }),
            ui.scatter({
              key: "stream-scatter",
              width: sideCanvasWidth,
              height: streamScatterHeight,
              points: scatter,
              axes: { x: { min: 0, max: 100 }, y: { min: 0, max: 60 } },
              color: "#9fdfff",
              blitter: "quadrant",
            }),
          ],
        ),
      ]),
    ]),
    ui.box(
      {
        key: "modules-panel",
        border: "single",
        // Helper-first visibility over `expr("if(viewport.h < 22, 0, 1)")`.
        display: visibilityConstraints.viewportHeightAtLeast(22),
        p: 1,
        transition: {
          duration: 260,
          easing: "easeOutQuad",
          properties: ["opacity"],
        },
      },
      [
        ui.text("Module Sync Rails", {
          key: "modules-title",
          style: { fg: rgb(153, 255, 213) },
        }),
        ui.column({ key: "modules-list", gap: 0 }, moduleRows),
      ],
    ),
    ui.text(
      `flux=${String(Math.round(flux * 100)).padStart(3, "0")}%  orbit=${String(
        Math.round(orbit * 100),
      ).padStart(3, "0")}%  drift=${drift.toFixed(2)}  burst=${String(Math.round(burst * 100)).padStart(3, "0")}%`,
      {
        key: "metrics-readout",
        style: { fg: rgb(138, 166, 193) },
      },
    ),
  ]);
});

export function renderReactorLab(state: AnimationLabState): VNode {
  return ui.column({ key: "root", p: 1, gap: 1 }, [
    ui.row({ key: "brand-row", gap: 1, wrap: true }, [
      ui.text(APP_NAME, {
        key: "app-name",
        variant: "heading",
      }),
      ui.text("•", { key: "brand-dot" }),
      ui.text("Animation Lab", {
        key: "brand-name",
        style: { fg: rgb(150, 225, 255) },
      }),
    ]),
    ui.box(
      {
        key: "stage-shell",
        border: "double",
        // Helper-first viewport clamping over fragile raw `clamp(...)` expression strings.
        width: widthConstraints.clampedViewportMinus({ minus: 4, min: 20, max: 140 }),
        height: heightConstraints.clampedViewportMinus({ minus: 4, min: 8, max: 40 }),
        opacity: state.panelOpacity,
        p: 1,
        transition: {
          duration: 420,
          easing: "easeInOutCubic",
          properties: ["opacity"],
        },
      },
      [
        CommandDeck({
          key: "command-deck",
          tick: state.tick,
          phase: state.phase,
          viewportCols: state.viewportCols,
          viewportRows: state.viewportRows,
          driftTarget: state.driftTarget,
          fluxTarget: state.fluxTarget,
          orbitTarget: state.orbitTarget,
          burstTarget: state.burstTarget,
          modules: state.modules,
        }),
      ],
    ),
    ui.text(
      `tick=${String(state.tick).padStart(3, "0")}  viewport=${String(state.viewportCols)}x${String(
        state.viewportRows,
      )}  controls: space/p autoplay, enter step, arrows tune vectors, b burst, m palette, r random, q quit`,
      {
        key: "footer",
        style: { fg: rgb(130, 150, 180) },
      },
    ),
  ]);
}
