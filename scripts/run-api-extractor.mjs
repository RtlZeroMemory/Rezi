#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = process.cwd();
const local = process.argv.includes("--local");
const cli =
  process.platform === "win32"
    ? resolve(root, "node_modules/.bin/api-extractor.cmd")
    : resolve(root, "node_modules/.bin/api-extractor");
const configs = [
  "packages/core/api-extractor.json",
  "packages/node/api-extractor.json",
  "packages/jsx/api-extractor.json",
  "packages/testkit/api-extractor.json",
];

function normalizeApiReport(reportPath) {
  if (!existsSync(reportPath)) return;
  const report = readFileSync(reportPath, "utf8");
  const normalizedRoot = root.replaceAll("\\", "/");
  const normalized = report.replaceAll(`${normalizedRoot}/`, "");
  if (normalized !== report) {
    writeFileSync(reportPath, normalized, "utf8");
  }
}

for (const config of configs) {
  const projectRoot = resolve(root, dirname(config));
  const packageName = basename(projectRoot);
  mkdirSync(resolve(projectRoot, "etc"), { recursive: true });
  mkdirSync(resolve(projectRoot, "temp/api-extractor"), { recursive: true });

  const reportPath = resolve(projectRoot, "etc", `${packageName}.api.md`);
  const tempReportPath = resolve(projectRoot, "temp/api-extractor", `${packageName}.api.md`);
  const args = ["run", "--config", config, "--local"];

  const result = spawnSync(cli, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.error) {
    console.error(`Failed to launch API Extractor: ${cli} ${args.join(" ")}`);
    console.error(result.error);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  normalizeApiReport(tempReportPath);
  normalizeApiReport(reportPath);

  if (local) continue;

  const expected = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;
  const actual = existsSync(tempReportPath) ? readFileSync(tempReportPath, "utf8") : null;
  if (expected !== actual) {
    console.error(
      `API report out of date for ${packageName}. Copy ${tempReportPath} to ${reportPath}.`,
    );
    process.exit(1);
  }
}
