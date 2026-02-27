import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

export type ProcSample = Readonly<{
  ts: number;
  rssBytes: number | null;
  cpuUserTicks: number | null;
  cpuSystemTicks: number | null;
}>;

export type ProcSamplerOptions = Readonly<{
  pid: number;
  intervalMs: number;
}>;

function readProcStatusRssBytes(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\\s+(\\d+)\\s+kB\\s*$/m);
    if (!match) return null;
    const kb = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(kb) ? kb * 1024 : null;
  } catch {
    return null;
  }
}

function readProcStatTicks(pid: number): { user: number; system: number } | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const end = stat.lastIndexOf(")");
    if (end < 0) return null;
    const after = stat.slice(end + 2);
    const parts = after.split(" ");
    const utime = Number.parseInt(parts[11] ?? "", 10);
    const stime = Number.parseInt(parts[12] ?? "", 10);
    if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
    return { user: utime, system: stime };
  } catch {
    return null;
  }
}

export async function sampleProcUntilExit(
  opts: ProcSamplerOptions,
  isExited: () => boolean,
): Promise<readonly ProcSample[]> {
  const samples: ProcSample[] = [];
  while (!isExited()) {
    const now = performance.now();
    const rssBytes = readProcStatusRssBytes(opts.pid);
    const ticks = readProcStatTicks(opts.pid);
    samples.push({
      ts: now,
      rssBytes,
      cpuUserTicks: ticks?.user ?? null,
      cpuSystemTicks: ticks?.system ?? null,
    });
    await delay(opts.intervalMs);
  }
  return samples;
}
