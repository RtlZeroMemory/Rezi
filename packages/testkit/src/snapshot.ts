import { AssertionError } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SnapshotMatchOptions = Readonly<{
  /** Explicit snapshot file path. Defaults to <caller-dir>/__snapshots__/<name>.txt */
  file?: string;
  /** Force write/update regardless of env. */
  update?: boolean;
  /** Base cwd for relative `file` values. */
  cwd?: string;
}>;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function canonicalize(text: string): string {
  return normalizeNewlines(text).replace(/\n$/u, "");
}

function shouldUpdateSnapshot(opts: SnapshotMatchOptions | undefined): boolean {
  if (opts?.update === true) return true;
  const env = (process.env as NodeJS.ProcessEnv & { UPDATE_SNAPSHOTS?: string }).UPDATE_SNAPSHOTS;
  if (!env) return false;
  const normalized = env.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sanitizeSnapshotName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("matchesSnapshot: snapshot name must not be empty");
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error(`matchesSnapshot: invalid snapshot name "${name}"`);
  }
  return trimmed;
}

function parseStackFramePath(line: string): string | null {
  const trimmed = line.trim();
  const fromParen = trimmed.match(/\((.+):\d+:\d+\)$/u);
  const fromBare = trimmed.match(/at (.+):\d+:\d+$/u);
  const raw = fromParen?.[1] ?? fromBare?.[1];
  if (!raw) return null;
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function isInternalHelperFrame(framePath: string): boolean {
  const base = path.basename(framePath);
  return /^(?:nodeTest|snapshot)\.(?:[cm]?js|[cm]?ts)$/u.test(base);
}

function resolveCallerFile(): string | null {
  const stack = new Error().stack;
  if (!stack) return null;

  const lines = stack.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const framePath = parseStackFramePath(line);
    if (!framePath) continue;
    if (framePath.startsWith("node:")) continue;
    if (isInternalHelperFrame(framePath)) continue;
    return framePath;
  }
  return null;
}

function mapDistFileToSource(filePath: string): string {
  const normalized = path.normalize(filePath);
  const marker = `${path.sep}dist${path.sep}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return normalized;

  const before = normalized.slice(0, markerIndex);
  const after = normalized.slice(markerIndex + marker.length);
  const sourceLike = `${before}${path.sep}src${path.sep}${after}`;
  const sourceTs = sourceLike.replace(/\.(?:c|m)?js$/u, ".ts");
  if (existsSync(sourceTs)) return sourceTs;
  if (existsSync(sourceLike)) return sourceLike;
  return normalized;
}

function resolveSnapshotFile(name: string, opts: SnapshotMatchOptions | undefined): string {
  const cwd = opts?.cwd ?? process.cwd();
  if (opts?.file) {
    return path.resolve(cwd, opts.file);
  }

  const caller = resolveCallerFile();
  if (!caller) {
    throw new Error('matchesSnapshot: unable to resolve caller file (pass { file: "..." })');
  }
  const sourceCaller = mapDistFileToSource(caller);
  return path.join(
    path.dirname(sourceCaller),
    "__snapshots__",
    `${sanitizeSnapshotName(name)}.txt`,
  );
}

function buildMismatchMessage(snapshotFile: string, expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  let lineNo = 1;
  for (let i = 0; i < maxLines; i++) {
    if ((expectedLines[i] ?? "") !== (actualLines[i] ?? "")) {
      lineNo = i + 1;
      break;
    }
  }

  const expectedLine = expectedLines[lineNo - 1] ?? "<EOF>";
  const actualLine = actualLines[lineNo - 1] ?? "<EOF>";
  return [
    `matchesSnapshot: snapshot mismatch at ${snapshotFile}:${String(lineNo)}`,
    `expected: ${expectedLine}`,
    `actual:   ${actualLine}`,
    "",
    "Set UPDATE_SNAPSHOTS=1 to update snapshots.",
  ].join("\n");
}

export function matchesSnapshot(
  actualValue: string,
  snapshotName: string,
  opts: SnapshotMatchOptions = {},
): void {
  const snapshotFile = resolveSnapshotFile(snapshotName, opts);
  const actual = canonicalize(actualValue);
  const update = shouldUpdateSnapshot(opts);

  if (update) {
    mkdirSync(path.dirname(snapshotFile), { recursive: true });
    const output = actual.endsWith("\n") ? actual : `${actual}\n`;
    writeFileSync(snapshotFile, output, "utf8");
    return;
  }

  if (!existsSync(snapshotFile)) {
    throw new AssertionError({
      message: [
        `matchesSnapshot: missing snapshot ${snapshotFile}`,
        "Set UPDATE_SNAPSHOTS=1 to create it.",
      ].join("\n"),
    });
  }

  const expectedRaw = readFileSync(snapshotFile, "utf8");
  const expected = canonicalize(expectedRaw);
  if (expected === actual) return;

  throw new AssertionError({
    message: buildMismatchMessage(snapshotFile, expected, actual),
  });
}
