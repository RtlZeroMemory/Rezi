import {
  type Dirent,
  type FSWatcher,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  watch,
} from "node:fs";
import { cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { App, RouteDefinition, ViewFn } from "@rezi-ui/core";

const DEFAULT_DEBOUNCE_MS = 40;
const WATCH_REFRESH_DELAY_MS = 50;
const PRESERVED_SNAPSHOT_REVISIONS = 2;
const TRACKED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
]);
const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  "node_modules",
]);

export type HotStateReloadErrorContext = Readonly<{
  phase: "reload" | "watch";
  changedPath?: string;
}>;

export type HotStateReloadLogEvent = Readonly<{
  level: "info" | "warn" | "error";
  message: string;
  changedPath?: string;
}>;

export type HotStateReloadController = Readonly<{
  start: () => Promise<void>;
  reloadNow: () => Promise<boolean>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}>;

type HotStateReloadBaseOptions = Readonly<{
  /**
   * Root copied into a versioned snapshot before each reload.
   * Set this to your app `src/` directory so transitive imports are refreshed.
   * Defaults to `dirname(viewModule | routesModule)`.
   */
  moduleRoot?: string | URL;
  /**
   * Additional files/directories to watch for changes.
   * `moduleRoot` is always watched.
   */
  watchPaths?: readonly (string | URL)[];
  /**
   * Debounce window for rapid save bursts.
   */
  debounceMs?: number;
  onError?: (error: unknown, context: HotStateReloadErrorContext) => void;
  log?: (event: HotStateReloadLogEvent) => void;
}>;

export type HotStateReloadViewOptions<S> = HotStateReloadBaseOptions &
  Readonly<{
    app: Pick<App<S>, "replaceView">;
    /**
     * Absolute/relative path (or file URL) to the module that exports the view function.
     */
    viewModule: string | URL;
    /**
     * Resolve a ViewFn from the imported module namespace.
     * Defaults to: named `view` export, then default export.
     */
    resolveView?: (moduleNs: unknown) => ViewFn<S>;
    onReload?: (viewFn: ViewFn<S>) => void;
  }>;

export type HotStateReloadRoutesOptions<S> = HotStateReloadBaseOptions &
  Readonly<{
    app: Pick<App<S>, "replaceRoutes">;
    /**
     * Absolute/relative path (or file URL) to the module that exports route definitions.
     */
    routesModule: string | URL;
    /**
     * Resolve route definitions from the imported module namespace.
     * Defaults to: named `routes` export, then default export.
     */
    resolveRoutes?: (moduleNs: unknown) => readonly RouteDefinition<S>[];
    onReload?: (routes: readonly RouteDefinition<S>[]) => void;
  }>;

export type HotStateReloadOptions<S> =
  | HotStateReloadViewOptions<S>
  | HotStateReloadRoutesOptions<S>;

function isViewReloadOptions<S>(
  opts: HotStateReloadOptions<S>,
): opts is HotStateReloadViewOptions<S> {
  return "viewModule" in opts;
}

function isRoutesReloadOptions<S>(
  opts: HotStateReloadOptions<S>,
): opts is HotStateReloadRoutesOptions<S> {
  return "routesModule" in opts;
}

function toAbsolutePath(input: string | URL, label: string): string {
  if (input instanceof URL) {
    if (input.protocol !== "file:") {
      throw new Error(`${label} must be a file URL when URL is provided`);
    }
    return resolve(fileURLToPath(input));
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string or file URL`);
  }

  return isAbsolute(input) ? resolve(input) : resolve(process.cwd(), input);
}

function ensurePositiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function defaultResolveView<S>(moduleNs: unknown): ViewFn<S> {
  if (!isRecord(moduleNs)) {
    throw new Error("HSR module must export a named `view` function or a default function");
  }
  const moduleExports = moduleNs as { view?: unknown; default?: unknown };
  const named = moduleExports.view;
  if (typeof named === "function") return named as ViewFn<S>;
  const fallback = moduleExports.default;
  if (typeof fallback === "function") return fallback as ViewFn<S>;
  throw new Error("HSR module must export a named `view` function or a default function");
}

function coerceRoutesExport<S>(value: unknown): readonly RouteDefinition<S>[] {
  if (!Array.isArray(value)) {
    throw new Error("HSR routes module must export a named `routes` array or a default array");
  }
  return value as readonly RouteDefinition<S>[];
}

function defaultResolveRoutes<S>(moduleNs: unknown): readonly RouteDefinition<S>[] {
  if (!isRecord(moduleNs)) {
    throw new Error("HSR routes module must export a named `routes` array or a default array");
  }
  const moduleExports = moduleNs as { routes?: unknown; default?: unknown };
  if (moduleExports.routes !== undefined) {
    return coerceRoutesExport<S>(moduleExports.routes);
  }
  if (moduleExports.default !== undefined) {
    return coerceRoutesExport<S>(moduleExports.default);
  }
  throw new Error("HSR routes module must export a named `routes` array or a default array");
}

function containsIgnoredDir(absPath: string): boolean {
  const normalized = absPath.replace(/\\/g, "/");
  for (const part of normalized.split("/")) {
    if (IGNORED_DIR_NAMES.has(part)) return true;
  }
  return false;
}

function shouldTrackPath(absPath: string): boolean {
  if (containsIgnoredDir(absPath)) return false;
  const ext = extname(absPath).toLowerCase();
  return TRACKED_EXTENSIONS.has(ext);
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeReadDir(dir: string): readonly Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return Object.freeze([]);
  }
}

function collectWatchDirectories(root: string): readonly string[] {
  const out: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    out.push(current);
    const entries = safeReadDir(current);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      stack.push(join(current, entry.name));
    }
  }

  return Object.freeze(out);
}

function makeLogSink(
  log: ((event: HotStateReloadLogEvent) => void) | undefined,
): (event: HotStateReloadLogEvent) => void {
  if (typeof log === "function") return log;
  return () => {};
}

function toWatchDirectory(pathLike: string): string {
  try {
    return statSync(pathLike).isDirectory() ? pathLike : dirname(pathLike);
  } catch {
    return dirname(pathLike);
  }
}

function findNearestNodeModules(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, "node_modules");
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Keep walking up.
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function createReloadAdapter<S>(opts: HotStateReloadOptions<S>): Readonly<{
  entryModule: string | URL;
  targetLabel: "view" | "routes";
  applyReload: (moduleNs: unknown) => void;
}> {
  if (isViewReloadOptions(opts)) {
    const resolveView = opts.resolveView ?? defaultResolveView<S>;
    return Object.freeze({
      entryModule: opts.viewModule,
      targetLabel: "view" as const,
      applyReload: (moduleNs: unknown) => {
        const nextView = resolveView(moduleNs);
        opts.app.replaceView(nextView);
        opts.onReload?.(nextView);
      },
    });
  }

  if (isRoutesReloadOptions(opts)) {
    const resolveRoutes = opts.resolveRoutes ?? defaultResolveRoutes<S>;
    return Object.freeze({
      entryModule: opts.routesModule,
      targetLabel: "routes" as const,
      applyReload: (moduleNs: unknown) => {
        const nextRoutes = resolveRoutes(moduleNs);
        opts.app.replaceRoutes(nextRoutes);
        opts.onReload?.(nextRoutes);
      },
    });
  }

  throw new Error("HSR options must provide either `viewModule` or `routesModule`");
}

export function createHotStateReload<S>(opts: HotStateReloadOptions<S>): HotStateReloadController {
  const reloadAdapter = createReloadAdapter(opts);
  const entryLabel = isViewReloadOptions(opts) ? "viewModule" : "routesModule";
  const entryPath = toAbsolutePath(reloadAdapter.entryModule, entryLabel);
  const moduleRoot = toAbsolutePath(opts.moduleRoot ?? dirname(entryPath), "moduleRoot");
  if (!isWithinOrEqual(moduleRoot, entryPath)) {
    throw new Error(`${entryLabel} must be inside moduleRoot`);
  }

  const watchTargets = new Set<string>([moduleRoot]);
  for (const pathInput of opts.watchPaths ?? []) {
    watchTargets.add(toAbsolutePath(pathInput, "watchPaths[]"));
  }
  const debounceMs = ensurePositiveInt("debounceMs", opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  const log = makeLogSink(opts.log);
  const onError = opts.onError;
  const targetLabel = reloadAdapter.targetLabel;
  const hostNodeModulesPath = findNearestNodeModules(moduleRoot);

  let sessionRoot: string | null = null;
  const watchers = new Map<string, FSWatcher>();
  let running = false;
  let revision = 0;
  let pendingChangePath: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let reloadChain: Promise<boolean> = Promise.resolve(false);

  function getSessionRoot(): string {
    if (sessionRoot === null) {
      sessionRoot = mkdtempSync(join(tmpdir(), "rezi-hsr-"));
    }
    return sessionRoot;
  }

  function cleanupSessionRoot(): void {
    if (sessionRoot === null) return;
    rmSync(sessionRoot, { recursive: true, force: true });
    sessionRoot = null;
  }

  function clearDebounce(): void {
    if (debounceTimer === null) return;
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function clearRefresh(): void {
    if (refreshTimer === null) return;
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function closeAllWatchers(): void {
    for (const watcher of watchers.values()) {
      try {
        watcher.close();
      } catch {
        // ignore watcher close races
      }
    }
    watchers.clear();
  }

  function emitError(error: unknown, context: HotStateReloadErrorContext): void {
    onError?.(error, context);
  }

  function copyFilter(pathToCheck: string): boolean {
    return !containsIgnoredDir(pathToCheck);
  }

  async function importLatestModule(): Promise<unknown> {
    const activeSessionRoot = getSessionRoot();
    revision++;
    const revisionDir = join(activeSessionRoot, `rev-${String(revision)}`);
    await cp(moduleRoot, revisionDir, { recursive: true, filter: copyFilter });
    if (hostNodeModulesPath) {
      const snapshotNodeModules = join(revisionDir, "node_modules");
      try {
        symlinkSync(hostNodeModulesPath, snapshotNodeModules, "junction");
      } catch {
        // Best-effort: if symlink creation fails, reload may still work for relative imports.
      }
    }

    const relEntry = relative(moduleRoot, entryPath);
    const snapshotEntry = join(revisionDir, relEntry);
    const moduleUrl = `${pathToFileURL(snapshotEntry).href}?rezi_hsr_rev=${String(revision)}`;
    const moduleNs = await import(moduleUrl);

    const staleRevision = revision - PRESERVED_SNAPSHOT_REVISIONS;
    if (staleRevision > 0) {
      const staleDir = join(activeSessionRoot, `rev-${String(staleRevision)}`);
      rmSync(staleDir, { recursive: true, force: true });
    }

    return moduleNs;
  }

  function queueReload(phase: "manual" | "watch"): Promise<boolean> {
    const changedPath = pendingChangePath;
    pendingChangePath = undefined;
    const op = reloadChain.then(async () => {
      if (!running) return false;
      try {
        const moduleNs = await importLatestModule();
        if (!running) return false;
        reloadAdapter.applyReload(moduleNs);
        log({
          level: "info",
          message:
            phase === "manual"
              ? `HSR manual ${targetLabel} reload applied`
              : `HSR file change ${targetLabel} reload applied`,
          ...(changedPath === undefined ? {} : { changedPath }),
        });
        return true;
      } catch (error: unknown) {
        emitError(error, { phase: "reload", ...(changedPath ? { changedPath } : {}) });
        log({
          level: "error",
          message: `HSR reload failed; keeping previous ${targetLabel}`,
          ...(changedPath === undefined ? {} : { changedPath }),
        });
        return false;
      }
    });
    reloadChain = op.catch(() => false);
    return op;
  }

  function scheduleWatchRefresh(): void {
    if (!running || refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshWatchers();
    }, WATCH_REFRESH_DELAY_MS);
  }

  function shouldReloadForPath(absPath: string): boolean {
    if (shouldTrackPath(absPath)) return true;
    if (isWithinOrEqual(moduleRoot, absPath)) return true;
    for (const target of watchTargets) {
      if (isWithinOrEqual(target, absPath)) return true;
    }
    return false;
  }

  function onWatchEvent(
    watchDir: string,
    eventType: string,
    filename: string | Buffer | null,
  ): void {
    if (!running) return;
    const changedName =
      filename === null || filename === undefined
        ? null
        : typeof filename === "string"
          ? filename
          : filename.toString("utf8");
    const resolvedPath = changedName === null ? watchDir : resolve(watchDir, changedName);

    if (!shouldReloadForPath(resolvedPath)) return;
    pendingChangePath = resolvedPath;
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void queueReload("watch");
    }, debounceMs);

    if (eventType === "rename") {
      scheduleWatchRefresh();
    }
  }

  function refreshWatchers(): void {
    if (!running) return;
    const desiredDirs = new Set<string>();

    for (const target of watchTargets) {
      const root = toWatchDirectory(target);
      if (containsIgnoredDir(root)) continue;
      const dirs = collectWatchDirectories(root);
      for (const dir of dirs) {
        desiredDirs.add(dir);
      }
    }

    for (const watchedDir of watchers.keys()) {
      if (desiredDirs.has(watchedDir)) continue;
      const watcher = watchers.get(watchedDir);
      watchers.delete(watchedDir);
      try {
        watcher?.close();
      } catch {
        // ignore watcher close races
      }
    }

    for (const dir of desiredDirs) {
      if (watchers.has(dir)) continue;
      try {
        const watcher = watch(dir, { persistent: true }, (eventType, filename) => {
          onWatchEvent(dir, eventType, filename ?? null);
        });
        watcher.on("error", (error: unknown) => {
          emitError(error, { phase: "watch", changedPath: dir });
          log({ level: "warn", message: "HSR watcher reported an error", changedPath: dir });
          scheduleWatchRefresh();
        });
        watchers.set(dir, watcher);
      } catch (error: unknown) {
        emitError(error, { phase: "watch", changedPath: dir });
        log({ level: "warn", message: "HSR failed to watch path", changedPath: dir });
      }
    }
  }

  async function start(): Promise<void> {
    if (running) return;
    running = true;
    refreshWatchers();
    log({ level: "info", message: "HSR watcher started" });
  }

  async function reloadNow(): Promise<boolean> {
    if (!running) return false;
    clearDebounce();
    return queueReload("manual");
  }

  async function stop(): Promise<void> {
    if (!running) {
      cleanupSessionRoot();
      return;
    }
    running = false;
    clearDebounce();
    clearRefresh();
    closeAllWatchers();
    try {
      await reloadChain;
    } catch {
      // ignore pending reload failures during shutdown
    }
    cleanupSessionRoot();
    log({ level: "info", message: "HSR watcher stopped" });
  }

  return Object.freeze({
    start,
    reloadNow,
    stop,
    isRunning: () => running,
  });
}
