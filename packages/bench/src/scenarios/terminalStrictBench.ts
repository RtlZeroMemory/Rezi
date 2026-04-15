import { type VNode, ui } from "@rezi-ui/core";
import { createBlessedOutput } from "../frameworks/blessed.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { runRatatuiScenario } from "../frameworks/ratatui.js";
import { createBenchBackend } from "../io.js";
import { benchAsync } from "../measure.js";
import { emitReziPerfSnapshot, resetReziPerfSnapshot } from "../reziProfile.js";
import type { BenchMetrics, ScenarioConfig } from "../types.js";
import {
  type StrictSections,
  type StrictVariant,
  buildStrictSections,
} from "./terminalStrictWorkloads.js";

type BlessedElement = Readonly<{ setContent: (s: string) => void }>;
type BlessedBox = Readonly<{
  append: (child: unknown) => void;
  setContent: (s: string) => void;
}>;
type BlessedScreen = Readonly<{
  append: (el: unknown) => void;
  once: (event: "render", cb: () => void) => void;
  render: () => void;
  destroy: () => void;
}>;
type BlessedModule = Readonly<{
  screen: (opts: unknown) => BlessedScreen;
  box: (opts: unknown) => BlessedBox;
  text: (opts: unknown) => BlessedElement;
}>;

async function loadBlessed(): Promise<BlessedModule> {
  const mod = (await import("blessed")) as unknown as { default?: unknown };
  return (mod.default ?? mod) as BlessedModule;
}

function panelLines(title: string, lines: readonly string[]): VNode[] {
  return [ui.text(title, { style: { bold: true } }), ...lines.map((line) => ui.text(line))];
}

function reziTree(sections: StrictSections): VNode {
  const leftWidth = 24;
  const rightWidth = 32;
  const bodyHeight = Math.max(1, sections.rows - 5);

  return ui.column({ width: sections.cols, height: sections.rows, gap: 0, overflow: "hidden" }, [
    ui.box({ border: "single", height: 3, overflow: "hidden", p: 0 }, [ui.text(sections.header)]),
    ui.row({ gap: 0, height: bodyHeight, overflow: "hidden" }, [
      ui.box({ border: "single", width: leftWidth, overflow: "hidden", p: 0 }, [
        ui.column(
          { gap: 0, overflow: "hidden" },
          panelLines(sections.leftTitle, sections.leftLines),
        ),
      ]),
      ui.box({ border: "single", flex: 1, overflow: "hidden", p: 0 }, [
        ui.column(
          { gap: 0, overflow: "hidden" },
          panelLines(sections.centerTitle, sections.centerLines),
        ),
      ]),
      ui.box({ border: "single", width: rightWidth, overflow: "hidden", p: 0 }, [
        ui.column(
          { gap: 0, overflow: "hidden" },
          panelLines(sections.rightTitle, sections.rightLines),
        ),
      ]),
    ]),
    ui.box({ border: "single", height: 2, overflow: "hidden", p: 0 }, [
      ui.column({ gap: 0, overflow: "hidden" }, [
        ui.text(sections.status),
        ui.text(sections.footer),
      ]),
    ]),
  ]);
}

async function runRezi(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  variant: StrictVariant,
): Promise<BenchMetrics> {
  const core = await import("@rezi-ui/core");
  const { createApp } = core;
  const backend = await createBenchBackend();

  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((s) => reziTree(buildStrictSections(s.tick, params, variant)));

  const initial = backend.waitForFrame();
  await app.start();
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      app.update((st) => ({ tick: st.tick + 1 }));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;
    resetReziPerfSnapshot(core);

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        app.update((st) => ({ tick: st.tick + 1 }));
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = backend.frameCount - frameBase;
    metrics.bytesProduced = backend.totalFrameBytes - bytesBase;
    emitReziPerfSnapshot(
      core,
      variant === "navigation" ? "terminal-strict-ui-navigation" : "terminal-strict-ui",
      params,
      config,
      metrics,
    );
    return metrics;
  } finally {
    await app.stop();
    app.dispose();
  }
}

async function runOpenTui(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  variant: StrictVariant,
): Promise<BenchMetrics> {
  const scenario =
    variant === "navigation" ? "terminal-strict-ui-navigation" : "terminal-strict-ui";
  return runOpenTuiScenario(scenario, config, params);
}

async function runBlessed(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  variant: StrictVariant,
): Promise<BenchMetrics> {
  const blessed = await loadBlessed();
  const output = createBlessedOutput();
  const sections0 = buildStrictSections(0, params, variant);

  const screen = blessed.screen({
    smartCSR: true,
    output,
    input: process.stdin,
    warnings: false,
    dockBorders: false,
  });

  const leftWidth = 24;
  const rightWidth = 32;
  const bodyHeight = Math.max(1, sections0.rows - 5);
  const centerWidth = Math.max(10, sections0.cols - leftWidth - rightWidth);

  const headerBox = blessed.box({
    top: 0,
    left: 0,
    width: sections0.cols,
    height: 3,
    border: { type: "line" },
    content: "",
  });
  const bodyBox = blessed.box({
    top: 3,
    left: 0,
    width: sections0.cols,
    height: bodyHeight,
    content: "",
  });
  const footerBox = blessed.box({
    top: 3 + bodyHeight,
    left: 0,
    width: sections0.cols,
    height: 2,
    border: { type: "line" },
    content: "",
  });

  const leftPanel = blessed.box({
    top: 0,
    left: 0,
    width: leftWidth,
    height: bodyHeight,
    border: { type: "line" },
    content: "",
  });
  const centerPanel = blessed.box({
    top: 0,
    left: leftWidth,
    width: centerWidth,
    height: bodyHeight,
    border: { type: "line" },
    content: "",
  });
  const rightPanel = blessed.box({
    top: 0,
    left: leftWidth + centerWidth,
    width: rightWidth,
    height: bodyHeight,
    border: { type: "line" },
    content: "",
  });

  bodyBox.append(leftPanel);
  bodyBox.append(centerPanel);
  bodyBox.append(rightPanel);
  screen.append(headerBox);
  screen.append(bodyBox);
  screen.append(footerBox);

  const leftNodes: BlessedElement[] = [];
  const centerNodes: BlessedElement[] = [];
  const rightNodes: BlessedElement[] = [];
  const maxLeft = sections0.leftLines.length + 1;
  const maxCenter = sections0.centerLines.length + 1;
  const maxRight = sections0.rightLines.length + 1;

  for (let i = 0; i < maxLeft; i++) {
    const node = blessed.text({ top: 1 + i, left: 1, content: "" });
    leftNodes.push(node);
    leftPanel.append(node);
  }
  for (let i = 0; i < maxCenter; i++) {
    const node = blessed.text({ top: 1 + i, left: 1, content: "" });
    centerNodes.push(node);
    centerPanel.append(node);
  }
  for (let i = 0; i < maxRight; i++) {
    const node = blessed.text({ top: 1 + i, left: 1, content: "" });
    rightNodes.push(node);
    rightPanel.append(node);
  }

  const footerStatus = blessed.text({ top: 1, left: 1, content: "" });
  const footerHelp = blessed.text({ top: 2, left: 1, content: "" });
  footerBox.append(footerStatus);
  footerBox.append(footerHelp);

  const renderTick = async (tick: number): Promise<void> => {
    const sections = buildStrictSections(tick, params, variant);
    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));

    headerBox.setContent(sections.header);
    leftNodes[0]?.setContent(sections.leftTitle);
    centerNodes[0]?.setContent(sections.centerTitle);
    rightNodes[0]?.setContent(sections.rightTitle);

    for (let i = 1; i < maxLeft; i++) leftNodes[i]?.setContent(sections.leftLines[i - 1] ?? "");
    for (let i = 1; i < maxCenter; i++)
      centerNodes[i]?.setContent(sections.centerLines[i - 1] ?? "");
    for (let i = 1; i < maxRight; i++) rightNodes[i]?.setContent(sections.rightLines[i - 1] ?? "");

    footerStatus.setContent(sections.status);
    footerHelp.setContent(sections.footer);

    screen.render();
    await renderP;
  };

  try {
    await renderTick(0);

    for (let i = 0; i < config.warmup; i++) await renderTick(i + 1);

    const bytesBase = output.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const tick = config.warmup + i + 1;
        await renderTick(tick);
      },
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

async function runRatatui(
  config: ScenarioConfig,
  params: Record<string, number | string>,
  variant: StrictVariant,
): Promise<BenchMetrics> {
  const scenario =
    variant === "navigation" ? "terminal-strict-ui-navigation" : "terminal-strict-ui";
  return runRatatuiScenario(scenario, config, params);
}

export async function runTerminalStrictScenario(
  framework: "rezi-native" | "opentui" | "opentui-core" | "bubbletea" | "blessed" | "ratatui",
  config: ScenarioConfig,
  params: Record<string, number | string>,
  variant: StrictVariant,
): Promise<BenchMetrics> {
  switch (framework) {
    case "rezi-native":
      return runRezi(config, params, variant);
    case "opentui":
    case "opentui-core":
    case "bubbletea":
      return runOpenTui(config, params, variant);
    case "blessed":
      return runBlessed(config, params, variant);
    case "ratatui":
      return runRatatui(config, params, variant);
  }
}
