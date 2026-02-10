import { createApp, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import { brandColors, reziCompactLogo, span } from "./brand.js";

const bg = brandColors.bg;
const panel = brandColors.panel;
const panelAlt = brandColors.panelAlt;
const panelRaised = brandColors.panelRaised;
const border = brandColors.border;
const borderBright = brandColors.borderBright;
const accent = brandColors.accent;
const accentWarm = brandColors.accentWarm;
const success = brandColors.success;
const warning = brandColors.warning;
const fg = brandColors.fg;
const fgMuted = brandColors.fgMuted;
const fgDim = brandColors.fgDim;

const s = span;

const stages = [
  { label: "Bootstrap", icon: "↓", dur: 14 },
  { label: "Compile", icon: "⚙", dur: 20 },
  { label: "Unit Tests", icon: "✓", dur: 22 },
  { label: "Lint", icon: "◎", dur: 14 },
  { label: "Bundle", icon: "◫", dur: 16 },
  { label: "Publish", icon: "▲", dur: 14 },
] as const;

const stageStart: number[] = [];
let pipelineDuration = 0;
for (const stage of stages) {
  stageStart.push(pipelineDuration);
  pipelineDuration += stage.dur;
}

const loopHoldTicks = 22;
const loopTicks = pipelineDuration + loopHoldTicks;

const spinnerFrames = ["◐", "◓", "◑", "◒"] as const;

function spinner(tick: number): string {
  return spinnerFrames[tick % spinnerFrames.length] ?? "◐";
}

function stageProgress(tick: number, index: number): number {
  const t = tick % loopTicks;
  const start = stageStart[index] ?? 0;
  const dur = stages[index]?.dur ?? 1;

  if (t < start) return 0;
  if (t >= start + dur) return 1;

  const x = (t - start) / dur;
  return 1 - (1 - x) ** 3;
}

function stageState(progress: number): "offline" | "busy" | "online" {
  if (progress <= 0) return "offline";
  if (progress >= 1) return "online";
  return "busy";
}

function spark(tick: number, base: number, amp: number, freq: number, points = 28): number[] {
  const values: number[] = [];
  for (let i = 0; i < points; i++) {
    values.push(
      base + amp * Math.sin((tick + i) * freq) + amp * 0.28 * Math.cos((tick + i) * freq * 1.7),
    );
  }
  return values;
}

function metricTile(label: string, value: string, suffix: string, color: typeof accent) {
  return ui.box(
    { flex: 1, border: "rounded", px: 1, py: 0, style: { bg: panelRaised, fg: border } },
    [
      ui.column({ gap: 0 }, [
        ui.text(label, { style: { fg: fgDim } }),
        ui.richText([s(value, { fg: color, bold: true }), s(` ${suffix}`, { fg: fgMuted })]),
      ]),
    ],
  );
}

type State = { tick: number };

const app = createApp<State>({
  backend: createNodeBackend({ fpsCap: 10 }),
  config: { fpsCap: 10 },
  initialState: { tick: 0 },
});

app.view(({ tick }) => {
  const progress = stages.map((_, i) => stageProgress(tick, i));
  const allDone = progress.every((v) => v >= 1);
  const activeIndex = allDone ? -1 : progress.findIndex((v) => v < 1);
  const completedCount = progress.filter((v) => v >= 1).length;
  const activeStage = activeIndex >= 0 ? (stages[activeIndex]?.label ?? "") : "Observe";
  const stageText = activeStage.padEnd(10, " ");
  const statusText = (allDone ? "COMPLETED" : "IN PROGRESS").padEnd(11, " ");

  const fps = Math.round(59 + 5 * Math.sin(tick * 0.22));
  const mem = Math.round(52 + 14 * Math.sin(tick * 0.15));
  const p95 = Math.round(6 + 2.8 * Math.abs(Math.sin(tick * 0.17)));
  const workers = 4 + Math.round(Math.max(0, Math.sin(tick * 0.09)));
  const coreLoad = Math.round(38 + 7 * Math.abs(Math.sin(tick * 0.13)));
  const nodeLoad = Math.round(25 + 8 * Math.abs(Math.sin(tick * 0.11 + 1.2)));
  const jsxLoad = Math.round(14 + 6 * Math.abs(Math.sin(tick * 0.16 + 2.1)));
  const loadTotal = coreLoad + nodeLoad + jsxLoad;
  const shineColumn = (tick * 2) % 18;
  const logoLines = reziCompactLogo(shineColumn);

  return ui.box({ flex: 1, style: { bg } }, [
    ui.column({ flex: 1, gap: 0, items: "stretch" }, [
      ui.box(
        {
          border: "rounded",
          mx: 1,
          mt: 1,
          px: 1,
          py: 0,
          style: { bg: panel, fg: borderBright },
        },
        [
          ui.row({ gap: 2, items: "start" }, [
            ui.column({ flex: 1, gap: 0 }, [
              ...logoLines.map((line) => ui.richText(line)),
              ui.richText([
                s("Alpha release pipeline", { fg: fgMuted }),
                s("  •  ", { fg: fgDim }),
                s("checks running", { fg: accentWarm, bold: true }),
              ]),
            ]),
            ui.column({ width: 26, gap: 0, items: "end" }, [
              ui.richText([
                s(` ${statusText} `, {
                  fg: bg,
                  bg: allDone ? success : accent,
                  bold: true,
                }),
              ]),
              ui.richText([
                s("Tick ", { fg: fgDim }),
                s(String(tick).padStart(3, "0"), { fg: fgMuted, bold: true }),
                s(" / ", { fg: fgDim }),
                s(String(loopTicks).padStart(3, "0"), { fg: fgDim }),
              ]),
              ui.richText([
                s("Stage: ", { fg: fgDim }),
                s(stageText, { fg: allDone ? success : warning, bold: true }),
              ]),
            ]),
          ]),
        ],
      ),

      ui.row({ flex: 1, gap: 1, px: 1, py: 1, items: "stretch" }, [
        ui.box({ flex: 3, border: "rounded", px: 1, style: { bg: panelAlt, fg: borderBright } }, [
          ui.column(
            { gap: 0 },
            stages.flatMap((stage, i) => {
              const p = progress[i] ?? 0;
              const done = p >= 1;
              const active = i === activeIndex;
              const activeFrames = ["-", "\\", "|", "/"] as const;
              const activeFrame = activeFrames[tick % activeFrames.length] ?? "-";
              const icon = done ? "[x]" : active ? `[${activeFrame}]` : "[ ]";
              const iconColor = done ? success : active ? accent : fgDim;
              const nameColor = done ? success : active ? fg : fgMuted;
              const statusLabel = done ? "done" : active ? `${Math.round(p * 100)}%` : "pending";
              const statusColor = done ? success : active ? accentWarm : fgDim;

              return [
                ui.row({ gap: 1 }, [
                  ui.text(icon, { style: { fg: iconColor, bold: done || active } }),
                  // Leading spacer absorbs occasional first-cell clipping on some terminal/font combos.
                  ui.text(` ${stage.label.padEnd(12, " ")}`, {
                    style: { fg: nameColor, bold: active },
                  }),
                  ui.text(statusLabel.padStart(8, " "), {
                    style: { fg: statusColor, bold: done || active },
                  }),
                ]),
                active
                  ? ui.progress(p, {
                      variant: "bar",
                      trackStyle: { fg: fgDim },
                      style: { fg: accent },
                    })
                  : done
                    ? ui.progress(1, { variant: "minimal", style: { fg: success } })
                    : ui.progress(0, { variant: "minimal", style: { fg: fgDim } }),
              ];
            }),
          ),
        ]),

        ui.column({ flex: 2, gap: 1 }, [
          ui.row({ gap: 1 }, [
            metricTile("FPS", String(fps), "avg", success),
            metricTile("Memory", String(mem), "MB", accentWarm),
            metricTile("P95", String(p95), "ms", warning),
          ]),

          ui.box({ border: "rounded", px: 1, style: { bg: panelAlt, fg: border } }, [
            ui.column({ gap: 0 }, [
              ui.row({ gap: 1, items: "center" }, [
                ui.text("Runtime Budget", { style: { fg: fgMuted, bold: true } }),
                ui.richText([s("•", { fg: fgDim })]),
                ui.richText([
                  s(allDone ? "stable" : "active", {
                    fg: allDone ? success : accentWarm,
                    bold: true,
                  }),
                ]),
              ]),
              ui.divider({ char: "─" }),
              ui.miniChart(
                [
                  { label: "FPS", value: fps, max: 75 },
                  { label: "MEM", value: mem, max: 120 },
                  { label: "P95", value: p95, max: 20 },
                  { label: "WRK", value: workers, max: 8 },
                ],
                { variant: "pills" },
              ),
              ui.sparkline(spark(tick, 58, 4.8, 0.22), {
                min: 46,
                max: 70,
                style: { fg: success },
              }),
            ]),
          ]),

          ui.box({ border: "rounded", px: 1, flex: 1, style: { bg: panelAlt, fg: border } }, [
            ui.column({ gap: 0, flex: 1 }, [
              ui.row({ gap: 2 }, [
                ui.status(stageState(progress[0] ?? 0), { label: "Bootstrap", showLabel: true }),
                ui.status(stageState(progress[1] ?? 0), { label: "Compile", showLabel: true }),
                ui.status(stageState(progress[2] ?? 0), { label: "Tests", showLabel: true }),
              ]),
              ui.row({ gap: 2 }, [
                ui.status(stageState(progress[3] ?? 0), { label: "Lint", showLabel: true }),
                ui.status(stageState(progress[4] ?? 0), { label: "Bundle", showLabel: true }),
                ui.status(stageState(progress[5] ?? 0), { label: "Publish", showLabel: true }),
              ]),
              ui.richText([
                s("Release Status: ", { fg: fgDim }),
                s(allDone ? "all checks passing" : `${activeStage} running`, {
                  fg: allDone ? success : accentWarm,
                  bold: true,
                }),
              ]),
              ui.divider({ char: "─" }),
              ui.row({ justify: "between", items: "center" }, [
                ui.text("Component Load", { style: { fg: fgMuted, bold: true } }),
                ui.richText([
                  s(`${loadTotal}%`, { fg: accentWarm, bold: true }),
                  s(" total", { fg: fgDim }),
                ]),
              ]),
              ui.barChart(
                [
                  { label: "core", value: coreLoad, variant: "info" },
                  { label: "node", value: nodeLoad, variant: "success" },
                  { label: "jsx", value: jsxLoad, variant: "warning" },
                ],
                {
                  showValues: true,
                  maxBarLength: 20,
                  style: { fg: fgMuted },
                },
              ),
              ui.richText([
                s("core ", { fg: success }),
                s(`${coreLoad}%`, { fg: fg, bold: true }),
                s("  •  ", { fg: fgDim }),
                s("node ", { fg: accent }),
                s(`${nodeLoad}%`, { fg: fg, bold: true }),
                s("  •  ", { fg: fgDim }),
                s("jsx ", { fg: warning }),
                s(`${jsxLoad}%`, { fg: fg, bold: true }),
              ]),
              ui.sparkline(spark(tick, 49, 5.5, 0.2), {
                min: 38,
                max: 62,
                style: { fg: accent },
              }),
            ]),
          ]),
        ]),
      ]),

      ui.box(
        {
          border: "rounded",
          mx: 1,
          mb: 1,
          px: 1,
          py: 0,
          style: { bg: panel, fg: border },
        },
        [
          ui.row({ justify: "between", items: "center", gap: 2 }, [
            ui.row({ gap: 1, items: "center" }, [
              ui.badge(
                allDone ? "Pipeline complete" : `Stage ${completedCount + 1}/${stages.length}`,
                {
                  variant: allDone ? "success" : "info",
                },
              ),
              ui.badge("Stable frame output", { variant: "default" }),
              ui.badge("Low-latency renderer", { variant: "default" }),
            ]),
            ui.row({ gap: 1, items: "center" }, [
              ui.kbd("q", { style: { fg: fgMuted } }),
              ui.kbd(["Ctrl", "C"], { style: { fg: fgMuted } }),
              ui.richText([s("rezi-ui.dev", { fg: fgDim })]),
            ]),
          ]),
        ],
      ),
    ]),
  ]);
});

app.onEvent((ev) => {
  if (ev.kind !== "engine") return;
  if (ev.event.kind === "tick") app.update((st) => ({ tick: st.tick + 1 }));
  if (ev.event.kind === "resize") app.update((st) => ({ tick: st.tick + 1 }));
  if (ev.event.kind === "text" && (ev.event.codepoint === 113 || ev.event.codepoint === 81)) {
    void app.stop();
  }
});

app.keys({ q: () => app.stop(), "ctrl+c": () => app.stop() });

await app.start();
