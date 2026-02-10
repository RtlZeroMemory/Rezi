import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assert, test } from "@rezi-ui/testkit";

type TerminalCtor = typeof import("@xterm/headless").Terminal;
type HeadlessTerminal = InstanceType<TerminalCtor>;

const COLS = 60;
const ROWS = 16;
const TIMEOUT_MS = 5000;

const isLinux = process.platform === "linux";
const scriptSkipReason = getScriptSkipReason();

async function loadTerminalCtor(): Promise<TerminalCtor> {
  const mod = await import("@xterm/headless");
  const candidate = mod as unknown as {
    Terminal?: TerminalCtor;
    default?: { Terminal?: TerminalCtor };
  };
  const Terminal = candidate.Terminal ?? candidate.default?.Terminal;
  if (!Terminal) {
    throw new Error("terminal e2e could not resolve @xterm/headless Terminal export");
  }
  return Terminal;
}

function snapshotScreen(term: HeadlessTerminal, rows: number): string[] {
  const buffer = term.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const line = buffer.getLine(i);
    out.push(line ? line.translateToString(true) : "");
  }
  return out;
}

function getScriptSkipReason(): string | null {
  if (!isLinux) return "linux-only";

  const probeDir = mkdtempSync(join(tmpdir(), "rezi-e2e-probe-"));
  const probePath = join(probeDir, "typescript");
  const probe = spawnSync("script", ["-q", "-c", "printf 'REZI_E2E_OK'", probePath], {
    stdio: "ignore",
  });
  if (probe.error) {
    return `terminal e2e requires 'script' (util-linux): ${probe.error.message}`;
  }

  try {
    const transcript = readFileSync(probePath, "utf8");
    if (transcript.includes("REZI_E2E_OK")) return null;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `terminal e2e could not read script transcript: ${detail}`;
  }

  return "terminal e2e requires script to run with a pseudo-tty";
}

test("terminal e2e renders real output", { skip: scriptSkipReason ?? false }, async () => {
  const Terminal = await loadTerminalCtor();
  const term = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  const appPath = fileURLToPath(new URL("./fixtures/terminal-app.js", import.meta.url));
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const transcriptDir = await mkdtemp(join(tmpdir(), "rezi-e2e-"));
  const transcriptPath = join(transcriptDir, "typescript");

  const quotedNode = JSON.stringify(process.execPath);
  const quotedApp = JSON.stringify(appPath);
  const command = `stty cols ${COLS} rows ${ROWS}; ${quotedNode} ${quotedApp}`;

  const child = spawn("script", ["-q", "-f", "-c", command, transcriptPath], {
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => resolve({ code, signal }));
    },
  );

  const timeout = delay(TIMEOUT_MS).then(() => {
    child.kill("SIGKILL");
    throw new Error("terminal e2e timed out");
  });

  const { code, signal } = await Promise.race([exit, timeout]);
  const transcript = await readFile(transcriptPath, "utf8");
  await new Promise<void>((resolve) => term.write(transcript, resolve));

  if (code !== 0) {
    throw new Error(
      `terminal app exited with code=${String(code)} signal=${String(signal)}\n${stderr}`,
    );
  }

  const lines = snapshotScreen(term, ROWS);
  const screen = lines.join("\n");

  assert.ok(screen.includes("E2E Terminal Render"), `missing title in screen:\n${screen}`);
  assert.ok(screen.includes("Step: 1"), `missing updated state in screen:\n${screen}`);
  assert.ok(screen.includes("Rezi UI"), `missing footer in screen:\n${screen}`);
});
