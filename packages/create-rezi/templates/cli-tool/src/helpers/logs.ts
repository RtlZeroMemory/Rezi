import type { BadgeVariant, LogEntry } from "@rezi-ui/core";
import type { EnvironmentName } from "../types.js";

const LOG_MESSAGES: readonly string[] = Object.freeze([
  "Indexed workspace files",
  "Synced runtime config",
  "Applied command palette cache",
  "Completed health probe",
  "Queued diagnostics task",
]);

const LOG_SOURCES: readonly string[] = Object.freeze(["core", "scheduler", "runtime", "watcher"]);
const LOG_LEVELS: readonly LogEntry["level"][] = Object.freeze(["info", "warn", "error", "debug"]);

export function buildLogEntry(
  tick: number,
  environment: EnvironmentName,
  includeDebug: boolean,
  nowMs = Date.now(),
): LogEntry {
  const source = LOG_SOURCES[tick % LOG_SOURCES.length] ?? "core";
  const message = LOG_MESSAGES[tick % LOG_MESSAGES.length] ?? "Background update";
  const baseLevel = LOG_LEVELS[tick % LOG_LEVELS.length] ?? "info";
  const level = includeDebug || baseLevel !== "debug" ? baseLevel : "info";

  return Object.freeze({
    id: `log-${String(tick)}`,
    timestamp: nowMs,
    source,
    level,
    message: `${message} (${environment})`,
    details: `tick=${String(tick)}\nenvironment=${environment}\nsource=${source}`,
  });
}

export function seedLogs(count: number, environment: EnvironmentName): readonly LogEntry[] {
  const start = Date.now() - count * 1000;
  const entries: LogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const tick = i + 1;
    entries.push(buildLogEntry(tick, environment, true, start + i * 1000));
  }
  return Object.freeze(entries);
}

export function levelBadgeVariant(level: LogEntry["level"]): BadgeVariant {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  if (level === "debug") return "info";
  return "default";
}
