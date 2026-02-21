#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { rewriteWidgetViewBanner } from "./widget-view-self-edit.mjs";

const ROUTER_HERO_PREFIX = /\{ text: "[^"\n]*", style: \{ fg: palette\.accent, bold: true \} \},/g;

export function readArg(argv, name, fallback) {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

export function parsePositiveInt(rawValue, label) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function sanitizeRouterPrefix(value) {
  const text = String(value);
  let withoutControl = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isControl = code < 32 || code === 127;
    withoutControl += isControl ? " " : text[i];
  }
  const normalized = withoutControl.replace(/\s+/g, " ").trim().slice(0, 30);
  const prefix = normalized.length > 0 ? normalized : "Router Update";
  return prefix.endsWith(" ") ? prefix : `${prefix} `;
}

export function applyRouterHeroPrefix(source, nextPrefix) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("router-routes source must be a non-empty string");
  }
  const prefix = sanitizeRouterPrefix(nextPrefix);
  let count = 0;
  const nextSource = source.replace(ROUTER_HERO_PREFIX, () => {
    count += 1;
    return `{ text: ${JSON.stringify(prefix)}, style: { fg: palette.accent, bold: true } },`;
  });
  if (count === 0) {
    throw new Error("Router hero title tokens not found in router-routes.mjs");
  }
  return Object.freeze({
    prefix,
    changed: nextSource !== source,
    nextSource,
    replacedCount: count,
  });
}

function sanitizeSceneText(value) {
  const text = typeof value === "string" ? value : "";
  let withoutControl = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isControl = code < 32 || code === 127;
    withoutControl += isControl ? " " : text[i];
  }
  return withoutControl.replace(/\s+/g, " ").trim();
}

export function getRecordSceneValues(mode, sceneText = "") {
  const custom = sanitizeSceneText(sceneText);
  if (custom.length > 0) {
    return Object.freeze([custom, `${custom} [2]`, `${custom} [3]`]);
  }

  if (mode === "widget") {
    return Object.freeze(["Live Update One", "Live Update Two", "Live Update Three"]);
  }
  if (mode === "router") {
    return Object.freeze(["Router Update One", "Router Update Two", "Router Update Three"]);
  }
  throw new Error("mode must be widget or router");
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function applySceneToFile(mode, filePath, sceneValue) {
  if (mode === "widget") {
    return rewriteWidgetViewBanner(filePath, sceneValue);
  }
  const source = readFileSync(filePath, "utf8");
  const result = applyRouterHeroPrefix(source, sceneValue);
  if (result.changed) {
    writeFileSync(filePath, result.nextSource, "utf8");
  }
  return result;
}

export async function runRecordSequence({
  mode,
  appEntry,
  targetFile,
  sceneText,
  startupDelayMs,
  sceneDelayMs,
  settleDelayMs,
}) {
  const originalSource = readFileSync(targetFile, "utf8");
  const scenes = getRecordSceneValues(mode, sceneText);

  const appProc = spawn(process.execPath, [appEntry], {
    stdio: "inherit",
  });

  let exited = false;
  let exitCode = null;
  let exitSignal = null;
  const waitForExit = new Promise((resolveExit, rejectExit) => {
    appProc.once("error", rejectExit);
    appProc.once("exit", (code, signal) => {
      exited = true;
      exitCode = code;
      exitSignal = signal;
      resolveExit({ code, signal });
    });
  });

  try {
    await sleep(startupDelayMs);
    if (exited) {
      throw new Error(`HSR demo exited before scripted scenes started (code=${String(exitCode)})`);
    }

    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i];
      applySceneToFile(mode, targetFile, scene);
      console.log(`[hsr-record-runner] Scene ${String(i + 1)}/${String(scenes.length)}: ${scene}`);
      await sleep(sceneDelayMs);
      if (exited) {
        throw new Error(`HSR demo exited during scripted scenes (code=${String(exitCode)})`);
      }
    }

    await sleep(settleDelayMs);
  } finally {
    if (!exited) {
      appProc.kill("SIGINT");
      const outcome = await Promise.race([waitForExit, sleep(2000).then(() => null)]);
      if (outcome === null && !exited) {
        appProc.kill("SIGTERM");
        await waitForExit;
      }
    } else {
      await waitForExit;
    }

    const currentSource = readFileSync(targetFile, "utf8");
    if (currentSource !== originalSource) {
      writeFileSync(targetFile, originalSource, "utf8");
    }
  }

  if (exitCode !== null && exitCode !== 0) {
    throw new Error(`HSR demo exited with code ${String(exitCode)}`);
  }
  if (exitSignal && exitSignal !== "SIGINT" && exitSignal !== "SIGTERM") {
    throw new Error(`HSR demo terminated by signal ${exitSignal}`);
  }
}

async function main(argv) {
  const mode = readArg(argv, "--mode", "widget");
  if (mode !== "widget" && mode !== "router") {
    throw new Error("--mode must be widget or router");
  }
  const startupDelayMs = parsePositiveInt(
    readArg(argv, "--startup-delay-ms", "1200"),
    "--startup-delay-ms",
  );
  const sceneDelayMs = parsePositiveInt(
    readArg(argv, "--scene-delay-ms", "1400"),
    "--scene-delay-ms",
  );
  const settleDelayMs = parsePositiveInt(
    readArg(argv, "--settle-delay-ms", "900"),
    "--settle-delay-ms",
  );
  const sceneText = readArg(argv, "--scene-text", "");

  const appEntry = resolve(`scripts/hsr/${mode}-app.mjs`);
  const targetFile = resolve(
    `scripts/hsr/${mode === "widget" ? "widget-view.mjs" : "router-routes.mjs"}`,
  );

  await runRecordSequence({
    mode,
    appEntry,
    targetFile,
    sceneText,
    startupDelayMs,
    sceneDelayMs,
    settleDelayMs,
  });
}

const isMain =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main(process.argv).catch((error) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[hsr-record-runner:error] ${message}`);
    process.exit(1);
  });
}
