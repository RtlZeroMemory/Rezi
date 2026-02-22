import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { createBlessedOutput } from "../frameworks/blessed.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { benchAsync } from "../measure.js";
import type { BenchMetrics, ScenarioConfig } from "../types.js";

type ReactFactory = Readonly<{
  createElement: typeof import("react").createElement;
}>;

type InkComponents = Readonly<{ Box: unknown; Text: unknown }>;

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

function reactTree(
  ReactMod: ReactFactory,
  C: InkComponents,
  lines: readonly string[],
): import("react").ReactNode {
  const h = ReactMod.createElement;
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 0 },
    ...lines.map((line, i) => h(C.Text as string, { key: String(i) }, line)),
  );
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

export async function runInkCompatLineScenario(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  buildLines: LineBuilder,
  mode: UpdateMode = "direct",
): Promise<BenchMetrics> {
  const React = (await import("react")) as ReactFactory;
  const InkCompat = (await import("@rezi-ui/ink-compat")) as unknown as InkComponents & {
    render: (
      node: import("react").ReactNode,
      opts: unknown,
    ) => Readonly<{ rerender: (node: import("react").ReactNode) => void; unmount: () => void }>;
  };
  const backend = await createBenchBackend();

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(reactTree(React, InkCompat, buildLines(0, params)), {
    internal_backend: backend,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const tick = i + 1;
      const p = backend.waitForFrame();
      await delayTrigger(mode, () =>
        instance.rerender(reactTree(React, InkCompat, buildLines(tick, params))),
      );
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const tick = config.warmup + i + 1;
        const p = backend.waitForFrame();
        await delayTrigger(mode, () =>
          instance.rerender(reactTree(React, InkCompat, buildLines(tick, params))),
        );
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = backend.frameCount - frameBase;
    metrics.bytesProduced = backend.totalFrameBytes - bytesBase;
    return metrics;
  } finally {
    instance.unmount();
  }
}

export async function runInkLineScenario(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  buildLines: LineBuilder,
  mode: UpdateMode = "direct",
): Promise<BenchMetrics> {
  const React = (await import("react")) as ReactFactory;
  const Ink = (await import("ink")) as unknown as InkComponents & {
    render: (
      node: import("react").ReactNode,
      opts: unknown,
    ) => Readonly<{ rerender: (node: import("react").ReactNode) => void; unmount: () => void }>;
  };
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initial = stdout.waitForWrite();
  const instance = Ink.render(reactTree(React, Ink, buildLines(0, params)), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const tick = i + 1;
      const p = stdout.waitForWrite();
      await delayTrigger(mode, () =>
        instance.rerender(reactTree(React, Ink, buildLines(tick, params))),
      );
      await p;
    }

    const bytesBase = stdout.totalBytes;
    const writesBase = stdout.writeCount;
    const metrics = await benchAsync(
      async (i) => {
        const tick = config.warmup + i + 1;
        const p = stdout.waitForWrite();
        await delayTrigger(mode, () =>
          instance.rerender(reactTree(React, Ink, buildLines(tick, params))),
        );
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = Math.max(0, stdout.writeCount - writesBase);
    metrics.bytesProduced = stdout.totalBytes - bytesBase;
    return metrics;
  } finally {
    instance.unmount();
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
