import { appendFileSync } from "node:fs";

const DEBUG_ENABLED = process.env.REZI_STARSHIP_DEBUG === "1";
const DEBUG_LOG_PATH = process.env.REZI_STARSHIP_DEBUG_LOG ?? "/tmp/rezi-starship-layout.log";
const lastSnapshotByScope = new Map<string, string>();

export function debugSnapshot(scope: string, payload: Readonly<Record<string, unknown>>): void {
  if (!DEBUG_ENABLED) return;

  const serialized = JSON.stringify(payload);
  if (lastSnapshotByScope.get(scope) === serialized) return;
  lastSnapshotByScope.set(scope, serialized);

  appendFileSync(
    DEBUG_LOG_PATH,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      scope,
      ...payload,
    })}\n`,
  );
}
