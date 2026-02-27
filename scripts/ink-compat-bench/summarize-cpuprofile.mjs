#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function readArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return v ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/ink-compat-bench/summarize-cpuprofile.mjs <file.cpuprofile> [--top N] [--filter STR] [--stacks N] [--json]",
      "",
      "Notes:",
      "  - Self time is attributed to the sampled leaf frame id.",
      "  - `--filter` matches callFrame.url or functionName substrings.",
    ].join("\n") + "\n",
  );
}

function toDisplayUrl(url) {
  if (!url) return "unknown";
  if (url.startsWith("file://")) {
    try {
      const fsPath = new URL(url).pathname;
      url = fsPath;
    } catch {}
  }
  const idx = url.indexOf("/packages/");
  if (idx >= 0) return url.slice(idx + 1);
  const parts = url.split(/[\\/]/).filter(Boolean);
  return parts.slice(Math.max(0, parts.length - 3)).join("/");
}

function formatFrame(node) {
  const cf = node.callFrame ?? {};
  const fn = (cf.functionName && cf.functionName.length > 0 ? cf.functionName : "(anonymous)") || "(unknown)";
  const url = toDisplayUrl(cf.url ?? "");
  const line = typeof cf.lineNumber === "number" ? cf.lineNumber + 1 : null;
  const col = typeof cf.columnNumber === "number" ? cf.columnNumber + 1 : null;
  const loc = line == null ? url : `${url}:${line}${col == null ? "" : `:${col}`}`;
  return { fn, loc };
}

function buildParentMap(nodes) {
  const parentById = new Map();
  for (const n of nodes) {
    const children = Array.isArray(n.children) ? n.children : [];
    for (const child of children) {
      if (typeof child !== "number") continue;
      if (!parentById.has(child)) parentById.set(child, n.id);
    }
  }
  return parentById;
}

function buildStack(nodeId, parentById, nodeById, limit = 16) {
  const out = [];
  let cur = nodeId;
  while (cur != null && out.length < limit) {
    const node = nodeById.get(cur);
    if (!node) break;
    out.push(formatFrame(node));
    cur = parentById.get(cur) ?? null;
  }
  out.reverse();
  return out;
}

function ms(us) {
  return us / 1000;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) {
    usage();
    process.exitCode = 2;
    return;
  }

  const topN = Number.parseInt(readArg("top", "25"), 10) || 25;
  const stacksN = Number.parseInt(readArg("stacks", "10"), 10) || 10;
  const filter = readArg("filter", "");
  const jsonOut = hasFlag("json");

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const samples = Array.isArray(raw.samples) ? raw.samples : [];
  const timeDeltas = Array.isArray(raw.timeDeltas) ? raw.timeDeltas : null;

  const nodeById = new Map();
  for (const n of nodes) {
    if (n && typeof n.id === "number") nodeById.set(n.id, n);
  }
  const parentById = buildParentMap(nodes);

  let totalUs = 0;
  const selfUsById = new Map();
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    if (typeof id !== "number") continue;
    const dt = timeDeltas ? timeDeltas[i] : 1000;
    if (typeof dt !== "number" || !Number.isFinite(dt) || dt < 0) continue;
    totalUs += dt;
    selfUsById.set(id, (selfUsById.get(id) ?? 0) + dt);
  }

  const entries = [];
  for (const [id, selfUs] of selfUsById.entries()) {
    const node = nodeById.get(id);
    if (!node) continue;
    const { fn, loc } = formatFrame(node);
    if (filter) {
      const hay = `${fn} ${loc} ${(node.callFrame?.url ?? "")}`.toLowerCase();
      if (!hay.includes(filter.toLowerCase())) continue;
    }
    entries.push({ id, selfUs, fn, loc });
  }
  entries.sort((a, b) => b.selfUs - a.selfUs);

  const top = entries.slice(0, Math.max(1, topN));
  const stackEntries = top.slice(0, Math.max(1, stacksN)).map((e) => {
    const stack = buildStack(e.id, parentById, nodeById, 18);
    return {
      ...e,
      stack: stack.map((f) => `${f.fn} (${f.loc})`),
    };
  });

  const out = {
    file: path.resolve(file),
    totalTimeMs: Math.round(ms(totalUs) * 1000) / 1000,
    totalSamples: samples.length,
    topSelf: top.map((e) => ({
      selfMs: Math.round(ms(e.selfUs) * 1000) / 1000,
      selfPct: totalUs > 0 ? Math.round(((e.selfUs / totalUs) * 100) * 10) / 10 : null,
      fn: e.fn,
      loc: e.loc,
    })),
    topStacks: stackEntries.map((e) => ({
      selfMs: Math.round(ms(e.selfUs) * 1000) / 1000,
      selfPct: totalUs > 0 ? Math.round(((e.selfUs / totalUs) * 100) * 10) / 10 : null,
      fn: e.fn,
      loc: e.loc,
      stack: e.stack,
    })),
  };

  if (jsonOut) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }

  process.stdout.write(`cpuprofile: ${out.file}\n`);
  process.stdout.write(`total: ${out.totalTimeMs}ms samples=${out.totalSamples}\n\n`);
  process.stdout.write(`Top self-time frames (top ${topN}):\n`);
  for (const row of out.topSelf.slice(0, topN)) {
    process.stdout.write(
      `  - ${String(row.selfPct ?? "?").padStart(5)}%  ${String(row.selfMs).padStart(8)}ms  ${row.fn}  (${row.loc})\n`,
    );
  }
  process.stdout.write(`\nTop stacks (top ${Math.min(stacksN, out.topStacks.length)}):\n`);
  for (const row of out.topStacks.slice(0, stacksN)) {
    process.stdout.write(
      `\n  - ${String(row.selfPct ?? "?")}% ${row.selfMs}ms ${row.fn} (${row.loc})\n`,
    );
    for (const line of row.stack.slice(Math.max(0, row.stack.length - 10))) {
      process.stdout.write(`      ${line}\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.stderr.write("\n");
  process.exitCode = 1;
});

