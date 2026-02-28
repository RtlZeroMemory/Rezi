import { execFileSync } from "node:child_process";
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

const PAGE_SIZE_BYTES: number = (() => {
  try {
    const out = execFileSync("getconf", ["PAGESIZE"], { encoding: "utf8" }).trim();
    const v = Number.parseInt(out, 10);
    if (Number.isFinite(v) && v > 0) return v;
    return 4096;
  } catch {
    return 4096;
  }
})();

function readProcStat(
  pid: number,
): { user: number; system: number; rssBytes: number | null } | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const end = stat.lastIndexOf(")");
    if (end < 0) return null;
    const after = stat.slice(end + 2).trim();
    const parts = after.split(/\s+/);
    const utime = Number.parseInt(parts[11] ?? "", 10);
    const stime = Number.parseInt(parts[12] ?? "", 10);
    const rssPages = Number.parseInt(parts[21] ?? "", 10);
    if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
    return {
      user: utime,
      system: stime,
      rssBytes: Number.isFinite(rssPages) && rssPages >= 0 ? rssPages * PAGE_SIZE_BYTES : null,
    };
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
    const stat = readProcStat(opts.pid);
    samples.push({
      ts: now,
      rssBytes: stat?.rssBytes ?? null,
      cpuUserTicks: stat?.user ?? null,
      cpuSystemTicks: stat?.system ?? null,
    });
    await delay(opts.intervalMs);
  }
  return samples;
}
