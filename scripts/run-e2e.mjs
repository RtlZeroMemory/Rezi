#!/usr/bin/env node
// run-e2e.mjs
//
// Deterministic e2e test runner.
//
// Requirements:
// - Discover e2e test files deterministically (sorted paths)
// - Run `node --test` with explicit file paths (no shell globs)
// - Support:
//   - packages/<pkg>/dist/.../__e2e__/.../*.test.js

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

function parseArgs(argv) {
  let profile = "full";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") {
      const v = argv[i + 1];
      if (v === "full" || v === "reduced") {
        profile = v;
        i++;
        continue;
      }
      throw new Error(`run-e2e: invalid --profile value: ${String(v)}`);
    }
  }

  return { profile };
}

function listDirSorted(dir) {
  const entries = readdirSync(dir);
  entries.sort();
  return entries;
}

function collectFilesRecursiveSorted(dir, predicate) {
  const out = [];

  function walk(d) {
    const entries = listDirSorted(d);
    for (const name of entries) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (predicate(full)) out.push(full);
    }
  }

  walk(dir);
  out.sort();
  return out;
}

function collectPackageE2eTests(root) {
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return [];

  const out = [];
  const pkgs = listDirSorted(packagesDir);
  for (const pkg of pkgs) {
    const distDir = join(packagesDir, pkg, "dist");
    if (!existsSync(distDir)) continue;

    const marker = `${sep}__e2e__${sep}`;
    const tests = collectFilesRecursiveSorted(distDir, (fullPath) => {
      return fullPath.includes(marker) && fullPath.endsWith(".test.js");
    });
    out.push(...tests);
  }

  out.sort();
  return out;
}

const root = process.cwd();
const { profile } = parseArgs(process.argv.slice(2));
const files = collectPackageE2eTests(root);

if (files.length === 0) {
  process.stderr.write(
    "run-e2e: no e2e tests found under packages/*/dist/**/__e2e__/**/*.test.js\n" +
      "run-e2e: did you run `npm run build`?\n",
  );
  process.exit(1);
}

const relFiles = files.map((f) => relative(root, f));

const cmd = process.execPath;
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
const args = ["--test", ...(nodeMajor >= 19 ? ["--test-concurrency=1"] : []), ...relFiles];

const res = spawnSync(cmd, args, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    REZI_E2E_PROFILE: profile,
  },
});

process.exit(res.status ?? 1);
