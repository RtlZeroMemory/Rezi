import { assert, describe, test } from "@rezi-ui/testkit";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";

type JsonRecord = Readonly<Record<string, unknown>>;

function isObject(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walkFiles(root: string, shouldInclude: (fullPath: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = readdirSync(dir);
    entries.sort();
    for (const name of entries) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "dist" || name === ".git") continue;
        stack.push(full);
        continue;
      }
      if (shouldInclude(full)) out.push(full);
    }
  }
  out.sort();
  return out;
}

function readJson(path: string): JsonRecord {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed)) throw new Error(`Expected JSON object at ${path}`);
  return parsed;
}

function readDeps(pkg: JsonRecord): string[] {
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  const out: string[] = [];
  for (const sec of sections) {
    const v = pkg[sec];
    if (!isObject(v)) continue;
    for (const name of Object.keys(v)) out.push(name);
  }
  return out;
}

function hasForbiddenDependency(pkg: JsonRecord, name: string): boolean {
  return readDeps(pkg).includes(name);
}

function findForbiddenImports(fullPath: string, src: string): string[] {
  const found = new Set<string>();

  const checkModuleSpecifier = (specifier: string): void => {
    if (specifier === "ink") found.add("ink");
    if (specifier === "react-dom" || specifier === "react-dom/client") found.add("react-dom");
  };

  const ext = fullPath.split(".").pop();
  const scriptKind: ts.ScriptKind =
    ext === "tsx"
      ? ts.ScriptKind.TSX
      : ext === "ts"
        ? ts.ScriptKind.TS
        : ext === "jsx"
          ? ts.ScriptKind.JSX
          : ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(fullPath, src, ts.ScriptTarget.ES2022, true, scriptKind);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const ms = node.moduleSpecifier;
      if (ms && ts.isStringLiteral(ms)) checkModuleSpecifier(ms.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const mr = node.moduleReference;
      if (ts.isExternalModuleReference(mr) && ts.isStringLiteral(mr.expression)) {
        checkModuleSpecifier(mr.expression.text);
      }
    } else if (ts.isCallExpression(node)) {
      // require("x")
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        const arg0 = node.arguments[0];
        if (arg0 && ts.isStringLiteral(arg0)) checkModuleSpecifier(arg0.text);
      }

      // import("x")
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg0 = node.arguments[0];
        if (arg0 && ts.isStringLiteral(arg0)) checkModuleSpecifier(arg0.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (found.size === 0) return [];
  return [`${relative(process.cwd(), fullPath)}: ${[...found].sort().join(", ")}`];
}

describe("guardrails: no upstream ink / react-dom dependencies or imports", () => {
  test("repo does not depend on `ink` or `react-dom`", () => {
    const root = process.cwd();

    const pkgJsonFiles = walkFiles(root, (p) => p.endsWith("package.json"));
    const offendersPkg: string[] = [];
    for (const file of pkgJsonFiles) {
      const pkg = readJson(file);
      if (hasForbiddenDependency(pkg, "ink") || hasForbiddenDependency(pkg, "react-dom")) {
        offendersPkg.push(relative(root, file));
      }
    }

    const lock = readJson(join(root, "package-lock.json"));
    const lockPackages = lock["packages"];
    const hasInkInLock =
      (isObject(lockPackages) && Object.prototype.hasOwnProperty.call(lockPackages, "node_modules/ink")) ||
      (isObject(lock["dependencies"]) && Object.prototype.hasOwnProperty.call(lock["dependencies"], "ink"));

    const lines: string[] = [];
    if (offendersPkg.length > 0) {
      lines.push("Forbidden dependency found in:", ...offendersPkg.map((p) => `  - ${p}`));
    }
    if (hasInkInLock) {
      lines.push("Forbidden dependency found in `package-lock.json`: ink");
    }

    if (lines.length > 0) {
      assert.fail(lines.join("\n"));
    }
  });

  test('packages do not import from "ink" or "react-dom"', () => {
    const root = process.cwd();
    const scanRoots = [
      join(root, "packages", "ink-compat", "src"),
      join(root, "packages", "core", "src"),
      join(root, "packages", "node", "src"),
    ];

    const offenders: string[] = [];
    for (const dir of scanRoots) {
      const files = walkFiles(dir, (p) => /\.(cjs|mjs|js|ts|tsx)$/.test(p));
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        const bad = findForbiddenImports(file, src);
        offenders.push(...bad);
      }
    }

    if (offenders.length > 0) {
      assert.fail(`Forbidden import found:\n${offenders.map((s) => `  - ${s}`).join("\n")}`);
    }
  });
});
