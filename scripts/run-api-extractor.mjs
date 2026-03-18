#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

for (const config of configs) {
  const projectRoot = resolve(root, dirname(config));
  mkdirSync(resolve(projectRoot, "etc"), { recursive: true });
  mkdirSync(resolve(projectRoot, "temp/api-extractor"), { recursive: true });

  const args = ["run", "--config", config];
  if (local) args.push("--local");

  const result = spawnSync(cli, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
