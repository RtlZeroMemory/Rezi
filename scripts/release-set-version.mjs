#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTRA_RELEASE_PACKAGE_DIRS = ["packages/ink-gradient-shim", "packages/ink-spinner-shim"];

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

const version = process.argv[2];
if (typeof version !== "string" || version.length === 0) {
  die("release-set-version: usage: node scripts/release-set-version.mjs <version>");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function expandWorkspacePattern(pattern) {
  // Supports the small set of workspace patterns used in this repo:
  // - explicit paths (packages/core)
  // - one-level globs (examples/*)
  if (!pattern.includes("*")) return [pattern];

  const star = pattern.indexOf("*");
  const base = pattern.slice(0, star);
  const baseDir = resolve(ROOT, base);
  if (!isDir(baseDir)) return [];

  const out = [];
  const entries = readdirSync(baseDir).slice().sort();
  for (const name of entries) {
    const full = join(baseDir, name);
    if (!isDir(full)) continue;
    out.push(join(base, name));
  }
  return out;
}

function listWorkspaceDirs() {
  const rootPkg = readJson(join(ROOT, "package.json"));
  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : [];
  const out = [];
  for (const w of workspaces) {
    if (typeof w !== "string") continue;
    out.push(...expandWorkspacePattern(w));
  }
  return out;
}

function listReleasePackageDirs() {
  const dirs = [...listWorkspaceDirs(), ...EXTRA_RELEASE_PACKAGE_DIRS];
  return [...new Set(dirs)].sort();
}

function updateInternalDeps(pkgJson, nextVersion) {
  const depFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const field of depFields) {
    const deps = pkgJson[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith("@rezi-ui/")) continue;
      if (typeof spec !== "string") continue;
      deps[name] = nextVersion;
    }
  }
}

const releasePackageDirs = listReleasePackageDirs();
if (releasePackageDirs.length === 0) die("release-set-version: no release packages discovered");

for (const relDir of releasePackageDirs) {
  const pkgPath = join(ROOT, relDir, "package.json");
  if (!statSync(pkgPath, { throwIfNoEntry: false })) continue;
  const pkgJson = readJson(pkgPath);
  if (typeof pkgJson !== "object" || pkgJson === null) continue;
  if (typeof pkgJson.version === "string") {
    pkgJson.version = version;
  }
  updateInternalDeps(pkgJson, version);
  writeJson(pkgPath, pkgJson);
}

process.stdout.write(
  `release-set-version: set version=${version} for ${releasePackageDirs.length} package(s)\n`,
);
