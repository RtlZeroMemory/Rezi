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
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CREATE_REZI_SCAFFOLD_DIST = join(ROOT, "packages", "create-rezi", "dist", "scaffold.js");
const TEMPLATES_ROOT = join(ROOT, "packages", "create-rezi", "templates");
const CORE_TYPES = join(ROOT, "packages", "core", "dist", "index.d.ts");
const NODE_TYPES = join(ROOT, "packages", "node", "dist", "index.d.ts");
const TSC_CLI = join(ROOT, "node_modules", "typescript", "bin", "tsc");
const NODE_TYPE_ROOT = join(ROOT, "node_modules", "@types");
const LEGACY_LAYOUT_PATTERNS = Object.freeze([
  Object.freeze({
    name: "percentage layout constraint",
    regex:
      /\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight|flexBasis)\s*:\s*["'](?:\d+(?:\.\d+)?|\.\d+)\s*%["']/,
  }),
  Object.freeze({
    name: "responsive-map layout constraint",
    regex:
      /\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight|flexBasis|display)\s*:\s*\{[^}]*\b(?:sm|md|lg|xl)\s*:/m,
  }),
]);
const TEMPLATE_EXPR_ESCAPE_HATCH = Object.freeze(
  Object.freeze({
    name: "raw expr() usage (helper-first policy)",
    regex: /\bexpr\s*\(\s*["']/,
    allowMarker: "rezi-allow-expr",
  }),
);
const HOTSPOT_VIEWPORT_MATH = Object.freeze([
  Object.freeze({
    templateKey: "starship",
    relativeFile: "src/helpers/layout.ts",
    regex: /Math\.(?:floor|ceil|min|max)\([^)\n]*(?:viewport|cols|rows)/,
  }),
  Object.freeze({
    templateKey: "animation-lab",
    relativeFile: "src/helpers/state.ts",
    regex: /Math\.(?:floor|ceil|min|max)\([^)\n]*(?:viewport|cols|rows)/,
  }),
]);

function fail(message) {
  process.stderr.write(`check-create-rezi-templates: FAIL\n${message}\n`);
  process.exit(1);
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function collectFilesRecursiveSorted(dir, predicate) {
  const out = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .map((entry) => entry)
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (predicate(fullPath)) out.push(fullPath);
    }
  }

  walk(dir);
  out.sort();
  return out;
}

function findLineMatch(content, regex) {
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (regex.test(line)) {
      return Object.freeze({
        line: index + 1,
        snippet: line.trim(),
      });
    }
  }
  return null;
}

function snippetAtLine(content, lineNumber) {
  const lines = content.split(/\r?\n/u);
  const line = lines[Math.max(0, Math.trunc(lineNumber) - 1)] ?? "";
  return line.trim();
}

function stripTypeScriptComments(content) {
  // Conservative heuristic: blank out //... and /*...*/ while preserving newlines
  // so line-number reporting stays meaningful.
  const withoutBlock = content.replace(/\/\*[\s\S]*?\*\//gu, (match) =>
    match.replace(/[^\n]/gu, " "),
  );
  return withoutBlock.replace(/\/\/.*$/gmu, (match) => match.replace(/[^\n]/gu, " "));
}

function ensureNoLegacyLayoutPatterns(templateDir, templateKey) {
  const sourceDir = join(templateDir, "src");
  if (!existsSync(sourceDir)) return;
  const sourceFiles = collectFilesRecursiveSorted(
    sourceDir,
    (fullPath) => fullPath.endsWith(".ts") || fullPath.endsWith(".tsx"),
  );

  for (const sourceFile of sourceFiles) {
    const content = readFileSync(sourceFile, "utf8");
    const contentForCheck = stripTypeScriptComments(content);
    if (
      TEMPLATE_EXPR_ESCAPE_HATCH.regex.test(contentForCheck) &&
      !content.includes(TEMPLATE_EXPR_ESCAPE_HATCH.allowMarker)
    ) {
      const match = findLineMatch(content, TEMPLATE_EXPR_ESCAPE_HATCH.regex);
      fail(
        [
          `Template ${templateKey} includes banned ${TEMPLATE_EXPR_ESCAPE_HATCH.name}.`,
          `Hint: Templates should prefer helper constraints for ergonomic, readable intent. If a template must use raw expr(...) as an escape hatch, add a comment containing "${TEMPLATE_EXPR_ESCAPE_HATCH.allowMarker}".`,
          `File: ${relative(ROOT, sourceFile)}:${String(match?.line ?? 1)}`,
          `Line: ${match?.snippet ?? ""}`,
        ].join("\n"),
      );
    }
    for (const pattern of LEGACY_LAYOUT_PATTERNS) {
      const match = findLineMatch(contentForCheck, pattern.regex);
      if (match !== null) {
        fail(
          [
            `Template ${templateKey} includes banned ${pattern.name}.`,
            `File: ${relative(ROOT, sourceFile)}:${String(match.line)}`,
            `Line: ${snippetAtLine(content, match.line)}`,
          ].join("\n"),
        );
      }
    }
  }

  for (const hotspot of HOTSPOT_VIEWPORT_MATH) {
    if (hotspot.templateKey !== templateKey) continue;
    const fullPath = join(templateDir, hotspot.relativeFile);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, "utf8");
    const contentForCheck = stripTypeScriptComments(content);
    const match = findLineMatch(contentForCheck, hotspot.regex);
    if (match !== null) {
      fail(
        [
          `Template ${templateKey} reintroduced banned viewport arithmetic in ${hotspot.relativeFile}.`,
          `File: ${relative(ROOT, fullPath)}:${String(match.line)}`,
          `Line: ${snippetAtLine(content, match.line)}`,
        ].join("\n"),
      );
    }
  }
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
  if (typeof scripts.test !== "string") {
    fail(`Template ${template.key} package.json must include a test script.`);
  }

  const testsDir = join(templateDir, "src", "__tests__");
  if (!existsSync(testsDir)) {
    fail(`Template ${template.key} must include src/__tests__ example tests.`);
  }
  const testFiles = readdirSync(testsDir).filter((entry) => entry.endsWith(".test.ts"));
  if (testFiles.length < 2) {
    fail(`Template ${template.key} must include at least two example tests.`);
  }

  const deps = packageJson.dependencies ?? {};
  if (typeof deps["@rezi-ui/core"] !== "string" || typeof deps["@rezi-ui/node"] !== "string") {
    fail(`Template ${template.key} must declare @rezi-ui/core and @rezi-ui/node dependencies.`);
  }

  ensureNoLegacyLayoutPatterns(templateDir, template.key);

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
