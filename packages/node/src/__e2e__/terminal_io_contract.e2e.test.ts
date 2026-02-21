import { once } from "node:events";
import { createRequire } from "node:module";
import net from "node:net";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type TerminalCaps, type ZrevEvent, parseEventBatchV1 } from "@rezi-ui/core";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_ALT,
  ZR_MOD_CTRL,
  ZR_MOD_META,
  ZR_MOD_SHIFT,
} from "@rezi-ui/core/keybindings";
import { assert, test } from "@rezi-ui/testkit";

type PtyExit = Readonly<{ exitCode: number; signal?: number }>;

type PtyProcess = Readonly<{
  pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: PtyExit) => void) => void;
}>;

type PtySpawn = (
  file: string,
  args: string[],
  opts: Readonly<{
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
  }>,
) => PtyProcess;

type ControlCommand =
  | Readonly<{ id: string; cmd: "pollOnce" }>
  | Readonly<{ id: string; cmd: "getCaps" }>
  | Readonly<{ id: string; cmd: "stop" }>;

type ControlResult =
  | Readonly<{
      kind: "pollOnce";
      bytesBase64: string;
      droppedBatches: number;
    }>
  | Readonly<{
      kind: "getCaps";
      caps: TerminalCaps;
    }>
  | Readonly<{
      kind: "stop";
    }>;

type ControlReady = Readonly<{
  type: "ready";
  caps: TerminalCaps;
}>;

type ControlResponse =
  | Readonly<{ type: "response"; id: string; ok: true; result: ControlResult }>
  | Readonly<{ type: "response"; id: string; ok: false; error: string }>;

type ControlFatal = Readonly<{ type: "fatal"; detail: string }>;

type ControlMessage = ControlReady | ControlResponse | ControlFatal;

type HarnessConfig = Readonly<{
  nativeConfig?: Readonly<Record<string, unknown>>;
  env?: Readonly<Record<string, string>>;
  cols?: number;
  rows?: number;
}>;

type ParsedBatch = Readonly<{
  events: readonly ZrevEvent[];
  droppedBatches: number;
}>;

const ZR_KEY_FOCUS_IN = 30;
const ZR_KEY_FOCUS_OUT = 31;
const CONTROL_COMMAND_TIMEOUT_MS = 5_000;

function closeServerQuiet(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loadPtySpawn(): PtySpawn | null {
  try {
    const require = createRequire(import.meta.url);
    const mod = require("node-pty") as unknown;
    const rec = mod as Readonly<{ spawn?: unknown }>;
    return typeof rec.spawn === "function" ? (rec.spawn as PtySpawn) : null;
  } catch {
    return null;
  }
}

function asErrorDetail(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function terminatePtyBestEffort(pty: PtyProcess): void {
  try {
    pty.kill();
    return;
  } catch {
    // fall through
  }
  try {
    pty.kill("SIGTERM");
  } catch {
    // best-effort cleanup
  }
}

class ContractHarness {
  caps: TerminalCaps;

  #pty: PtyProcess;
  #socket: net.Socket;
  #server: net.Server;
  #nextId = 1;
  #lineBuf = "";
  #closed = false;
  #exitObserved = false;
  #pending = new Map<
    string,
    { resolve: (v: ControlResult) => void; reject: (err: Error) => void }
  >();

  private constructor(pty: PtyProcess, socket: net.Socket, server: net.Server, caps: TerminalCaps) {
    this.#pty = pty;
    this.#socket = socket;
    this.#server = server;
    this.caps = caps;
  }

  static async create(cfg: HarnessConfig = {}): Promise<ContractHarness> {
    const ptySpawn = loadPtySpawn();
    if (ptySpawn === null) {
      throw new Error(
        'terminal-io-contract e2e requires "node-pty". Install: npm i -w @rezi-ui/node -D node-pty',
      );
    }

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("terminal-io-contract: failed to obtain control server address");
    }

    const targetPath = fileURLToPath(
      new URL("./fixtures/terminal-io-contract-target.js", import.meta.url),
    );
    const cols = cfg.cols ?? 120;
    const rows = cfg.rows ?? 40;
    let pty: PtyProcess | null = null;
    let socket: net.Socket | null = null;
    let ptyOutput = "";
    try {
      const spawnedPty = ptySpawn(process.execPath, [targetPath], {
        name: process.platform === "win32" ? "xterm" : "xterm-256color",
        cols,
        rows,
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: process.platform === "win32" ? "xterm" : "xterm-256color",
          REZI_TERMINAL_IO_CTRL_PORT: String(address.port),
          REZI_TERMINAL_IO_NATIVE_CONFIG: JSON.stringify(cfg.nativeConfig ?? {}),
          ...(cfg.env ?? {}),
        },
      });
      pty = spawnedPty;

      spawnedPty.onData((chunk) => {
        ptyOutput = `${ptyOutput}${chunk}`.slice(-4_096);
      });

      const ctrlSocket = await new Promise<net.Socket>((resolve, reject) => {
        const handshakeTimer = setTimeout(() => {
          cleanup();
          reject(
            new Error(
              `terminal-io-contract target handshake timeout: no control socket connection; output=${JSON.stringify(ptyOutput)}`,
            ),
          );
        }, 2_000);
        const onConn = (s: net.Socket) => {
          cleanup();
          resolve(s);
        };
        const onErr = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          clearTimeout(handshakeTimer);
          server.off("connection", onConn);
          server.off("error", onErr);
        };

        server.once("connection", onConn);
        server.once("error", onErr);
      });
      socket = ctrlSocket;

      ctrlSocket.setEncoding("utf8");

      const ready = await new Promise<ControlReady>((resolve, reject) => {
        let buf = "";
        const onData = (chunk: string) => {
          buf += chunk;
          for (;;) {
            const idx = buf.indexOf("\n");
            if (idx < 0) break;
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            const msg = parseControlMessage(line);
            if (msg === null) continue;
            if (msg.type === "fatal") {
              cleanup();
              reject(
                new Error(`terminal-io-contract target fatal during handshake: ${msg.detail}`),
              );
              return;
            }
            if (msg.type === "ready") {
              cleanup();
              resolve(msg);
              return;
            }
          }
        };

        const onErr = (err: Error) => {
          cleanup();
          reject(err);
        };

        const cleanup = () => {
          ctrlSocket.off("data", onData);
          ctrlSocket.off("error", onErr);
        };

        ctrlSocket.on("data", onData);
        ctrlSocket.on("error", onErr);
      });

      const harness = new ContractHarness(spawnedPty, ctrlSocket, server, ready.caps);
      harness.#attachControlListeners();
      return harness;
    } catch (err) {
      if (socket !== null) {
        socket.destroy();
      }
      if (pty !== null) {
        terminatePtyBestEffort(pty);
      }
      await closeServerQuiet(server);
      throw err;
    }
  }

  #attachControlListeners(): void {
    this.#socket.on("data", (chunk: string) => {
      this.#lineBuf += chunk;
      for (;;) {
        const idx = this.#lineBuf.indexOf("\n");
        if (idx < 0) break;
        const line = this.#lineBuf.slice(0, idx);
        this.#lineBuf = this.#lineBuf.slice(idx + 1);
        const msg = parseControlMessage(line);
        if (msg === null) continue;
        if (msg.type === "fatal") {
          this.#rejectPending(new Error(`terminal-io-contract target fatal: ${msg.detail}`));
          continue;
        }
        if (msg.type !== "response") continue;
        const waiter = this.#pending.get(msg.id);
        if (waiter === undefined) continue;
        this.#pending.delete(msg.id);
        if (msg.ok) {
          waiter.resolve(msg.result);
        } else {
          waiter.reject(new Error(msg.error));
        }
      }
    });

    this.#socket.on("error", (err) => {
      this.#rejectPending(
        new Error(`terminal-io-contract control socket error: ${asErrorDetail(err)}`),
      );
    });

    this.#pty.onExit(({ exitCode, signal }) => {
      const msg = `terminal-io-contract target exited: exit=${String(exitCode)} signal=${String(signal ?? "")}`;
      this.#exitObserved = true;
      this.#rejectPending(new Error(msg));
      this.#closed = true;
    });
  }

  #rejectPending(err: Error): void {
    for (const waiter of this.#pending.values()) {
      waiter.reject(err);
    }
    this.#pending.clear();
  }

  async #sendCommand(
    cmd: Omit<ControlCommand, "id">,
    timeoutMs = CONTROL_COMMAND_TIMEOUT_MS,
  ): Promise<ControlResult> {
    if (this.#closed) throw new Error("terminal-io-contract harness is closed");
    const id = String(this.#nextId++);
    const payload = { ...cmd, id } as ControlCommand;
    const result = new Promise<ControlResult>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    const timeout = setTimeout(() => {
      const waiter = this.#pending.get(id);
      if (waiter === undefined) return;
      this.#pending.delete(id);
      waiter.reject(
        new Error(
          `terminal-io-contract command timeout: cmd=${cmd.cmd} timeoutMs=${String(timeoutMs)}`,
        ),
      );
    }, timeoutMs);
    this.#socket.write(`${JSON.stringify(payload)}\n`);
    try {
      return await result;
    } finally {
      clearTimeout(timeout);
    }
  }

  writeRaw(bytes: string): void {
    this.#pty.write(bytes);
  }

  resize(cols: number, rows: number): void {
    this.#pty.resize(cols, rows);
  }

  async pollOnce(): Promise<ParsedBatch> {
    const response = await this.#sendCommand({ cmd: "pollOnce" });
    if (response.kind !== "pollOnce") {
      throw new Error(`terminal-io-contract: expected pollOnce result, got ${response.kind}`);
    }
    const bytes = Uint8Array.from(Buffer.from(response.bytesBase64, "base64"));
    const parsed = parseEventBatchV1(bytes);
    if (!parsed.ok) {
      assert.fail(
        `parseEventBatchV1 failed: code=${parsed.error.code} offset=${String(parsed.error.offset)} detail=${parsed.error.detail}`,
      );
    }
    return {
      events: parsed.value.events,
      droppedBatches: response.droppedBatches,
    };
  }

  async stop(): Promise<void> {
    if (this.#closed) return;
    try {
      await this.#sendCommand({ cmd: "stop" });
    } catch {
      // best-effort stop
    }
    this.#closed = true;
    for (let i = 0; i < 200; i++) {
      if (this.#exitObserved) break;
      await delay(10);
    }
    if (!this.#exitObserved) {
      terminatePtyBestEffort(this.#pty);
    }
    try {
      this.#socket.destroy();
    } catch {
      // ignore
    }
    try {
      await closeServerQuiet(this.#server);
    } catch {
      // ignore
    }
  }
}

function parseControlMessage(line: string): ControlMessage | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const rec = parsed as Partial<ControlMessage>;
  if (rec.type === "ready") {
    if (typeof rec.caps !== "object" || rec.caps === null) return null;
    return rec as ControlReady;
  }
  if (rec.type === "fatal") {
    if (typeof rec.detail !== "string") return null;
    return rec as ControlFatal;
  }
  if (rec.type === "response") {
    if (typeof rec.id !== "string") return null;
    if (typeof rec.ok !== "boolean") return null;
    return rec as ControlResponse;
  }
  return null;
}

function isKey(
  ev: ZrevEvent,
  key: number,
  mods: number,
): ev is Extract<ZrevEvent, Readonly<{ kind: "key" }>> {
  return ev.kind === "key" && ev.key === key && ev.mods === mods && ev.action === "down";
}

function isText(
  ev: ZrevEvent,
  codepoint: number,
): ev is Extract<ZrevEvent, Readonly<{ kind: "text" }>> {
  return ev.kind === "text" && ev.codepoint === codepoint;
}

async function collectEvents(
  harness: ContractHarness,
  maxPolls: number,
  stopWhen: (events: readonly ZrevEvent[]) => boolean,
): Promise<readonly ZrevEvent[]> {
  const events: ZrevEvent[] = [];
  for (let i = 0; i < maxPolls; i++) {
    const batch = await harness.pollOnce();
    events.push(...batch.events);
    if (stopWhen(events)) return events;
  }
  return events;
}

async function writeAndCollectUntil(
  harness: ContractHarness,
  bytes: string,
  maxPolls: number,
  stopWhen: (events: readonly ZrevEvent[]) => boolean,
): Promise<readonly ZrevEvent[]> {
  harness.writeRaw(bytes);
  return await collectEvents(harness, maxPolls, stopWhen);
}

async function writeAndCollectUntilWithRetries(
  harness: ContractHarness,
  bytes: string,
  maxPolls: number,
  stopWhen: (events: readonly ZrevEvent[]) => boolean,
  maxAttempts: number,
): Promise<readonly ZrevEvent[]> {
  const combined: ZrevEvent[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    const events = await writeAndCollectUntil(harness, bytes, maxPolls, stopWhen);
    combined.push(...events);
    if (stopWhen(combined)) return combined;
  }
  return combined;
}

function findIndex(events: readonly ZrevEvent[], pred: (ev: ZrevEvent) => boolean): number {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev !== undefined && pred(ev)) return i;
  }
  return -1;
}

async function createHarnessOrSkip(
  t: TestContext,
  cfg: HarnessConfig = {},
): Promise<ContractHarness | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await ContractHarness.create(cfg);
    } catch (err) {
      lastErr = err;
      const detail = asErrorDetail(err);
      if (
        attempt === 0 &&
        (detail.includes("exited before handshake") || detail.includes("handshake timeout"))
      ) {
        await delay(50);
        continue;
      }
      t.skip(`terminal-io-contract harness unavailable: ${detail}`);
      return null;
    }
  }
  t.skip(`terminal-io-contract harness unavailable: ${asErrorDetail(lastErr)}`);
  return null;
}

test("terminal io contract: keyboard + paste + focus + mouse + resize + split reads", async (t: TestContext) => {
  if (process.platform === "win32") {
    t.skip(
      "full terminal contract assertions run on Unix PTY; Windows uses ConPTY-specific coverage",
    );
    return;
  }

  const harness = await createHarnessOrSkip(t, {
    env: {
      ZIREAEL_CAP_MOUSE: "1",
      ZIREAEL_CAP_BRACKETED_PASTE: "1",
      ZIREAEL_CAP_FOCUS_EVENTS: "1",
    },
  });
  if (harness === null) return;

  try {
    const textDecoder = new TextDecoder();

    // Initial resize is part of the contract and must arrive before explicit resizes.
    const startupEvents = await collectEvents(harness, 20, (xs) => {
      return findIndex(xs, (ev) => ev.kind === "resize") >= 0;
    });
    assert.ok(
      findIndex(startupEvents, (ev) => ev.kind === "resize") >= 0,
      "missing initial resize event",
    );

    // Wait for at least one scheduler tick after initial resize before key assertions.
    const readyTicks = await collectEvents(harness, 40, (xs) => {
      return findIndex(xs, (ev) => ev.kind === "tick") >= 0;
    });
    assert.ok(
      findIndex(readyTicks, (ev) => ev.kind === "tick") >= 0,
      "no post-startup tick observed before key assertions",
    );

    const ctrlUp = await writeAndCollectUntilWithRetries(
      harness,
      "\x1b[1;5A",
      40,
      (xs) => {
        return findIndex(xs, (ev) => isKey(ev, ZR_KEY_UP, ZR_MOD_CTRL)) >= 0;
      },
      3,
    );
    assert.ok(
      findIndex(ctrlUp, (ev) => isKey(ev, ZR_KEY_UP, ZR_MOD_CTRL)) >= 0,
      `missing Ctrl+Up; keys=${ctrlUp
        .filter((ev): ev is Extract<ZrevEvent, Readonly<{ kind: "key" }>> => ev.kind === "key")
        .map((ev) => `${String(ev.key)}/${String(ev.mods)}`)
        .join(",")}`,
    );

    const shiftTab = await writeAndCollectUntil(harness, "\x1b[Z", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_TAB, ZR_MOD_SHIFT)) >= 0;
    });
    assert.ok(
      findIndex(shiftTab, (ev) => isKey(ev, ZR_KEY_TAB, ZR_MOD_SHIFT)) >= 0,
      "missing Shift+Tab",
    );

    const ctrlTab = await writeAndCollectUntil(harness, "\x1b[9;5u", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_TAB, ZR_MOD_CTRL)) >= 0;
    });
    assert.ok(
      findIndex(ctrlTab, (ev) => isKey(ev, ZR_KEY_TAB, ZR_MOD_CTRL)) >= 0,
      "missing Ctrl+Tab CSI-u",
    );

    const ctrlEnter = await writeAndCollectUntil(harness, "\x1b[13;5u", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_ENTER, ZR_MOD_CTRL)) >= 0;
    });
    assert.ok(
      findIndex(ctrlEnter, (ev) => isKey(ev, ZR_KEY_ENTER, ZR_MOD_CTRL)) >= 0,
      "missing Ctrl+Enter CSI-u",
    );

    const ctrlBackspace = await writeAndCollectUntil(harness, "\x1b[127;5u", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_BACKSPACE, ZR_MOD_CTRL)) >= 0;
    });
    assert.ok(
      findIndex(ctrlBackspace, (ev) => isKey(ev, ZR_KEY_BACKSPACE, ZR_MOD_CTRL)) >= 0,
      "missing Ctrl+Backspace CSI-u",
    );

    const altPolicy = await writeAndCollectUntil(harness, "\x1b[97;3u", 40, (xs) => {
      const esc = findIndex(xs, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
      const payload = findIndex(
        xs,
        (ev) => isText(ev, 97) || (ev.kind === "key" && ev.key === 0 && ev.mods === ZR_MOD_ALT),
      );
      return esc >= 0 && payload >= 0;
    });
    const altEscIndex = findIndex(altPolicy, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
    const altPayloadIndex = findIndex(
      altPolicy,
      (ev) => isText(ev, 97) || (ev.kind === "key" && ev.key === 0 && ev.mods === ZR_MOD_ALT),
    );
    assert.ok(altEscIndex >= 0, "missing Alt escape prefix");
    assert.ok(altPayloadIndex >= 0, "missing Alt payload fallback event");
    assert.ok(altEscIndex < altPayloadIndex, "escape prefix must precede Alt payload");

    const metaPolicy = await writeAndCollectUntil(harness, "\x1b[98;9u", 40, (xs) => {
      const esc = findIndex(xs, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
      const payload = findIndex(
        xs,
        (ev) => isText(ev, 98) || (ev.kind === "key" && ev.key === 0 && ev.mods === ZR_MOD_META),
      );
      return esc >= 0 && payload >= 0;
    });
    const metaEscIndex = findIndex(metaPolicy, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
    const metaPayloadIndex = findIndex(
      metaPolicy,
      (ev) => isText(ev, 98) || (ev.kind === "key" && ev.key === 0 && ev.mods === ZR_MOD_META),
    );
    assert.ok(metaEscIndex >= 0, "missing Meta escape prefix");
    assert.ok(metaPayloadIndex >= 0, "missing Meta payload fallback event");
    assert.ok(metaEscIndex < metaPayloadIndex, "escape prefix must precede Meta payload");

    const focusIn = await writeAndCollectUntil(harness, "\x1b[I", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_FOCUS_IN, 0)) >= 0;
    });
    assert.ok(
      findIndex(focusIn, (ev) => isKey(ev, ZR_KEY_FOCUS_IN, 0)) >= 0,
      "missing focus-in event",
    );

    const focusOut = await writeAndCollectUntil(harness, "\x1b[O", 40, (xs) => {
      return findIndex(xs, (ev) => isKey(ev, ZR_KEY_FOCUS_OUT, 0)) >= 0;
    });
    assert.ok(
      findIndex(focusOut, (ev) => isKey(ev, ZR_KEY_FOCUS_OUT, 0)) >= 0,
      "missing focus-out event",
    );

    const mouseDown = await writeAndCollectUntil(harness, "\x1b[<0;300;400M", 40, (xs) => {
      return (
        findIndex(
          xs,
          (ev) =>
            ev.kind === "mouse" &&
            ev.mouseKind === 3 &&
            ev.x === 299 &&
            ev.y === 399 &&
            ev.buttons === 1,
        ) >= 0
      );
    });
    assert.ok(
      findIndex(
        mouseDown,
        (ev) =>
          ev.kind === "mouse" &&
          ev.mouseKind === 3 &&
          ev.x === 299 &&
          ev.y === 399 &&
          ev.buttons === 1,
      ) >= 0,
      "missing mouse down with high coordinates",
    );

    const mouseUp = await writeAndCollectUntil(harness, "\x1b[<0;300;400m", 40, (xs) => {
      return (
        findIndex(
          xs,
          (ev) =>
            ev.kind === "mouse" &&
            ev.mouseKind === 4 &&
            ev.x === 299 &&
            ev.y === 399 &&
            ev.buttons === 1,
        ) >= 0
      );
    });
    assert.ok(
      findIndex(
        mouseUp,
        (ev) =>
          ev.kind === "mouse" &&
          ev.mouseKind === 4 &&
          ev.x === 299 &&
          ev.y === 399 &&
          ev.buttons === 1,
      ) >= 0,
      "missing mouse up with high coordinates",
    );

    const mouseWheel = await writeAndCollectUntil(harness, "\x1b[<64;400;500M", 40, (xs) => {
      return (
        findIndex(
          xs,
          (ev) =>
            ev.kind === "mouse" &&
            ev.mouseKind === 5 &&
            ev.x === 399 &&
            ev.y === 499 &&
            ev.wheelY === 1,
        ) >= 0
      );
    });
    assert.ok(
      findIndex(
        mouseWheel,
        (ev) =>
          ev.kind === "mouse" &&
          ev.mouseKind === 5 &&
          ev.x === 399 &&
          ev.y === 499 &&
          ev.wheelY === 1,
      ) >= 0,
      "missing mouse wheel with high coordinates",
    );

    // Split-read completion across multiple writes.
    harness.writeRaw("\x1b[");
    harness.writeRaw("A");
    const splitEvents = await collectEvents(harness, 20, (xs) => {
      const up = findIndex(xs, (ev) => isKey(ev, ZR_KEY_UP, 0));
      const fallbackEsc = findIndex(xs, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
      const fallbackBracket = findIndex(xs, (ev) => isText(ev, 91));
      return up >= 0 || (fallbackEsc >= 0 && fallbackBracket >= 0);
    });
    const splitUp = findIndex(splitEvents, (ev) => isKey(ev, ZR_KEY_UP, 0));
    assert.ok(splitUp >= 0, "split CSI arrow completion did not produce Up key");
    assert.equal(
      splitEvents.some((ev) => isKey(ev, ZR_KEY_ESCAPE, 0) || isText(ev, 91)),
      false,
      "split CSI arrow should not fallback to ESC+'[' when completed",
    );

    // Incomplete sequence fallback policy: ESC+[ without completion flushes as ESC key + text '['.
    const fallbackEvents = await writeAndCollectUntilWithRetries(
      harness,
      "\x1b[",
      60,
      (xs) => {
        const esc = findIndex(xs, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
        const bracket = findIndex(xs, (ev) => isText(ev, 91));
        return esc >= 0 && bracket >= 0;
      },
      3,
    );
    const escFallbackIndex = findIndex(fallbackEvents, (ev) => isKey(ev, ZR_KEY_ESCAPE, 0));
    const textBracketIndex = findIndex(fallbackEvents, (ev) => isText(ev, 91));
    assert.ok(escFallbackIndex >= 0, "incomplete escape fallback missing ESC event");
    assert.ok(textBracketIndex >= 0, "incomplete escape fallback missing text '[' event");
    assert.ok(escFallbackIndex < textBracketIndex, "fallback ESC must precede text '['");

    // Bracketed paste framing.
    const pasteEvents = await writeAndCollectUntilWithRetries(
      harness,
      "\x1b[200~hello\x1b[201~",
      120,
      (xs) => {
        return (
          findIndex(xs, (ev) => ev.kind === "paste" && textDecoder.decode(ev.bytes) === "hello") >=
          0
        );
      },
      3,
    );
    const framedPasteIndex = findIndex(
      pasteEvents,
      (ev) => ev.kind === "paste" && textDecoder.decode(ev.bytes) === "hello",
    );
    assert.ok(framedPasteIndex >= 0, "missing framed paste event");
    const framedPaste = pasteEvents[framedPasteIndex];
    assert.ok(framedPaste !== undefined);
    if (framedPaste !== undefined && framedPaste.kind === "paste") {
      assert.equal(textDecoder.decode(framedPaste.bytes), "hello");
    }

    // Missing paste end marker must flush and not wedge input.
    harness.writeRaw("\x1b[200~xyz");
    const missingEndEvents = await collectEvents(harness, 120, (xs) => {
      return findIndex(xs, (ev) => ev.kind === "paste") >= 0;
    });
    const missingEndPasteIndex = findIndex(missingEndEvents, (ev) => ev.kind === "paste");
    if (missingEndPasteIndex >= 0) {
      const missingEndPaste = missingEndEvents[missingEndPasteIndex];
      assert.ok(missingEndPaste !== undefined);
      if (missingEndPaste !== undefined && missingEndPaste.kind === "paste") {
        assert.equal(textDecoder.decode(missingEndPaste.bytes), "xyz");
      }
    }

    harness.writeRaw("q");
    const postMissingEnd = await collectEvents(harness, 40, (xs) => {
      return findIndex(xs, (ev) => isText(ev, 113)) >= 0;
    });
    assert.ok(
      findIndex(postMissingEnd, (ev) => isText(ev, 113)) >= 0,
      "input wedged after paste without end marker",
    );

    // Oversized paste overrun drops paste event and must not wedge input.
    const oversizedPayload = "a".repeat(70_000);
    harness.writeRaw(`\x1b[200~${oversizedPayload}\x1b[201~`);
    const oversizedEvents = await collectEvents(harness, 120, (xs) => {
      return findIndex(xs, (ev) => ev.kind === "paste") >= 0;
    });
    assert.equal(
      oversizedEvents.some((ev) => ev.kind === "paste"),
      false,
      "oversized paste should not emit a paste event",
    );

    harness.writeRaw("z");
    const postOversized = await collectEvents(harness, 20, (xs) => {
      return findIndex(xs, (ev) => isText(ev, 122)) >= 0;
    });
    assert.ok(
      findIndex(postOversized, (ev) => isText(ev, 122)) >= 0,
      "input wedged after oversized paste",
    );

    // Resize semantics and ordering.
    harness.resize(100, 30);
    const resizedEvents = await collectEvents(harness, 40, (xs) => {
      return findIndex(xs, (ev) => ev.kind === "resize" && ev.cols === 100 && ev.rows === 30) >= 0;
    });
    assert.ok(
      findIndex(resizedEvents, (ev) => ev.kind === "resize" && ev.cols === 100 && ev.rows === 30) >=
        0,
      "missing resize event after terminal resize",
    );
  } finally {
    await harness.stop();
  }
});

test("terminal io contract: focus gating when disabled", async (t: TestContext) => {
  if (process.platform === "win32") {
    t.skip("focus-gating contract assertion is covered on Unix PTY lanes");
    return;
  }

  const harness = await createHarnessOrSkip(t, {
    env: {
      ZIREAEL_CAP_FOCUS_EVENTS: "0",
    },
  });
  if (harness === null) return;

  try {
    await harness.pollOnce();
    harness.writeRaw("\x1b[I\x1b[O");
    harness.writeRaw("k");
    const gatedEvents = await collectEvents(harness, 20, (xs) => {
      return findIndex(xs, (ev) => isText(ev, 107)) >= 0;
    });
    assert.equal(
      gatedEvents.some((ev) => isKey(ev, ZR_KEY_FOCUS_IN, 0) || isKey(ev, ZR_KEY_FOCUS_OUT, 0)),
      false,
      "focus events were emitted while focus mode was disabled",
    );
  } finally {
    await harness.stop();
  }
});

test("terminal io contract: windows ConPTY guarded coverage", async (t: TestContext) => {
  if (process.platform !== "win32") {
    t.skip("windows-only ConPTY coverage");
    return;
  }
  const ci = (process.env as NodeJS.ProcessEnv & { CI?: string }).CI;
  if (ci === "true") {
    t.skip("ConPTY guarded coverage is skipped on Windows CI; run locally on Windows for coverage");
    return;
  }

  const harness = await createHarnessOrSkip(t, {
    env: {
      ZIREAEL_CAP_BRACKETED_PASTE: "1",
      ZIREAEL_CAP_FOCUS_EVENTS: "1",
    },
  });
  if (harness === null) return;

  try {
    try {
      await harness.pollOnce();

      harness.writeRaw("\x1b[1;5A");
      harness.writeRaw("\x1b[200~win\x1b[201~");

      const events = await collectEvents(harness, 50, (xs) => {
        const arrow = findIndex(xs, (ev) => isKey(ev, ZR_KEY_UP, ZR_MOD_CTRL)) >= 0;
        const paste = findIndex(
          xs,
          (ev) => ev.kind === "paste" && new TextDecoder().decode(ev.bytes) === "win",
        );
        return arrow && paste >= 0;
      });

      assert.ok(
        findIndex(events, (ev) => isKey(ev, ZR_KEY_UP, ZR_MOD_CTRL)) >= 0,
        "missing Ctrl+Up",
      );
      assert.ok(
        findIndex(
          events,
          (ev) => ev.kind === "paste" && new TextDecoder().decode(ev.bytes) === "win",
        ) >= 0,
        "missing bracketed paste on ConPTY",
      );
    } catch (err) {
      const detail = asErrorDetail(err);
      if (detail.includes("command timeout")) {
        t.skip(`ConPTY coverage unavailable in this environment: ${detail}`);
        return;
      }
      throw err;
    }
  } finally {
    await harness.stop();
  }
});
