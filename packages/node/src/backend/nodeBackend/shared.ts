import type { DebugBackend, RuntimeBackend } from "@rezi-ui/core";

export type NodeBackendScreenConfig = Readonly<{
  /**
   * Terminal presentation mode:
   * - "alt" (default): full-screen rendering on the alternate screen buffer;
   *   the prior screen is restored on exit.
   * - "inline": render a bounded region of `inlineRows` rows on the primary
   *   screen at the current scroll position. Terminal scrollback stays
   *   visible above the region, the app's output scrolls naturally with the
   *   session, and the final frame remains in scrollback on exit with the
   *   shell prompt restored below it. Fits status UIs, progress displays,
   *   REPLs, and agent-style CLIs.
   *
   * In inline mode the app's layout viewport is `inlineRows` tall (clamped
   * to the live terminal height) and resize events report that viewport.
   * Protocol images (kitty/sixel/iTerm2) fall back to sub-cell rendering.
   */
  mode?: "alt" | "inline";
  /**
   * Inline viewport height in rows (1..1024). Required when `mode` is
   * "inline"; rejected otherwise.
   */
  inlineRows?: number;
}>;

export type NodeBackendConfig = Readonly<{
  /**
   * Runtime execution mode:
   * - "auto": pick inline for very low fps caps (<=30); otherwise prefer worker
   *   and fall back to inline when no TTY/native shim is available
   * - "worker": worker-thread engine ownership
   * - "inline": single-thread inline backend (no worker-hop transport)
   */
  executionMode?: "auto" | "worker" | "inline";
  /**
   * @deprecated Prefer createNodeApp({ config: { fpsCap } }) so app/core and backend
   * remain aligned by construction.
   */
  fpsCap?: number;
  /**
   * @deprecated Prefer createNodeApp({ config: { maxEventBytes } }) so app/core and backend
   * remain aligned by construction.
   */
  maxEventBytes?: number;
  /**
   * Frame transport mode:
   * - "auto": prefer SAB mailbox transport when available, fallback to transfer.
   * - "transfer": always use transferable ArrayBuffer path.
   * - "sab": require SAB mailbox path when available, fallback to transfer when unavailable.
   */
  frameTransport?: "auto" | "transfer" | "sab";
  /** SAB mailbox slot count (default: 8). */
  frameSabSlotCount?: number;
  /** SAB mailbox bytes per slot (default: 1 MiB). */
  frameSabSlotBytes?: number;
  /**
   * Screen presentation mode (alt-screen vs inline). Unrelated to
   * `executionMode: "inline"`, which selects in-process engine ownership;
   * the two options compose freely.
   */
  screen?: NodeBackendScreenConfig;
  /**
   * Extra native `engine_create` configuration passed through to the addon (e.g. `limits`).
   * Keys are forwarded as-is (camelCase or snake_case accepted by the native parser).
   * The high-level `screen` option takes precedence over `plat.screenMode` /
   * `inlineRows` keys supplied here.
   */
  nativeConfig?: Readonly<Record<string, unknown>>;
  /**
   * Emoji width policy used to keep core layout measurement and native rendering aligned.
   * - "auto": use native/env overrides; optional probe when `ZRUI_EMOJI_WIDTH_PROBE=1`
   *   then fallback to deterministic "wide"
   * - "wide": emoji clusters consume 2 cells
   * - "narrow": emoji clusters consume 1 cell
   *
   * This sets core text measurement policy and native `widthPolicy` together.
   */
  emojiWidthPolicy?: "auto" | "wide" | "narrow";
}>;

export type NodeBackendInternalOpts = Readonly<{
  config?: NodeBackendConfig;
  nativeShimModule?: string;
}>;

export type NodeBackendPerfSnapshot = Readonly<{
  phases: Readonly<
    Record<
      string,
      {
        count: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
        max: number;
        worst10: readonly number[];
      }
    >
  >;
}>;

export type NodeBackendPerf = Readonly<{
  perfSnapshot: () => Promise<NodeBackendPerfSnapshot>;
}>;

export type NodeBackend = RuntimeBackend & Readonly<{ debug: DebugBackend; perf: NodeBackendPerf }>;

export type NodeBackendExecutionModeSelectionInput = Readonly<{
  requestedExecutionMode: "auto" | "worker" | "inline";
  fpsCap: number;
  nativeShimModule?: string;
  hasAnyTty: boolean;
}>;

export type NodeBackendExecutionModeSelection = Readonly<{
  resolvedExecutionMode: "worker" | "inline";
  selectedExecutionMode: "worker" | "inline";
  fallbackReason: string | null;
}>;

export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}>;

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = (err: unknown) => rej(err instanceof Error ? err : new Error(String(err)));
  });
  return { promise, resolve, reject };
}

export function safeErr(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
