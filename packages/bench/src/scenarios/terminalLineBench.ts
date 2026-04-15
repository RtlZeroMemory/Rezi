import { type VNode, ui } from "@rezi-ui/core";
import { createBlessedOutput } from "../frameworks/blessed.js";
import { createBenchBackend } from "../io.js";
import { benchAsync } from "../measure.js";
import type { BenchMetrics, ScenarioConfig } from "../types.js";

type BlessedElement = Readonly<{ setContent: (s: string) => void }>;
type BlessedScreen = Readonly<{
  append: (el: unknown) => void;
  once: (event: "render", cb: () => void) => void;
  render: () => void;
  destroy: () => void;
}>;
type BlessedModule = Readonly<{
  screen: (opts: unknown) => BlessedScreen;
  text: (opts: unknown) => BlessedElement;
}>;

export type UpdateMode = "direct" | "event-loop";
export type LineBuilder = (
  tick: number,
  params: Record<string, number | string>,
) => readonly string[];

async function loadBlessed(): Promise<BlessedModule> {
  const mod = (await import("blessed")) as unknown as { default?: unknown };
  return (mod.default ?? mod) as BlessedModule;
}

function reziTree(lines: readonly string[]): VNode {
  const nodes: VNode[] = [];
  for (const line of lines) nodes.push(ui.text(line));
  return ui.column({ p: 0 }, nodes);
}

async function delayTrigger(mode: UpdateMode, fn: () => void): Promise<void> {
  if (mode === "direct") {
    fn();
    return;
  }
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      fn();
      resolve();
    });
  });
}

export async function runReziLineScenario(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  buildLines: LineBuilder,
  mode: UpdateMode = "direct",
): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((s) => reziTree(buildLines(s.tick, params)));

  const initial = backend.waitForFrame();
  await app.start();
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      await delayTrigger(mode, () => app.update((st) => ({ tick: st.tick + 1 })));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        await delayTrigger(mode, () => app.update((st) => ({ tick: st.tick + 1 })));
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = backend.frameCount - frameBase;
    metrics.bytesProduced = backend.totalFrameBytes - bytesBase;
    return metrics;
  } finally {
    await app.stop();
    app.dispose();
  }
}

export async function runBlessedLineScenario(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  buildLines: LineBuilder,
  mode: UpdateMode = "direct",
): Promise<BenchMetrics> {
  const blessed = await loadBlessed();
  const output = createBlessedOutput();

  const screen = blessed.screen({
    smartCSR: true,
    output,
    input: process.stdin,
    warnings: false,
    dockBorders: false,
  });

  const initialLines = buildLines(0, params);
  const maxLines = Math.max(
    initialLines.length,
    buildLines(1, params).length,
    buildLines(2, params).length,
  );

  const lineNodes: BlessedElement[] = [];
  for (let i = 0; i < maxLines; i++) {
    const t = blessed.text({ top: i, left: 0, content: initialLines[i] ?? "" });
    lineNodes.push(t);
    screen.append(t);
  }

  const renderTick = async (tick: number): Promise<void> => {
    const lines = buildLines(tick, params);
    const doRender = () => {
      for (let i = 0; i < maxLines; i++) lineNodes[i]?.setContent(lines[i] ?? "");
      screen.render();
    };

    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));
    await delayTrigger(mode, doRender);
    await renderP;
  };

  try {
    await renderTick(0);
    for (let i = 0; i < config.warmup; i++) await renderTick(i + 1);

    const bytesBase = output.totalBytes;
    const metrics = await benchAsync(
      async (i) => renderTick(config.warmup + i + 1),
      0,
      config.iterations,
    );
    metrics.framesProduced = config.iterations;
    metrics.bytesProduced = output.totalBytes - bytesBase;
    return metrics;
  } finally {
    try {
      screen.destroy();
    } catch {
      // ignore
    }
  }
}
