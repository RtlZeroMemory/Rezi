import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";

type RendererName = "real-ink" | "ink-compat";
type ScenarioName =
  | "streaming-chat"
  | "large-list-scroll"
  | "dashboard-grid"
  | "style-churn"
  | "resize-storm";

type ControlMsg =
  | Readonly<{ type: "init"; seed: number }>
  | Readonly<{ type: "tick"; n?: number }>
  | Readonly<{ type: "token"; text: string }>
  | Readonly<{ type: "done" }>;

type StdoutDelta = Readonly<{ writeMs: number; bytes: number; writes: number }>;

declare global {
  // eslint-disable-next-line no-var
  var __INK_COMPAT_BENCH_ON_FRAME: undefined | ((m: unknown) => void);
}

type InkCompatFrameBreakdown = Readonly<{
  translationMs: number;
  percentResolveMs: number;
  coreRenderMs: number;
  assignLayoutsMs: number;
  rectScanMs: number;
  ansiMs: number;
  nodes: number;
  ops: number;
  coreRenderPasses: number;
}>;

type FrameMetric = Readonly<{
  frame: number;
  tsMs: number;
  renderTotalMs: number;
  scheduleWaitMs: number | null;
  stdoutWriteMs: number;
  stdoutBytes: number;
  stdoutWrites: number;
  updatesRequestedDelta: number;
  translationMs: number | null;
  percentResolveMs: number | null;
  coreRenderMs: number | null;
  assignLayoutsMs: number | null;
  rectScanMs: number | null;
  ansiMs: number | null;
  nodes: number | null;
  ops: number | null;
  coreRenderPasses: number | null;
}>;

function resolveInkImpl(): { resolvedFrom: string; name: string; version: string } {
  const req = createRequire(import.meta.url);
  const inkEntryPath = req.resolve("ink");

  let pkgPath: string | null = null;
  let dir = path.dirname(inkEntryPath);
  for (let i = 0; i < 25; i += 1) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) {
      pkgPath = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const pkg =
    pkgPath === null
      ? null
      : (JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown; version?: unknown });
  return {
    resolvedFrom: pkgPath ?? inkEntryPath,
    name: typeof pkg?.name === "string" ? pkg.name : "unknown",
    version: typeof pkg?.version === "string" ? pkg.version : "unknown",
  };
}

function createStdoutWriteProbe(): {
  install: () => void;
  readAndReset: () => StdoutDelta;
} {
  let writeMs = 0;
  let bytes = 0;
  let writes = 0;

  const original = process.stdout.write.bind(process.stdout);

  const install = (): void => {
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = ((
      chunk: unknown,
      encoding?: unknown,
      cb?: unknown,
    ): boolean => {
      const start = performance.now();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const ret = (original as any)(chunk, encoding, cb) as boolean;
      const end = performance.now();
      writeMs += end - start;
      writes += 1;
      if (typeof chunk === "string") bytes += Buffer.byteLength(chunk, "utf8");
      else if (chunk instanceof Uint8Array) bytes += chunk.byteLength;
      return ret;
    }) as typeof process.stdout.write;
  };

  const readAndReset = (): StdoutDelta => {
    const d = { writeMs, bytes, writes };
    writeMs = 0;
    bytes = 0;
    writes = 0;
    return d;
  };

  return { install, readAndReset };
}

function useControlSocket(
  socketPath: string | undefined,
  onMsg: (msg: ControlMsg) => void,
): void {
  useEffect(() => {
    if (!socketPath) return;
    let buf = "";
    const client = net.createConnection(socketPath);
    client.setEncoding("utf8");
    client.on("data", (chunk) => {
      buf += chunk;
      while (true) {
        const idx = buf.indexOf("\n");
        if (idx === -1) break;
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as unknown;
          if (parsed && typeof parsed === "object" && "type" in (parsed as any)) {
            onMsg(parsed as ControlMsg);
          }
        } catch {
          // ignore
        }
      }
    });
    return () => {
      client.destroy();
    };
  }, [socketPath, onMsg]);
}

type ScenarioState = Readonly<{
  seed: number;
  updatesRequested: number;
  firstUpdateRequestedAtMs: number | null;
}>;

type ScenarioController = Readonly<{ onMsg: (msg: ControlMsg) => void }>;

function markUpdateRequested(stateRef: React.MutableRefObject<ScenarioState>): void {
  const cur = stateRef.current;
  stateRef.current = {
    ...cur,
    updatesRequested: cur.updatesRequested + 1,
    firstUpdateRequestedAtMs: cur.firstUpdateRequestedAtMs ?? performance.now(),
  };
}

type InlineSegment = Readonly<{
  text: string;
  kind: "plain" | "bold" | "code";
}>;

function parseInlineMarkup(text: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = [];
  let i = 0;
  let kind: InlineSegment["kind"] = "plain";
  let buf = "";

  const flush = (): void => {
    if (!buf) return;
    segments.push({ text: buf, kind });
    buf = "";
  };

  while (i < text.length) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (ch === "*" && next === "*") {
      flush();
      kind = kind === "bold" ? "plain" : "bold";
      i += 2;
      continue;
    }
    if (ch === "`") {
      flush();
      kind = kind === "code" ? "plain" : "code";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }

  flush();
  return segments;
}

function StreamingChatScenario(props: {
  stateRef: React.MutableRefObject<ScenarioState>;
  setController: (c: ScenarioController) => void;
}): React.ReactElement {
  const [lines, setLines] = useState<string[]>([""]);
  const [tokenCount, setTokenCount] = useState(0);
  const [scrollLock, setScrollLock] = useState(true);
  const tokenRef = useRef(0);

  useInput((input) => {
    if (input === "s") setScrollLock((v) => !v);
  });

  useEffect(() => {
    props.setController({
      onMsg: (msg) => {
        if (msg.type !== "token") return;
        tokenRef.current += 1;
        setTokenCount(tokenRef.current);
        setLines((prev) => {
          const next = prev.length > 800 ? prev.slice(prev.length - 800) : prev.slice();
          if (next.length === 0) next.push("");
          const lastIndex = next.length - 1;
          const last = next[lastIndex] ?? "";
          next[lastIndex] = last.length === 0 ? msg.text : `${last} ${msg.text}`;

          // Insert deterministic "code blocks" periodically.
          const t = tokenRef.current;
          if (t % 53 === 0) {
            next.push("```js");
            next.push("const x = 1 + 2; // codeblock");
            next.push("console.log(x)");
            next.push("```");
            next.push("");
          } else if (t % 12 === 0) {
            next.push("");
          }
          return next;
        });
        markUpdateRequested(props.stateRef);
      },
    });
  }, [props]);

  const visible = scrollLock ? lines.slice(-12) : lines.slice(0, 12);
  return (
    <Box flexDirection="column">
      <Text>BENCH_READY streaming-chat tokens={tokenCount} scrollLock={String(scrollLock)}</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        {visible.map((line, i) => {
          if (line.startsWith("```")) {
            return (
              <Text key={`${i}-${line}`} color="magenta" dimColor>
                {line}
              </Text>
            );
          }
          const segments = parseInlineMarkup(line);
          return (
            <Text key={`${i}-${line}`} wrap="wrap">
              {segments.map((seg, j) => {
                if (seg.kind === "plain") return seg.text;
                if (seg.kind === "bold") {
                  return (
                    <Text key={j} bold>
                      {seg.text}
                    </Text>
                  );
                }
                return (
                  <Text key={j} color="yellow" backgroundColor="black">
                    {seg.text}
                  </Text>
                );
              })}
            </Text>
          );
        })}
      </Box>
      <Text dimColor>Keys: s=toggle-scroll-lock</Text>
    </Box>
  );
}

function LargeListScrollScenario(props: {
  stateRef: React.MutableRefObject<ScenarioState>;
  setController: (c: ScenarioController) => void;
}): React.ReactElement {
  const rowCount = 10_000;
  const viewportRows = 16;
  const [scroll, setScroll] = useState(0);
  const [tick, setTick] = useState(0);

  useInput((_input, key) => {
    if (key.downArrow) {
      setScroll((s) => Math.min(rowCount - viewportRows, s + 1));
      markUpdateRequested(props.stateRef);
    }
    if (key.upArrow) {
      setScroll((s) => Math.max(0, s - 1));
      markUpdateRequested(props.stateRef);
    }
  });

  useEffect(() => {
    props.setController({
      onMsg: (msg) => {
        if (msg.type !== "tick") return;
        setTick((t) => t + (msg.n ?? 1));
        markUpdateRequested(props.stateRef);
      },
    });
  }, [props]);

  const rows: React.ReactElement[] = [];
  for (let i = 0; i < viewportRows; i++) {
    const idx = scroll + i;
    const hot = (idx + tick) % 97 === 0;
    rows.push(
      <Text key={idx} {...(hot ? { color: "green" as const } : {})}>
        {String(idx).padStart(5, "0")} row={idx} tick={tick} {hot ? "[hot]" : ""}
      </Text>,
    );
  }

  return (
    <Box flexDirection="column">
      <Text>BENCH_READY large-list-scroll scroll={scroll} tick={tick}</Text>
      <Box flexDirection="column">{rows}</Box>
      <Text dimColor>Keys: ↑/↓ (scripted) to scroll</Text>
    </Box>
  );
}

function DashboardGridScenario(props: {
  stateRef: React.MutableRefObject<ScenarioState>;
  setController: (c: ScenarioController) => void;
}): React.ReactElement {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    props.setController({
      onMsg: (msg) => {
        if (msg.type !== "tick") return;
        setTick((t) => t + (msg.n ?? 1));
        markUpdateRequested(props.stateRef);
      },
    });
  }, [props]);

  const bar = (n: number): string => {
    const pct = n % 100;
    const filled = Math.round((pct / 100) * 20);
    return `${"█".repeat(filled)}${"░".repeat(20 - filled)} ${String(pct).padStart(3, " ")}%`;
  };

  return (
    <Box flexDirection="column">
      <Text>BENCH_READY dashboard-grid tick={tick}</Text>
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>CPU</Text>
          <Text color="green">{bar(tick * 3)}</Text>
          <Text dimColor>threads: 8</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>MEM</Text>
          <Text color="yellow">{bar(tick * 5)}</Text>
          <Text dimColor>rss: sampled</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>NET</Text>
          <Text color="cyan">{bar(tick * 7)}</Text>
          <Text dimColor>offline</Text>
        </Box>
      </Box>
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Queue</Text>
          <Text>{bar(tick * 11)}</Text>
          <Text dimColor>stable: true</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Workers</Text>
          <Text>{bar(tick * 13)}</Text>
          <Text dimColor>ok: 16</Text>
        </Box>
      </Box>
    </Box>
  );
}

function StyleChurnScenario(props: {
  stateRef: React.MutableRefObject<ScenarioState>;
  setController: (c: ScenarioController) => void;
}): React.ReactElement {
  const [tick, setTick] = useState(0);
  const palette = ["red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

  useEffect(() => {
    props.setController({
      onMsg: (msg) => {
        if (msg.type !== "tick") return;
        setTick((t) => t + (msg.n ?? 1));
        markUpdateRequested(props.stateRef);
      },
    });
  }, [props]);

  const lines: React.ReactElement[] = [];
  for (let i = 0; i < 18; i++) {
    const fg = palette[(tick + i) % palette.length] ?? "white";
    const bg = palette[(tick * 3 + i) % palette.length] ?? "black";
    const bold = (tick + i) % 3 === 0;
    const italic = (tick + i) % 5 === 0;
    const underline = (tick + i) % 7 === 0;
    lines.push(
      <Text
        key={i}
        {...{ color: fg, backgroundColor: bg }}
        bold={bold}
        italic={italic}
        underline={underline}
      >
        line {String(i).padStart(2, "0")} fg={fg} bg={bg} bold={String(bold)} italic=
        {String(italic)} underline={String(underline)} tick={tick}
      </Text>,
    );
  }

  return (
    <Box flexDirection="column">
      <Text>BENCH_READY style-churn tick={tick}</Text>
      <Box flexDirection="column">{lines}</Box>
    </Box>
  );
}

function ResizeStormScenario(props: {
  stateRef: React.MutableRefObject<ScenarioState>;
  setController: (c: ScenarioController) => void;
}): React.ReactElement {
  const [tick, setTick] = useState(0);
  const [resizesSeen, setResizesSeen] = useState(0);

  useEffect(() => {
    props.setController({
      onMsg: (msg) => {
        if (msg.type !== "tick") return;
        setTick((t) => t + (msg.n ?? 1));
        setResizesSeen((c) => c + 1);
        markUpdateRequested(props.stateRef);
      },
    });
  }, [props]);

  return (
    <Box flexDirection="column">
      <Text>BENCH_READY resize-storm tick={tick} resizes={resizesSeen}</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text>Viewport is driven by PTY resizes (runner).</Text>
        <Text dimColor>tick={tick}</Text>
      </Box>
    </Box>
  );
}

type StdoutWriteProbe = ReturnType<typeof createStdoutWriteProbe>;

function BenchApp(props: {
  scenario: ScenarioName;
  renderer: RendererName;
  outDir: string;
  controlSocketPath: string | undefined;
  stdoutProbe: StdoutWriteProbe;
}): React.ReactElement {
  const { exit } = useApp();
  const stdoutProbe = props.stdoutProbe;
  const framesRef = useRef<FrameMetric[]>([]);
  const startAt = useMemo(() => performance.now(), []);
  const lastUpdatesRequestedRef = useRef(0);

  const stateRef = useRef<ScenarioState>({
    seed: 1,
    updatesRequested: 0,
    firstUpdateRequestedAtMs: null,
  });

  const compatFrameRef = useRef<InkCompatFrameBreakdown | null>(null);
  useEffect(() => {
    if (process.env["BENCH_INK_COMPAT_PHASES"] === "1") {
      globalThis.__INK_COMPAT_BENCH_ON_FRAME = (m) => {
        compatFrameRef.current = m as InkCompatFrameBreakdown;
      };
    }
    return () => {
      globalThis.__INK_COMPAT_BENCH_ON_FRAME = undefined;
    };
  }, []);

  const pendingMsgsRef = useRef<ControlMsg[]>([]);
  const controllerRef = useRef<ScenarioController>({
    onMsg: (msg) => {
      pendingMsgsRef.current.push(msg);
    },
  });
  const setController = (c: ScenarioController): void => {
    controllerRef.current = c;
    const pending = pendingMsgsRef.current;
    if (pending.length > 0) {
      pendingMsgsRef.current = [];
      for (const msg of pending) c.onMsg(msg);
    }
  };

  const [doneSeq, setDoneSeq] = useState(0);

  const onMsg = useMemo(
    () =>
      (msg: ControlMsg): void => {
        if (msg.type === "init") {
          stateRef.current = { ...stateRef.current, seed: msg.seed };
          return;
        }
        if (msg.type === "done") {
          setDoneSeq((s) => s + 1);
          return;
        }
        controllerRef.current.onMsg(msg);
      },
    [],
  );

  useControlSocket(props.controlSocketPath, onMsg);

  useEffect(() => {
    if (doneSeq <= 0) return;
    const ms =
      Number.parseInt(process.env["BENCH_EXIT_AFTER_DONE_MS"] ?? "300", 10) ||
      300;
    const t = setTimeout(() => exit(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [doneSeq, exit]);

  useEffect(() => {
    const ms = Number.parseInt(process.env["BENCH_TIMEOUT_MS"] ?? "15000", 10) || 15000;
    const t = setTimeout(() => exit(new Error(`bench timeout ${ms}ms`)), ms);
    return () => clearTimeout(t);
  }, [exit]);

  (globalThis as unknown as { __BENCH_ON_RENDER?: (renderTimeMs: number) => void }).__BENCH_ON_RENDER =
    (renderTimeMs: number): void => {
      const now = performance.now();
      const tsMs = now - startAt;

      const state = stateRef.current;
      const updatesDelta = state.updatesRequested - lastUpdatesRequestedRef.current;
      lastUpdatesRequestedRef.current = state.updatesRequested;

      const stdout = stdoutProbe.readAndReset();

      let scheduleWaitMs: number | null = null;
      if (state.firstUpdateRequestedAtMs != null) {
        const frameStartApprox = now - renderTimeMs;
        scheduleWaitMs = Math.max(0, frameStartApprox - state.firstUpdateRequestedAtMs);
        stateRef.current = { ...stateRef.current, firstUpdateRequestedAtMs: null };
      }

      const compat = compatFrameRef.current;
      compatFrameRef.current = null;

      framesRef.current.push({
        frame: framesRef.current.length + 1,
        tsMs,
        renderTotalMs: renderTimeMs,
        scheduleWaitMs,
        stdoutWriteMs: stdout.writeMs,
        stdoutBytes: stdout.bytes,
        stdoutWrites: stdout.writes,
        updatesRequestedDelta: updatesDelta,
        translationMs: compat?.translationMs ?? null,
        percentResolveMs: compat?.percentResolveMs ?? null,
        coreRenderMs: compat?.coreRenderMs ?? null,
        assignLayoutsMs: compat?.assignLayoutsMs ?? null,
        rectScanMs: compat?.rectScanMs ?? null,
        ansiMs: compat?.ansiMs ?? null,
        nodes: compat?.nodes ?? null,
        ops: compat?.ops ?? null,
        coreRenderPasses: compat?.coreRenderPasses ?? null,
      });
    };

  useEffect(() => {
    return () => {
      delete (globalThis as any).__BENCH_ON_RENDER;
    };
  }, []);

  useEffect(() => {
    return () => {
      mkdirSync(props.outDir, { recursive: true });
      writeFileSync(
        path.join(props.outDir, "frames.jsonl"),
        `${framesRef.current.map((x) => JSON.stringify(x)).join("\n")}\n`,
      );
    };
  }, [props.outDir]);

  if (props.scenario === "streaming-chat") {
    return <StreamingChatScenario stateRef={stateRef} setController={setController} />;
  }
  if (props.scenario === "large-list-scroll") {
    return <LargeListScrollScenario stateRef={stateRef} setController={setController} />;
  }
  if (props.scenario === "dashboard-grid") {
    return <DashboardGridScenario stateRef={stateRef} setController={setController} />;
  }
  if (props.scenario === "style-churn") {
    return <StyleChurnScenario stateRef={stateRef} setController={setController} />;
  }
  return <ResizeStormScenario stateRef={stateRef} setController={setController} />;
}

function main(): void {
  const scenario = (process.env["BENCH_SCENARIO"] as ScenarioName | undefined) ?? "streaming-chat";
  const renderer = (process.env["BENCH_RENDERER"] as RendererName | undefined) ?? "real-ink";
  const outDir = process.env["BENCH_OUT_DIR"] ?? "results/tmp";
  const cols = Number.parseInt(process.env["BENCH_COLS"] ?? "80", 10) || 80;
  const rows = Number.parseInt(process.env["BENCH_ROWS"] ?? "24", 10) || 24;
  const controlSocketPath = process.env["BENCH_CONTROL_SOCKET"];

  const inkImpl = resolveInkImpl();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "run-meta.json"),
    JSON.stringify({ scenario, renderer, cols, rows, inkImpl, node: process.version }, null, 2),
  );

  const stdoutProbe = createStdoutWriteProbe();
  stdoutProbe.install();

  render(
    <BenchApp
      scenario={scenario}
      renderer={renderer}
      outDir={outDir}
      controlSocketPath={controlSocketPath}
      stdoutProbe={stdoutProbe}
    />,
    {
      alternateBuffer: false,
      incrementalRendering: true,
      maxFps: Number.parseInt(process.env["BENCH_MAX_FPS"] ?? "60", 10) || 60,
      patchConsole: false,
      debug: false,
      onRender: ({ renderTime }) => {
        const hook = (globalThis as unknown as { __BENCH_ON_RENDER?: (rt: number) => void })
          .__BENCH_ON_RENDER;
        hook?.(renderTime);
      },
    },
  );
}

main();
