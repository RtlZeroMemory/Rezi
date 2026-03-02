#!/usr/bin/env node
/**
 * migrate-constraints-to-helpers.mjs
 *
 * A conservative codemod that converts common `expr("...")` patterns into the
 * helper-first constraint API (`visibilityConstraints`, `widthConstraints`, etc).
 *
 * Defaults to scanning create-rezi templates. Use `--write` to apply edits.
 *
 * Notes:
 * - Only transforms `expr("<string literal>")` calls.
 * - Only auto-edits files with a `{ ... } from "@rezi-ui/core"` (or `@rezi-ui/jsx`) named import.
 * - `--fix-clamp-order` enables a semantic migration for the common mistake:
 *   `clamp(viewport.w - 4, 20, 140)` → `clamp(20, viewport.w - 4, 140)`.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function usage() {
  const message = [
    "Usage: node scripts/migrate-constraints-to-helpers.mjs [--paths <dir> ...] [--write] [--fix-clamp-order]",
    "",
    "Defaults:",
    "  --paths packages/create-rezi/templates",
    "",
  ].join("\n");
  process.stderr.write(`${message}\n`);
}

function parseArgs(argv) {
  const paths = [];
  let write = false;
  let fixClampOrder = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--paths") {
      const v = argv[i + 1];
      if (typeof v !== "string" || v.length === 0) throw new Error("Missing value for --paths");
      paths.push(v);
      i++;
      continue;
    }
    if (a === "--write") {
      write = true;
      continue;
    }
    if (a === "--fix-clamp-order") {
      fixClampOrder = true;
      continue;
    }
    if (a === "-h" || a === "--help") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${String(a)}`);
  }

  if (paths.length === 0) paths.push("packages/create-rezi/templates");
  return { paths, write, fixClampOrder };
}

function collectFilesRecursiveSorted(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .map((e) => e)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursiveSorted(full));
      continue;
    }
    if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
  }

  out.sort();
  return out;
}

function normalizeExprSource(source) {
  return source.replace(/\s+/gu, "");
}

function parseNumberLiteral(raw) {
  if (!/^-?(?:\d+)(?:\.\d+)?$/u.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function replacementForExpr(source, { fixClampOrder }) {
  const normalized = normalizeExprSource(source);

  // if(viewport.w < N, 0, 1) → viewport.w >= N
  {
    const m = /^if\(viewport\.w<(-?(?:\d+)(?:\.\d+)?),0,1\)$/u.exec(normalized);
    if (m) {
      const n = parseNumberLiteral(m[1] ?? "");
      if (n !== null && Number.isInteger(n) && n >= 0) {
        return {
          replacement: `visibilityConstraints.viewportWidthAtLeast(${String(n)})`,
          imports: ["visibilityConstraints"],
          note: null,
        };
      }
    }
  }
  {
    const m = /^if\(viewport\.h<(-?(?:\d+)(?:\.\d+)?),0,1\)$/u.exec(normalized);
    if (m) {
      const n = parseNumberLiteral(m[1] ?? "");
      if (n !== null && Number.isInteger(n) && n >= 0) {
        return {
          replacement: `visibilityConstraints.viewportHeightAtLeast(${String(n)})`,
          imports: ["visibilityConstraints"],
          note: null,
        };
      }
    }
  }

  // if(viewport.h <= N, 0, 1) → viewport.h >= N+1 (integer thresholds only)
  {
    const m = /^if\(viewport\.h<=(-?(?:\d+)(?:\.\d+)?),0,1\)$/u.exec(normalized);
    if (m) {
      const n = parseNumberLiteral(m[1] ?? "");
      if (n !== null && Number.isInteger(n) && n >= 0) {
        return {
          replacement: `visibilityConstraints.viewportHeightAtLeast(${String(n + 1)})`,
          imports: ["visibilityConstraints"],
          note: "Converted <= threshold to >= (N+1) for integer viewport heights.",
        };
      }
    }
  }
  {
    const m = /^if\(viewport\.w<=(-?(?:\d+)(?:\.\d+)?),0,1\)$/u.exec(normalized);
    if (m) {
      const n = parseNumberLiteral(m[1] ?? "");
      if (n !== null && Number.isInteger(n) && n >= 0) {
        return {
          replacement: `visibilityConstraints.viewportWidthAtLeast(${String(n + 1)})`,
          imports: ["visibilityConstraints"],
          note: "Converted <= threshold to >= (N+1) for integer viewport widths.",
        };
      }
    }
  }

  // if(viewport.w >= N, A, B) / if(viewport.h >= N, A, B) (numbers only for now)
  {
    const m =
      /^if\(viewport\.(w|h)>=(?:-?(?:\d+)(?:\.\d+)?),-?(?:\d+)(?:\.\d+)?,-?(?:\d+)(?:\.\d+)?\)$/u.exec(
        normalized,
      );
    if (m) {
      const axis = m[1];
      const parts = /^if\(viewport\.(?:w|h)>=([^,]+),([^,]+),([^,]+)\)$/u.exec(normalized);
      if (parts) {
        const n = parseNumberLiteral(parts[1] ?? "");
        const a = parseNumberLiteral(parts[2] ?? "");
        const b = parseNumberLiteral(parts[3] ?? "");
        if (n !== null && a !== null && b !== null && Number.isInteger(n) && n >= 0) {
          const cond =
            axis === "w"
              ? `visibilityConstraints.viewportWidthAtLeast(${String(n)})`
              : `visibilityConstraints.viewportHeightAtLeast(${String(n)})`;
          return {
            replacement: `conditionalConstraints.ifThenElse(${cond}, ${String(a)}, ${String(b)})`,
            imports: ["conditionalConstraints", "visibilityConstraints"],
            note: null,
          };
        }
      }
    }
  }

  // max(MIN, viewport.w * R) → widthConstraints.minViewportPercent({ ratio: R, min: MIN })
  {
    const m = /^max\((-?(?:\d+)(?:\.\d+)?),viewport\.w\*(-?(?:\d+)(?:\.\d+)?)\)$/u.exec(normalized);
    if (m) {
      const min = parseNumberLiteral(m[1] ?? "");
      const ratio = parseNumberLiteral(m[2] ?? "");
      if (min !== null && ratio !== null && ratio >= 0 && ratio <= 1) {
        return {
          replacement: `widthConstraints.minViewportPercent({ ratio: ${String(ratio)}, min: ${String(min)} })`,
          imports: ["widthConstraints"],
          note: null,
        };
      }
    }
  }

  // clamp(MIN, viewport.w - MINUS, MAX) / clamp(MIN, viewport.h - MINUS, MAX)
  {
    const m =
      /^clamp\((-?(?:\d+)(?:\.\d+)?),viewport\.(w|h)-(-?(?:\d+)(?:\.\d+)?),(-?(?:\d+)(?:\.\d+)?)\)$/u.exec(
        normalized,
      );
    if (m) {
      const min = parseNumberLiteral(m[1] ?? "");
      const axis = m[2];
      const minus = parseNumberLiteral(m[3] ?? "");
      const max = parseNumberLiteral(m[4] ?? "");
      if (min !== null && minus !== null && max !== null) {
        if (axis === "w") {
          return {
            replacement: `widthConstraints.clampedViewportMinus({ minus: ${String(minus)}, min: ${String(min)}, max: ${String(max)} })`,
            imports: ["widthConstraints"],
            note: null,
          };
        }
        return {
          replacement: `heightConstraints.clampedViewportMinus({ minus: ${String(minus)}, min: ${String(min)}, max: ${String(max)} })`,
          imports: ["heightConstraints"],
          note: null,
        };
      }
    }
  }

  // Common clamp argument order mistake (fix only with --fix-clamp-order):
  // clamp(viewport.w - MINUS, MIN, MAX) → widthConstraints.clampedViewportMinus({ minus, min, max })
  if (fixClampOrder) {
    const m =
      /^clamp\(viewport\.(w|h)-(-?(?:\d+)(?:\.\d+)?),(-?(?:\d+)(?:\.\d+)?),(-?(?:\d+)(?:\.\d+)?)\)$/u.exec(
        normalized,
      );
    if (m) {
      const axis = m[1];
      const minus = parseNumberLiteral(m[2] ?? "");
      const min = parseNumberLiteral(m[3] ?? "");
      const max = parseNumberLiteral(m[4] ?? "");
      if (minus !== null && min !== null && max !== null) {
        return axis === "w"
          ? {
              replacement: `widthConstraints.clampedViewportMinus({ minus: ${String(minus)}, min: ${String(min)}, max: ${String(max)} })`,
              imports: ["widthConstraints"],
              note: "Fixed common clamp argument-order mistake.",
            }
          : {
              replacement: `heightConstraints.clampedViewportMinus({ minus: ${String(minus)}, min: ${String(min)}, max: ${String(max)} })`,
              imports: ["heightConstraints"],
              note: "Fixed common clamp argument-order mistake.",
            };
      }
    }
  }

  return null;
}

function updateNamedImport(sourceText, moduleName, requiredImports, { removeExpr }) {
  if (requiredImports.length === 0 && !removeExpr) return { text: sourceText, changed: false };

  const importRegex = new RegExp(
    String.raw`(^\s*import\s*\{\s*([\s\S]*?)\s*\}\s*from\s*["']${moduleName.replace(
      /[-/\\^$*+?.()|[\]{}]/gu,
      "\\$&",
    )}["'];\s*$)`,
    "mu",
  );

  const match = importRegex.exec(sourceText);
  if (match === null) return { text: sourceText, changed: false, reason: "no_named_import" };

  const full = match[1] ?? "";
  const inner = match[2] ?? "";
  const parts = inner
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const existing = new Set(parts);
  for (const imp of requiredImports) {
    if (!existing.has(imp)) parts.push(imp);
  }

  if (removeExpr) {
    const filtered = parts.filter((p) => p !== "expr");
    parts.length = 0;
    parts.push(...filtered);
  }

  const rebuilt = `import { ${parts.join(", ")} } from "${moduleName}";`;
  if (rebuilt === full) return { text: sourceText, changed: false };
  return {
    text: sourceText.slice(0, match.index) + rebuilt + sourceText.slice(match.index + full.length),
    changed: true,
  };
}

function migrateFile(filePath, opts) {
  const original = readFileSync(filePath, "utf8");
  let text = original;

  const exprCallRegex = /\bexpr\s*\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\s*\)/gmu;

  let match;
  const replacements = [];
  const neededImports = new Set();
  const notes = [];

  match = exprCallRegex.exec(text);
  while (match !== null) {
    const full = match[0] ?? "";
    const rawSource = match[2] ?? "";
    const source = rawSource.replace(/\\n/gu, "\n").replace(/\\t/gu, "\t");
    const rep = replacementForExpr(source, opts);
    if (rep !== null) {
      replacements.push({
        start: match.index,
        end: match.index + full.length,
        replacement: rep.replacement,
      });
      for (const imp of rep.imports) neededImports.add(imp);
      if (rep.note) notes.push(rep.note);
    }
    match = exprCallRegex.exec(text);
  }

  if (replacements.length === 0) return { changed: false, notes: [], neededImports: [] };

  // Apply replacements from end to start to keep indices stable.
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    text = text.slice(0, r.start) + r.replacement + text.slice(r.end);
  }

  const removeExpr = !/\bexpr\s*\(/mu.test(text);
  const requiredImports = [...neededImports].sort();

  // Prefer core import; fall back to jsx import.
  let importRes = updateNamedImport(text, "@rezi-ui/core", requiredImports, { removeExpr });
  if (!importRes.changed && importRes.reason === "no_named_import") {
    importRes = updateNamedImport(text, "@rezi-ui/jsx", requiredImports, { removeExpr });
  }
  text = importRes.text;

  return {
    changed: text !== original,
    text,
    notes: Object.freeze(notes),
    neededImports: Object.freeze(requiredImports),
    importChanged: importRes.changed,
    importReason: importRes.reason ?? null,
    removeExpr,
  };
}

const { paths, write, fixClampOrder } = parseArgs(process.argv.slice(2));

let changedFiles = 0;
let suggestedFiles = 0;

for (const p of paths) {
  const dir = join(ROOT, p);
  const st = statSync(dir, { throwIfNoEntry: false });
  if (!st || !st.isDirectory()) {
    process.stderr.write(`migrate-constraints-to-helpers: skipping missing dir: ${p}\n`);
    continue;
  }

  const files = collectFilesRecursiveSorted(dir);
  for (const filePath of files) {
    const res = migrateFile(filePath, { fixClampOrder });
    if (!res.changed) continue;

    const rel = relative(ROOT, filePath);
    suggestedFiles++;
    process.stdout.write(
      `migrate-constraints-to-helpers: ${rel} (${res.neededImports.join(", ") || "no imports"})\n`,
    );
    for (const note of res.notes) process.stdout.write(`  note: ${note}\n`);

    if (!write) continue;
    if (res.importReason === "no_named_import") {
      process.stdout.write("  skipped write: unsupported import style\n");
      continue;
    }
    writeFileSync(filePath, res.text, "utf8");
    changedFiles++;
  }
}

if (suggestedFiles === 0) {
  process.stdout.write("migrate-constraints-to-helpers: no matches\n");
} else if (write) {
  process.stdout.write(`migrate-constraints-to-helpers: wrote ${String(changedFiles)} file(s)\n`);
} else {
  process.stdout.write("migrate-constraints-to-helpers: run with --write to apply edits\n");
}
