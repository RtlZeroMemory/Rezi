#!/usr/bin/env node
/**
 * check-core-portability.mjs
 *
 * Enforces that @rezi-ui/core contains no Node-specific APIs.
 * Per docs/dev/style-guide.md and docs/packages/core.md:
 * - No `node:*` imports
 * - No `Buffer` usage
 * - No `worker_threads` imports
 * - No `MessagePort` or `Worker` identifiers
 *
 * Exit code 1 on violation, 0 on success.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CORE_SRC = join(ROOT, "packages", "core", "src");

/**
 * @typedef {{ file: string; line: number; col: number; pattern: string; match: string }} Violation
 */

/** @type {Array<{ pattern: RegExp; name: string }>} */
const FORBIDDEN_PATTERNS = [
  // node: imports (e.g., import { foo } from "node:fs")
  { pattern: /["']node:[^"']+["']/g, name: "node:* import" },
  // Buffer (word boundary match)
  { pattern: /\bBuffer\b/g, name: "Buffer" },
  // worker_threads import/usage
  { pattern: /["']worker_threads["']/g, name: "worker_threads import" },
  { pattern: /\bworker_threads\b/g, name: "worker_threads" },
  // MessagePort or Worker identifiers
  { pattern: /\bMessagePort\b/g, name: "MessagePort" },
  { pattern: /\bWorker\b/g, name: "Worker" },
];

/**
 * Recursively collect all .ts files in a directory
 * @param {string} dir
 * @returns {string[]}
 */
function collectTsFiles(dir) {
  /** @type {string[]} */
  const files = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      // Skip test directories — they are allowed to use node:* imports
      if (entry === "__tests__") continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...collectTsFiles(fullPath));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Remove single-line and block comment content from a line
 * This is a simple heuristic and may not handle all edge cases
 * (e.g., comments inside strings), but should work for the forbidden patterns.
 * @param {string} line
 * @param {boolean} inBlockComment
 * @returns {{ cleanedLine: string; inBlockComment: boolean }}
 */
function stripComments(line, initialInBlockComment) {
  let cleaned = "";
  let i = 0;
  let inBlock = initialInBlockComment;

  while (i < line.length) {
    if (inBlock) {
      // Look for end of block comment
      const endIdx = line.indexOf("*/", i);
      if (endIdx === -1) {
        // Rest of line is in block comment
        return { cleanedLine: cleaned, inBlockComment: true };
      }
      i = endIdx + 2;
      inBlock = false;
    } else {
      // Check for start of single-line comment
      if (line[i] === "/" && line[i + 1] === "/") {
        // Rest of line is comment
        return { cleanedLine: cleaned, inBlockComment: false };
      }
      // Check for start of block comment
      if (line[i] === "/" && line[i + 1] === "*") {
        inBlock = true;
        i += 2;
        continue;
      }
      // Preserve string literals (needed to detect import specifiers) and
      // avoid treating comment markers inside strings as comments.
      if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
        const quote = line[i];
        cleaned += line[i];
        i++;
        // Skip to end of string (simple, doesn't handle escapes perfectly)
        while (i < line.length) {
          if (line[i] === "\\") {
            cleaned += line[i] + (line[i + 1] ?? "");
            i += 2;
            continue;
          }
          cleaned += line[i];
          if (line[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      cleaned += line[i];
      i++;
    }
  }

  return { cleanedLine: cleaned, inBlockComment: inBlock };
}

/**
 * Check a single file for forbidden patterns
 * @param {string} filePath
 * @returns {Violation[]}
 */
function checkFile(filePath) {
  /** @type {Violation[]} */
  const violations = [];

  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return violations;
  }

  const lines = content.split("\n");
  let inBlockComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line === undefined) continue;

    // Strip comments from line before checking
    const result = stripComments(line, inBlockComment);
    const codeLine = result.cleanedLine;
    inBlockComment = result.inBlockComment;

    // Skip if line is empty after stripping comments
    if (codeLine.trim() === "") continue;

    for (const { pattern, name } of FORBIDDEN_PATTERNS) {
      // Reset the regex lastIndex for global patterns
      pattern.lastIndex = 0;

      for (;;) {
        const match = pattern.exec(codeLine);
        if (match === null) break;
        violations.push({
          file: filePath,
          line: lineIdx + 1,
          col: match.index + 1,
          pattern: name,
          match: match[0],
        });
      }
    }
  }

  return violations;
}

/**
 * Main entry point
 * @param {string} [coreDir] - Override for CORE_SRC (used in tests)
 * @returns {{ success: boolean; violations: Violation[]; output: string }}
 */
export function checkCorePortability(coreDir = CORE_SRC) {
  const files = collectTsFiles(coreDir);
  /** @type {Violation[]} */
  const allViolations = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    return {
      success: true,
      violations: [],
      output: "check-core-portability: OK (no forbidden patterns found)\n",
    };
  }

  // Sort by file, then line, then column for deterministic output
  allViolations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  });

  const first = allViolations[0];
  const relPath = relative(ROOT, first.file);
  const outputLines = [
    "check-core-portability: FAIL",
    "",
    `Found ${allViolations.length} forbidden pattern(s) in @rezi-ui/core:`,
    "",
  ];

  for (const v of allViolations) {
    const rel = relative(ROOT, v.file);
    outputLines.push(`  ${rel}:${v.line}:${v.col} - ${v.pattern}: ${v.match}`);
  }

  outputLines.push("");
  outputLines.push(`First violation: ${relPath}:${first.line}:${first.col}`);
  outputLines.push(`Pattern: ${first.pattern}`);
  outputLines.push(`Match: ${first.match}`);
  outputLines.push("");

  return {
    success: false,
    violations: allViolations,
    output: outputLines.join("\n"),
  };
}

// Run as CLI if executed directly
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("check-core-portability.mjs") ||
    process.argv[1].includes("check-core-portability"));

if (isMain) {
  const result = checkCorePortability();
  process.stdout.write(result.output);
  process.exit(result.success ? 0 : 1);
}
