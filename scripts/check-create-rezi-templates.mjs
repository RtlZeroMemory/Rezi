#!/usr/bin/env node
/**
 * check-create-rezi-templates.mjs
 *
 * Deterministic smoke checks for create-rezi templates.
 *
 * Validates:
 * - Template metadata matches on-disk template directories.
 * - Template package scripts/dependencies contain expected entries.
 * - Template entry files build and typecheck against local @rezi-ui declarations.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CREATE_REZI_SCAFFOLD_DIST = join(ROOT, "packages", "create-rezi", "dist", "scaffold.js");
const TEMPLATES_ROOT = join(ROOT, "packages", "create-rezi", "templates");
const CORE_TYPES = join(ROOT, "packages", "core", "dist", "index.d.ts");
const NODE_TYPES = join(ROOT, "packages", "node", "dist", "index.d.ts");
const TSC_CLI = join(ROOT, "node_modules", "typescript", "bin", "tsc");
const NODE_TYPE_ROOT = join(ROOT, "node_modules", "@types");

function fail(message) {
  process.stderr.write(`check-create-rezi-templates: FAIL\n${message}\n`);
  process.exit(1);
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runTsc(projectDir, templateKey, mode) {
  const isBuild = mode === "build";
  const smokeConfigPath = join(projectDir, "tsconfig.smoke.json");
  const smokeOutDir = join(projectDir, "out");
  const smokeConfig = {
    extends: join(TEMPLATES_ROOT, templateKey, "tsconfig.json"),
    compilerOptions: {
      noEmit: !isBuild,
      outDir: smokeOutDir,
      baseUrl: ".",
      typeRoots: [NODE_TYPE_ROOT],
      paths: {
        "@rezi-ui/core": [CORE_TYPES],
        "@rezi-ui/node": [NODE_TYPES],
      },
    },
    include: [join(TEMPLATES_ROOT, templateKey, "src", "main.ts")],
  };

  writeFileSync(smokeConfigPath, toJson(smokeConfig), "utf8");

  const result = spawnSync(
    process.execPath,
    [TSC_CLI, "-p", smokeConfigPath, "--pretty", "false"],
    {
      cwd: projectDir,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(`Template ${templateKey} failed ${mode}.\n${output}`);
  }
}

if (!existsSync(CREATE_REZI_SCAFFOLD_DIST)) {
  fail(
    [
      `Missing ${CREATE_REZI_SCAFFOLD_DIST}.`,
      "Run `npm run build` before template smoke checks.",
    ].join("\n"),
  );
}

if (!existsSync(TSC_CLI)) {
  fail(`Missing ${TSC_CLI}. Run npm install (or bun install) first.`);
}

if (!existsSync(CORE_TYPES) || !existsSync(NODE_TYPES)) {
  fail(
    [
      "Missing package declaration outputs required for typecheck.",
      `Expected: ${CORE_TYPES}`,
      `Expected: ${NODE_TYPES}`,
      "Run `npm run build` before template smoke checks.",
    ].join("\n"),
  );
}

const scaffoldModule = await import(pathToFileURL(CREATE_REZI_SCAFFOLD_DIST).href);
const templates = scaffoldModule.TEMPLATE_DEFINITIONS;
if (!Array.isArray(templates) || templates.length === 0) {
  fail("TEMPLATE_DEFINITIONS is missing or empty in create-rezi scaffold output.");
}

const templateDirsOnDisk = readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const templateDirsDefined = [...templates.map((template) => template.dir)].sort();

if (templateDirsOnDisk.join(",") !== templateDirsDefined.join(",")) {
  fail(
    [
      "Template metadata and template directories are out of sync.",
      `Defined: ${templateDirsDefined.join(", ")}`,
      `On disk: ${templateDirsOnDisk.join(", ")}`,
    ].join("\n"),
  );
}

process.stdout.write(`check-create-rezi-templates: checking ${templates.length} templates\n`);

for (const template of templates) {
  if (template.key !== template.dir) {
    fail(`Template key/dir mismatch: key=${template.key}, dir=${template.dir}`);
  }

  const templateDir = join(TEMPLATES_ROOT, template.dir);
  const packagePath = join(templateDir, "package.json");
  const tsconfigPath = join(templateDir, "tsconfig.json");
  const mainPath = join(templateDir, "src", "main.ts");

  if (!existsSync(packagePath) || !existsSync(tsconfigPath) || !existsSync(mainPath)) {
    fail(`Template ${template.key} is missing required files.`);
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const scripts = packageJson.scripts ?? {};
  if (typeof scripts.start !== "string" || typeof scripts.dev !== "string") {
    fail(`Template ${template.key} package.json must include start/dev scripts.`);
  }
  if (typeof scripts.build !== "string") {
    fail(`Template ${template.key} package.json must include a build script.`);
  }
  if (typeof scripts.typecheck !== "string") {
    fail(`Template ${template.key} package.json must include a typecheck script.`);
  }

  const deps = packageJson.dependencies ?? {};
  if (typeof deps["@rezi-ui/core"] !== "string" || typeof deps["@rezi-ui/node"] !== "string") {
    fail(`Template ${template.key} must declare @rezi-ui/core and @rezi-ui/node dependencies.`);
  }

  const tempProject = mkdtempSync(join(tmpdir(), `rezi-template-smoke-${template.key}-`));
  try {
    runTsc(tempProject, template.dir, "build");
    runTsc(tempProject, template.dir, "typecheck");
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }

  process.stdout.write(`  - ${template.key}: build/typecheck OK\n`);
}

process.stdout.write("check-create-rezi-templates: OK\n");
