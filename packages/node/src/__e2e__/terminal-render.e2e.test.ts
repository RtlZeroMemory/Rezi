import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assert, test } from "@rezi-ui/testkit";

type TerminalCtor = typeof import("@xterm/headless").Terminal;
type HeadlessTerminal = InstanceType<TerminalCtor>;

const COLS = 60;
const ROWS = 16;
const TIMEOUT_MS = 5000;

const isLinux = process.platform === "linux";
const { REZI_E2E_PROFILE } = process.env;
const e2eProfile = REZI_E2E_PROFILE === "reduced" ? "reduced" : "full";
const runFullTerminalE2e = e2eProfile === "full";
const hasPythonPty = (() => {
  if (!isLinux) return false;
  const probe = spawnSync("python3", ["-c", "import pty,sys"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
})();

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

test(
  "terminal e2e renders real output",
  {
    skip: runFullTerminalE2e
      ? isLinux
        ? hasPythonPty
          ? false
          : "python3 required for pty"
        : "linux-only"
      : "full-profile-only",
  },
  async () => {
    const Terminal = await loadTerminalCtor();
    const term = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
    const appPath = fileURLToPath(new URL("./fixtures/terminal-app.js", import.meta.url));
    const root = fileURLToPath(new URL("../../../../", import.meta.url));

    const pythonScript = `
import os, pty, sys, fcntl, termios, struct

cols = int(os.environ.get("REZI_E2E_COLS", "60"))
rows = int(os.environ.get("REZI_E2E_ROWS", "16"))
node = os.environ["REZI_E2E_NODE"]
app = os.environ["REZI_E2E_APP"]

pid, fd = pty.fork()
if pid == 0:
    os.execv(node, [node, app])
else:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    while True:
        try:
            data = os.read(fd, 1024)
        except OSError:
            break
        if not data:
            break
        os.write(sys.stdout.fileno(), data)
    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status):
        sys.exit(128 + os.WTERMSIG(status))
    sys.exit(1)
`;

    const child = spawn("python3", ["-c", pythonScript], {
      cwd: root,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        REZI_E2E_NODE: process.execPath,
        REZI_E2E_APP: appPath,
        REZI_E2E_COLS: String(COLS),
        REZI_E2E_ROWS: String(ROWS),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.ok(child.stdout, "expected python pty stdout pipe");

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    let sawTitle = false;
    let sawStep = false;
    let sawFooter = false;
    let lastScreen = "";
    const updateScreen = () => {
      lastScreen = snapshotScreen(term, ROWS).join("\n");
      if (!sawTitle && lastScreen.includes("E2E Terminal Render")) sawTitle = true;
      if (!sawStep && lastScreen.includes("Step: 1")) sawStep = true;
      if (!sawFooter && lastScreen.includes("Rezi UI")) sawFooter = true;
    };

    let pending = Promise.resolve();
    child.stdout.on("data", (chunk) => {
      const data = chunk.toString("utf8");
      pending = pending
        .then(() => new Promise<void>((resolve) => term.write(data, resolve)))
        .then(() => {
          if (!sawTitle || !sawStep || !sawFooter) {
            updateScreen();
          }
        });
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
    await pending;
    updateScreen();

    if (code !== 0) {
      throw new Error(
        `terminal app exited with code=${String(code)} signal=${String(signal)}\n${stderr}`,
      );
    }

    assert.ok(sawTitle, `missing title in screen:\n${lastScreen}`);
    assert.ok(sawStep, `missing updated state in screen:\n${lastScreen}`);
    assert.ok(sawFooter, `missing footer in screen:\n${lastScreen}`);
  },
);
