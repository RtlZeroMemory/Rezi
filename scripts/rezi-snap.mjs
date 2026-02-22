#!/usr/bin/env node
/**
 * rezi-snap.mjs — Golden snapshot CLI tool.
 *
 * Captures and verifies deterministic visual snapshots of gallery scenes.
 *
 * Usage:
 *   node scripts/rezi-snap.mjs --update               # Update all snapshots
 *   node scripts/rezi-snap.mjs --verify                # Verify against stored snapshots
 *   node scripts/rezi-snap.mjs --scene button-matrix   # Single scene
 *   node scripts/rezi-snap.mjs --theme dark --theme light  # Specific themes
 *   node scripts/rezi-snap.mjs --list                  # List available scenes
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const SNAP_DIR = join(ROOT, "snapshots");

async function main() {
  const args = process.argv.slice(2);
  const isUpdate = args.includes("--update");
  const isVerify = args.includes("--verify");
  const isList = args.includes("--list");

  // Dynamic imports (built output)
  const core = await import(join(ROOT, "packages/core/dist/index.js"));
  const galleryScenes = await import(join(ROOT, "examples/gallery/dist/scenes.js"));

  const {
    createTestRenderer,
    captureSnapshot,
    serializeSnapshot,
    parseSnapshot,
    diffSnapshots,
    coerceToLegacyTheme,
    darkTheme,
    lightTheme,
    nordTheme,
  } = core;

  const { scenes } = galleryScenes;

  if (isList) {
    console.log("Available scenes:");
    for (const scene of scenes) {
      console.log(`  ${scene.name} — ${scene.title}`);
    }
    process.exit(0);
  }

  // Parse scene filter
  const sceneFilter = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scene" && args[i + 1]) {
      sceneFilter.push(args[i + 1]);
    }
  }

  // Parse theme filter
  const themeFilter = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--theme" && args[i + 1]) {
      themeFilter.push(args[i + 1]);
    }
  }

  const themes = {
    dark: darkTheme,
    light: lightTheme,
    nord: nordTheme,
  };

  const themeNames =
    themeFilter.length > 0 ? themeFilter.filter((t) => t in themes) : Object.keys(themes);

  const scenesToProcess =
    sceneFilter.length > 0 ? scenes.filter((s) => sceneFilter.includes(s.name)) : scenes;

  if (scenesToProcess.length === 0) {
    console.error("No scenes matched the filter.");
    process.exit(1);
  }

  if (!isUpdate && !isVerify) {
    console.error("Usage: rezi-snap --update | --verify [--scene <name>] [--theme <name>]");
    process.exit(1);
  }

  mkdirSync(SNAP_DIR, { recursive: true });

  let failures = 0;
  let updates = 0;
  let matches = 0;

  for (const scene of scenesToProcess) {
    for (const themeName of themeNames) {
      const themeObj = themes[themeName];
      if (!themeObj) continue;

      const legacyTheme = coerceToLegacyTheme(themeObj);
      const viewport = { cols: 80, rows: 40 };
      const snapshot = captureSnapshot(
        scene.name,
        scene.render(),
        { viewport, theme: legacyTheme },
        themeName,
      );

      const snapFile = join(SNAP_DIR, `${scene.name}.${themeName}.snap`);

      if (isUpdate) {
        writeFileSync(snapFile, serializeSnapshot(snapshot), "utf-8");
        updates++;
        console.log(`  ✓ Updated: ${scene.name} (${themeName})`);
      } else if (isVerify) {
        if (!existsSync(snapFile)) {
          console.log(`  ✗ Missing: ${snapFile}`);
          failures++;
          continue;
        }

        const stored = parseSnapshot(readFileSync(snapFile, "utf-8"));
        if (!stored) {
          console.log(`  ✗ Invalid snapshot file: ${snapFile}`);
          failures++;
          continue;
        }

        const diff = diffSnapshots(stored, snapshot);
        if (diff.match) {
          matches++;
          console.log(`  ✓ Match: ${scene.name} (${themeName})`);
        } else {
          failures++;
          console.log(`  ✗ Diff: ${scene.name} (${themeName})`);
          console.log(diff.summary);
        }
      }
    }
  }

  console.log();
  if (isUpdate) {
    console.log(`Updated ${updates} snapshot(s).`);
  } else {
    console.log(`Verified: ${matches} match, ${failures} failure(s).`);
    if (failures > 0) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
