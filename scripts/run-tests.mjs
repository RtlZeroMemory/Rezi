#!/usr/bin/env node
/**
 * run-tests.mjs
 *
 * Deterministic Node test runner.
 *
 * Requirements (locked by EPIC #14 / Task #38):
 * - Discover test files deterministically (sorted paths)
 * - Run `node --test` with explicit file paths (no shell globs)
 * - Support:
 *   - scripts/__tests__/*.test.mjs
 *   - packages/<pkg>/dist/<any>/__tests__/<any>/*.test.js
 * - Avoid depending on wall-clock time
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

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

function collectScriptTests(root) {
  const dir = join(root, "scripts", "__tests__");
  if (!existsSync(dir)) return [];
  return collectFilesRecursiveSorted(dir, (fullPath) => fullPath.endsWith(".test.mjs"));
}

function collectPackageTests(root) {
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return [];

  const out = [];
  const pkgs = listDirSorted(packagesDir);
  for (const pkg of pkgs) {
    const distDir = join(packagesDir, pkg, "dist");
    if (!existsSync(distDir)) continue;

    const marker = `${sep}__tests__${sep}`;
    const tests = collectFilesRecursiveSorted(distDir, (fullPath) => {
      return fullPath.includes(marker) && fullPath.endsWith(".test.js");
    });
    out.push(...tests);
  }

  out.sort();
  return out;
}

function parseArgs(argv) {
  let scope = "all";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scope") {
      const v = argv[i + 1];
      if (v === "all" || v === "scripts" || v === "packages") {
        scope = v;
        i++;
        continue;
      }
      throw new Error(`run-tests: invalid --scope value: ${String(v)}`);
    }
  }

  return { scope };
}

const root = process.cwd();
const { scope } = parseArgs(process.argv.slice(2));

const scriptsTests = scope === "scripts" || scope === "all" ? collectScriptTests(root) : [];
const packageTests = scope === "packages" || scope === "all" ? collectPackageTests(root) : [];

const files = [...scriptsTests, ...packageTests].sort();

if (files.length === 0) {
  process.stderr.write("run-tests: no test files found\n");
  process.exit(1);
}

if (scope === "all") {
  if (scriptsTests.length === 0) {
    process.stderr.write(
      "run-tests: no scripts tests found under scripts/__tests__/**/*.test.mjs\n",
    );
    process.exit(1);
  }
  if (packageTests.length === 0) {
    process.stderr.write(
      "run-tests: no package tests found under packages/*/dist/**/__tests__/**/*.test.js\n" +
        "run-tests: did you run `npm run build`?\n",
    );
    process.exit(1);
  }
}

if (scope === "scripts" && scriptsTests.length === 0) {
  process.stderr.write("run-tests: no scripts tests found under scripts/__tests__/**/*.test.mjs\n");
  process.exit(1);
}

if (scope === "packages" && packageTests.length === 0) {
  process.stderr.write(
    "run-tests: no package tests found under packages/*/dist/**/__tests__/**/*.test.js\n" +
      "run-tests: did you run `npm run build`?\n",
  );
  process.exit(1);
}

// Use relative paths for more stable output across environments.
const relFiles = files.map((f) => relative(root, f));

const cmd = process.execPath;
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
const args = ["--test", ...(nodeMajor >= 19 ? ["--test-concurrency=1"] : []), ...relFiles];

const res = spawnSync(cmd, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(res.status ?? 1);
