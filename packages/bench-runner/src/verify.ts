import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";

import { diffScreens, runInPty } from "@rezi-ui/ink-compat-bench-harness";

type RendererName = "real-ink" | "ink-compat";

function parseRendererName(value: string): RendererName {
  if (value === "real-ink" || value === "ink-compat") return value;
  throw new Error(`Invalid renderer: ${value}`);
}

function linkInkForRenderer(repoRoot: string, renderer: RendererName): void {
  const benchNodeModules = path.join(repoRoot, "packages/bench-app/node_modules");
  mkdirSync(benchNodeModules, { recursive: true });
  const linkPath = path.join(benchNodeModules, "ink");
  rmSync(linkPath, { force: true });
  const target =
    renderer === "real-ink"
      ? path.join(repoRoot, "node_modules/@jrichman/ink")
      : path.join(repoRoot, "packages/ink-compat");
  symlinkSync(target, linkPath, "junction");
}

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireArg(name: string): string {
  const v = readArg(name);
  if (!v) throw new Error(`Missing --${name}`);
  return v;
}

async function openControlServer(socketPath: string): Promise<{
  sendLine: (obj: unknown) => void;
  waitForClient: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
}> {
  rmSync(socketPath, { force: true });
  let sock: net.Socket | null = null;
  const server = net.createServer((s) => {
    sock = s;
    sock.setNoDelay(true);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });

  const waitForClient = async (timeoutMs: number): Promise<boolean> => {
    if (sock) return true;
    return await Promise.race([
      new Promise<boolean>((resolve) => server.once("connection", () => resolve(true))),
      delay(timeoutMs).then(() => false),
    ]);
  };

  const sendLine = (obj: unknown): void => {
    sock?.write(`${JSON.stringify(obj)}\n`);
  };

  const close = async (): Promise<void> => {
    try {
      sock?.destroy();
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(socketPath, { force: true });
  };

  return { sendLine, waitForClient, close };
}

async function driveScenario(
  scenario: string,
  seed: number,
  control: Awaited<ReturnType<typeof openControlServer>>,
): Promise<void> {
  const ok = await control.waitForClient(4000);
  if (!ok) return;
  control.sendLine({ type: "init", seed });
  if (scenario === "streaming-chat") {
    for (let i = 0; i < 120; i++) {
      control.sendLine({ type: "token", text: `t=${i} verify` });
      await delay(8);
    }
  } else {
    for (let i = 0; i < 60; i++) {
      control.sendLine({ type: "tick" });
      await delay(16);
    }
  }
  control.sendLine({ type: "done" });
}

async function runOnce(
  repoRoot: string,
  scenario: string,
  renderer: RendererName,
  outDir: string,
): Promise<string> {
  linkInkForRenderer(repoRoot, renderer);
  const appEntry = path.join(repoRoot, "packages/bench-app/dist/entry.js");
  const cols = Number.parseInt(process.env["BENCH_COLS"] ?? "80", 10) || 80;
  const rows = Number.parseInt(process.env["BENCH_ROWS"] ?? "24", 10) || 24;
  const controlSocket = path.join(
    os.tmpdir(),
    `inkbench_verify_${process.pid}_${Math.trunc(performance.now())}_${renderer}.sock`,
  );
  const controlServer = await openControlServer(controlSocket);

  const runPromise = runInPty({
    cwd: repoRoot,
    command: process.execPath,
    args: ["--no-warnings", appEntry],
    env: {
      ...process.env,
      BENCH_SCENARIO: scenario,
      BENCH_RENDERER: renderer,
      BENCH_OUT_DIR: outDir,
      BENCH_COLS: String(cols),
      BENCH_ROWS: String(rows),
      BENCH_CONTROL_SOCKET: controlSocket,
      BENCH_TIMEOUT_MS: process.env["BENCH_TIMEOUT_MS"] ?? "15000",
      BENCH_EXIT_AFTER_DONE_MS: process.env["BENCH_EXIT_AFTER_DONE_MS"] ?? "300",
      BENCH_INK_COMPAT_PHASES: process.env["BENCH_INK_COMPAT_PHASES"] ?? "1",
      BENCH_MAX_FPS: process.env["BENCH_MAX_FPS"] ?? "60",
    },
    cols,
    rows,
    outDir,
    rawOutputFile: "pty-output.bin",
    screenFile: "screen-final.txt",
    stableWindowMs: 250,
    meaningfulPaintText: "BENCH_READY",
    procSampleIntervalMs: 50,
  });

  const drivePromise = driveScenario(scenario, 7331, controlServer).finally(() =>
    controlServer.close(),
  );

  await Promise.all([runPromise, drivePromise]);
  return readFileSync(path.join(outDir, "screen-final.txt"), "utf8");
}

async function main(): Promise<void> {
  const scenario = requireArg("scenario");
  const rawCompare = requireArg("compare").split(",");
  if (rawCompare.length !== 2 || !rawCompare[0] || !rawCompare[1]) {
    throw new Error(
      `--compare must be "real-ink,ink-compat" (got ${JSON.stringify(rawCompare)})`,
    );
  }
  const compare = [parseRendererName(rawCompare[0]), parseRendererName(rawCompare[1])] as const;

  const repoRoot = process.cwd();
  const outRoot = path.resolve(readArg("out") ?? "results");
  mkdirSync(outRoot, { recursive: true });
  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");

  const runA = path.join(outRoot, `verify_${scenario}_${compare[0]}_${startedAt}`);
  const runB = path.join(outRoot, `verify_${scenario}_${compare[1]}_${startedAt}`);
  mkdirSync(runA, { recursive: true });
  mkdirSync(runB, { recursive: true });

  const aScreen = await runOnce(repoRoot, scenario, compare[0], runA);
  const bScreen = await runOnce(repoRoot, scenario, compare[1], runB);

  const cols = Number.parseInt(process.env["BENCH_COLS"] ?? "80", 10) || 80;
  const rows = Number.parseInt(process.env["BENCH_ROWS"] ?? "24", 10) || 24;

  const toSnap = (screen: string) => {
    const lines = screen.split("\n");
    return {
      cols,
      rows,
      lines: lines.map((l) => l.padEnd(cols, " ").slice(0, cols)).slice(0, rows),
      hash: "",
    };
  };

  const diff = diffScreens(toSnap(aScreen), toSnap(bScreen));
  const out = { scenario, compare, equalFinalScreen: diff.equal, diff };
  const outFile = path.join(outRoot, `verify_${scenario}_${startedAt}.json`);
  writeFileSync(outFile, JSON.stringify(out, null, 2));

  if (!diff.equal) {
    console.error(`Final screen mismatch at row ${diff.firstDiffRow ?? "?"}`);
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
