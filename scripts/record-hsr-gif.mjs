#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parsePositiveIntArg(name, fallback) {
  const raw = readArg(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parsePositiveNumberArg(name, fallback) {
  const raw = readArg(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function runOrThrow(command, args, message) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(message);
  }
}

const mode = readArg("--mode", "widget");
if (mode !== "widget" && mode !== "router") {
  throw new Error("--mode must be widget or router");
}

const cols = Number(readArg("--cols", "110"));
const rows = Number(readArg("--rows", "32"));
if (!Number.isInteger(cols) || cols <= 0) {
  throw new Error("--cols must be a positive integer");
}
if (!Number.isInteger(rows) || rows <= 0) {
  throw new Error("--rows must be a positive integer");
}

const castArg = readArg("--cast", `out/hsr-${mode}.cast`);
const outArg = readArg("--out", `out/hsr-${mode}.gif`);
let castPath = resolve(castArg);
let gifPath = resolve(outArg);

if (existsSync(castPath) && statSync(castPath).isDirectory()) {
  castPath = resolve(castPath, `hsr-${mode}.cast`);
  console.warn(`[record-hsr-gif] --cast pointed to a directory; using ${castPath}`);
}
if (existsSync(gifPath) && statSync(gifPath).isDirectory()) {
  gifPath = resolve(gifPath, `hsr-${mode}.gif`);
  console.warn(`[record-hsr-gif] --out pointed to a directory; using ${gifPath}`);
}
const skipGif = hasFlag("--cast-only");
const manual = hasFlag("--manual");
const scripted = hasFlag("--scripted");
const startupDelayMs = parsePositiveIntArg("--startup-delay-ms", 1200);
const sceneDelayMs = parsePositiveIntArg("--scene-delay-ms", 1400);
const settleDelayMs = parsePositiveIntArg("--settle-delay-ms", 900);
const idleTimeLimitSeconds = parsePositiveNumberArg("--idle-time-limit", 2);
const sceneText = readArg("--scene-text", "");

if (manual && scripted) {
  throw new Error("--manual and --scripted cannot be used together");
}

const useScripted = scripted;

mkdirSync(dirname(castPath), { recursive: true });
mkdirSync(dirname(gifPath), { recursive: true });

if (!commandExists("asciinema")) {
  throw new Error(
    "asciinema is required. Install: https://docs.asciinema.org/manual/installation/",
  );
}

const appEntry = `scripts/hsr/${mode}-app.mjs`;
if (!existsSync(resolve(appEntry))) {
  throw new Error(`Missing HSR demo entry: ${appEntry}`);
}

console.log(`[record-hsr-gif] Recording ${mode} demo to ${castPath}`);

const recordCommand = useScripted
  ? [
      "node scripts/hsr/record-runner.mjs",
      `--mode ${mode}`,
      `--startup-delay-ms ${String(startupDelayMs)}`,
      `--scene-delay-ms ${String(sceneDelayMs)}`,
      `--settle-delay-ms ${String(settleDelayMs)}`,
      ...(sceneText.trim().length > 0 ? [`--scene-text ${JSON.stringify(sceneText)}`] : []),
    ].join(" ")
  : `node ${appEntry}`;

if (useScripted) {
  console.log(
    "[record-hsr-gif] Scripted mode: auto-applies 3 timed HSR scene edits, then exits and restores source files.",
  );
} else {
  console.log(
    `[record-hsr-gif] Manual mode: edit scripts/hsr/${mode === "widget" ? "widget-view.mjs (or use in-app self-edit-code + Enter/F6/Ctrl+O)" : "router-routes.mjs"}, then quit with F10 / Alt+Q / Ctrl+C / Ctrl+X.`,
  );
}

runOrThrow(
  "asciinema",
  [
    "rec",
    "--overwrite",
    "--idle-time-limit",
    String(idleTimeLimitSeconds),
    "--cols",
    String(cols),
    "--rows",
    String(rows),
    "--title",
    `Rezi HSR ${mode} demo`,
    "--command",
    recordCommand,
    castPath,
  ],
  "asciinema recording failed",
);

if (skipGif) {
  console.log(`[record-hsr-gif] Cast saved: ${castPath}`);
  process.exit(0);
}

if (commandExists("agg")) {
  console.log(`[record-hsr-gif] Converting cast to GIF via agg: ${gifPath}`);
  runOrThrow("agg", ["--font-size", "18", castPath, gifPath], "agg conversion failed");
  console.log(`[record-hsr-gif] GIF saved: ${gifPath}`);
  process.exit(0);
}

if (commandExists("asciinema", ["gif", "--help"])) {
  console.log(`[record-hsr-gif] Converting cast to GIF via asciinema gif: ${gifPath}`);
  runOrThrow("asciinema", ["gif", castPath, gifPath], "asciinema gif conversion failed");
  console.log(`[record-hsr-gif] GIF saved: ${gifPath}`);
  process.exit(0);
}

console.warn(`[record-hsr-gif] No GIF converter found. Cast is available at ${castPath}`);
console.warn(
  "[record-hsr-gif] Install agg (https://github.com/asciinema/agg) or use asciinema gif if available.",
);
