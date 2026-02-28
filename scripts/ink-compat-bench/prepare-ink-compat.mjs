import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "../..");
const benchAppNodeModules = path.join(repoRoot, "packages/bench-app/node_modules");
mkdirSync(benchAppNodeModules, { recursive: true });

const inkLinkPath = path.join(benchAppNodeModules, "ink");
const compatPath = path.join(repoRoot, "packages/ink-compat");

rmSync(inkLinkPath, { force: true });
symlinkSync(compatPath, inkLinkPath, "junction");
console.log(`[ink-compat-bench] linked packages/bench-app/node_modules/ink -> ${compatPath}`);
