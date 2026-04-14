import net from "node:net";
import type { AppRenderMetrics } from "@rezi-ui/core";
import {
  type ScenarioCursorSnapshot,
  createReferenceInputModalFixture,
} from "@rezi-ui/core/testing";
import { createNodeApp } from "../../index.js";

type HarnessCommand = Readonly<{ type: "stop" }>;

type OutboundMessage =
  | Readonly<{
      type: "ready";
      caps: Awaited<ReturnType<ReturnType<typeof createNodeApp>["backend"]["getCaps"]>>;
    }>
  | Readonly<{ type: "engine" }>
  | Readonly<{ type: "action"; action: unknown }>
  | Readonly<{ type: "render"; cursor: ScenarioCursorSnapshot | null }>
  | Readonly<{ type: "fatal"; detail: string }>;

type TargetEnv = NodeJS.ProcessEnv & Readonly<{ REZI_SCENARIO_CTRL_PORT?: string }>;

const targetEnv = process.env as TargetEnv;

function failAndExit(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parsePortFromEnv(): number {
  const raw = targetEnv.REZI_SCENARIO_CTRL_PORT;
  if (raw === undefined)
    failAndExit("referenceScenarioTarget: REZI_SCENARIO_CTRL_PORT is required");
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    failAndExit(`referenceScenarioTarget: invalid REZI_SCENARIO_CTRL_PORT=${String(raw)}`);
  }
  return port;
}

function asErrorDetail(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function sendJsonLine(socket: net.Socket | null, msg: OutboundMessage): void {
  if (socket === null || socket.destroyed || !socket.writable) return;
  socket.write(`${JSON.stringify(msg)}\n`);
}

function cursorFromMetrics(metrics: AppRenderMetrics): ScenarioCursorSnapshot | null {
  const breadcrumbs = (
    metrics as AppRenderMetrics & {
      runtimeBreadcrumbs?: { cursor?: ScenarioCursorSnapshot | null };
    }
  ).runtimeBreadcrumbs;
  return breadcrumbs?.cursor ?? null;
}

const ctrlPort = parsePortFromEnv();
const fixture = createReferenceInputModalFixture();
let socket: net.Socket | null = null;
let lineBuf = "";
let shuttingDown = false;
let latestCursor: ScenarioCursorSnapshot | null = null;

const app = createNodeApp({
  initialState: fixture.initialState,
  config: {
    executionMode: "worker",
    fpsCap: 1000,
    maxEventBytes: 1 << 20,
    internal_onRender: (metrics: AppRenderMetrics) => {
      latestCursor = cursorFromMetrics(metrics);
      sendJsonLine(socket, { type: "render", cursor: latestCursor });
    },
  },
  ...(fixture.theme !== undefined ? { theme: fixture.theme } : {}),
});

fixture.setup?.(app);
app.onEvent((event) => {
  if (event.kind === "engine") {
    sendJsonLine(socket, { type: "engine" });
    return;
  }
  if (event.kind === "action") {
    const { kind: _kind, ...action } = event;
    sendJsonLine(socket, { type: "action", action });
    return;
  }
  if (event.kind === "fatal") {
    sendJsonLine(socket, { type: "fatal", detail: `${event.code}: ${event.detail}` });
  }
});
app.view((state) => fixture.view(state));

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.stop();
  } catch {
    // best-effort cleanup
  }
  try {
    app.dispose();
  } catch {
    // best-effort cleanup
  }
  try {
    socket?.end();
  } catch {
    // best-effort cleanup
  }
  process.exit(code);
}

function handleCommand(line: string): void {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null) return;
  const command = parsed as Partial<HarnessCommand>;
  if (command.type === "stop") {
    void shutdown(0);
  }
}

process.on("uncaughtException", (err) => {
  sendJsonLine(socket, { type: "fatal", detail: asErrorDetail(err) });
  void shutdown(1);
});

process.on("unhandledRejection", (err) => {
  sendJsonLine(socket, { type: "fatal", detail: asErrorDetail(err) });
  void shutdown(1);
});

await app.start();

socket = await new Promise<net.Socket>((resolve, reject) => {
  const nextSocket = net.createConnection({ host: "127.0.0.1", port: ctrlPort }, () => {
    cleanup();
    resolve(nextSocket);
  });
  const onError = (err: Error) => {
    cleanup();
    reject(err);
  };
  const cleanup = () => {
    nextSocket.off("error", onError);
  };
  nextSocket.once("error", onError);
});
socket.setEncoding("utf8");
socket.on("data", (chunk: string) => {
  lineBuf += chunk;
  for (;;) {
    const idx = lineBuf.indexOf("\n");
    if (idx < 0) break;
    const line = lineBuf.slice(0, idx);
    lineBuf = lineBuf.slice(idx + 1);
    handleCommand(line);
  }
});
socket.on("error", (err) => {
  if (shuttingDown) return;
  // Best-effort fatal reporting: the socket may already be broken here.
  sendJsonLine(socket, { type: "fatal", detail: asErrorDetail(err) });
  void shutdown(1);
});
socket.on("close", () => {
  if (shuttingDown) return;
  void shutdown(0);
});

sendJsonLine(socket, {
  type: "ready",
  caps: await app.backend.getCaps(),
});
sendJsonLine(socket, { type: "render", cursor: latestCursor });
