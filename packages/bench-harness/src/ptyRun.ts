import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import pty from "node-pty";

import { sampleProcUntilExit, type ProcSample } from "./procSampler.js";
import { createScreen } from "./screen.js";

export type PtyRunOptions = Readonly<{
  cwd: string;
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  cols: number;
  rows: number;
  outDir: string;
  rawOutputFile: string;
  screenFile: string;
  stableWindowMs: number;
  meaningfulPaintText: string;
  inputScript?: readonly (
    | Readonly<{ kind: "write"; atMs: number; data: string }>
    | Readonly<{ kind: "resize"; atMs: number; cols: number; rows: number }>
  )[];
  procSampleIntervalMs: number;
}>;

export type PtyRunResult = Readonly<{
  wallStartMs: number;
  wallEndMs: number;
  durationMs: number;
  rawBytes: number;
  stableAtMs: number | null;
  meaningfulPaintAtMs: number | null;
  finalScreenHash: string;
  procSamples: readonly ProcSample[];
}>;

export async function runInPty(opts: PtyRunOptions): Promise<PtyRunResult> {
  mkdirSync(opts.outDir, { recursive: true });
  const screen = createScreen({ cols: opts.cols, rows: opts.rows });

  const wallStartMs = performance.now();
  let wallEndMs = wallStartMs;
  let exited = false;

  const term = pty.spawn(opts.command, [...opts.args], {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: {
      ...Object.fromEntries(Object.entries(opts.env).filter(([, v]) => v !== undefined)),
      TERM: "xterm-256color",
      COLUMNS: String(opts.cols),
      LINES: String(opts.rows),
      FORCE_COLOR: "1",
    },
  });

  const raw: Buffer[] = [];
  let rawBytes = 0;

  let lastHash = "";
  let lastChangeAt = wallStartMs;
  let stableAtMs: number | null = null;
  let meaningfulPaintAtMs: number | null = null;

  const applyChunk = async (chunk: string): Promise<void> => {
    await screen.write(chunk);
    const snap = screen.snapshot();
    if (snap.hash !== lastHash) {
      lastHash = snap.hash;
      lastChangeAt = performance.now();
    }
    if (
      meaningfulPaintAtMs == null &&
      snap.lines.some((l) => l.includes(opts.meaningfulPaintText))
    ) {
      meaningfulPaintAtMs = performance.now() - wallStartMs;
    }
  };

  term.onData((data) => {
    const buf = Buffer.from(data, "utf8");
    raw.push(buf);
    rawBytes += buf.length;
    void applyChunk(data);
  });

  const procSamplesPromise = sampleProcUntilExit(
    { pid: term.pid, intervalMs: opts.procSampleIntervalMs },
    () => exited,
  );

  const script = opts.inputScript ?? [];
  for (const step of script) {
    setTimeout(() => {
      try {
        if (step.kind === "write") term.write(step.data);
        else {
          term.resize(step.cols, step.rows);
          void screen.resize(step.cols, step.rows);
        }
      } catch {}
    }, Math.max(0, step.atMs));
  }

  await new Promise<void>((resolve) => {
    term.onExit(() => {
      exited = true;
      wallEndMs = performance.now();
      resolve();
    });
  });

  const procSamples = await procSamplesPromise;
  await screen.flush();
  const snap = screen.snapshot();

  if (wallEndMs - lastChangeAt >= opts.stableWindowMs) {
    stableAtMs = lastChangeAt - wallStartMs + opts.stableWindowMs;
  }

  writeFileSync(path.join(opts.outDir, opts.rawOutputFile), Buffer.concat(raw));
  writeFileSync(path.join(opts.outDir, opts.screenFile), `${snap.lines.join("\n")}\n`);

  return {
    wallStartMs,
    wallEndMs,
    durationMs: wallEndMs - wallStartMs,
    rawBytes,
    stableAtMs,
    meaningfulPaintAtMs,
    finalScreenHash: snap.hash,
    procSamples,
  };
}
