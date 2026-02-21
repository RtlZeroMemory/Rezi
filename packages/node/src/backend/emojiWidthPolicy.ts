import { ZrUiError, setTextMeasureEmojiPolicy } from "@rezi-ui/core";

export type BackendEmojiWidthPolicy = "auto" | "wide" | "narrow";
export type ResolvedEmojiWidthPolicy = "wide" | "narrow";

const NATIVE_WIDTH_POLICY_NARROW = 0 as const;
const NATIVE_WIDTH_POLICY_WIDE = 1 as const;
const PROBE_TIMEOUT_MS_DEFAULT = 80;
const PROBE_GLYPHS = Object.freeze(["😀", "🚀", "🧪"]);
const ENV_EMOJI_WIDTH_POLICY = "ZRUI_EMOJI_WIDTH_POLICY" as const;
const ENV_EMOJI_WIDTH_PROBE = "ZRUI_EMOJI_WIDTH_PROBE" as const;

type Cpr = Readonly<{ row: number; col: number }>;
let cachedProbePolicy: ResolvedEmojiWidthPolicy | null = null;
let cachedProbePromise: Promise<ResolvedEmojiWidthPolicy | null> | null = null;

function normalizePolicy(raw: unknown): BackendEmojiWidthPolicy | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "auto") return "auto";
  if (value === "wide") return "wide";
  if (value === "narrow") return "narrow";
  return null;
}

function nativeWidthPolicyToResolved(value: 0 | 1): ResolvedEmojiWidthPolicy {
  return value === NATIVE_WIDTH_POLICY_NARROW ? "narrow" : "wide";
}

function resolvedToNativeWidthPolicy(value: ResolvedEmojiWidthPolicy): 0 | 1 {
  return value === "narrow" ? NATIVE_WIDTH_POLICY_NARROW : NATIVE_WIDTH_POLICY_WIDE;
}

function readNativeWidthPolicyValues(
  cfg: Readonly<Record<string, unknown>>,
): Readonly<{ camel: 0 | 1 | null; snake: 0 | 1 | null }> {
  const parse = (value: unknown, key: string): 0 | 1 | null => {
    if (value === undefined) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
      throw new ZrUiError(
        "ZRUI_INVALID_PROPS",
        `createNodeBackend config mismatch: nativeConfig.${key} must be 0 (narrow) or 1 (wide).`,
      );
    }
    return value;
  };

  const record = cfg as Readonly<{ widthPolicy?: unknown; width_policy?: unknown }>;
  return {
    camel: parse(record.widthPolicy, "widthPolicy"),
    snake: parse(record.width_policy, "width_policy"),
  };
}

function readNativeWidthPolicyOverride(
  cfg: Readonly<Record<string, unknown>>,
): ResolvedEmojiWidthPolicy | null {
  const values = readNativeWidthPolicyValues(cfg);
  if (values.camel !== null && values.snake !== null && values.camel !== values.snake) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `createNodeBackend config mismatch: nativeConfig.widthPolicy=${String(values.camel)} must match nativeConfig.width_policy=${String(values.snake)}.`,
    );
  }
  const nativeValue = values.camel ?? values.snake;
  if (nativeValue === null) return null;
  return nativeWidthPolicyToResolved(nativeValue);
}

function pushParsedCpr(buffer: string, out: Cpr[]): string {
  let pending = buffer;
  while (pending.length > 0) {
    const esc = pending.indexOf("\x1b[");
    if (esc < 0) {
      if (pending.length > 128) pending = pending.slice(-128);
      break;
    }
    if (esc > 0) {
      pending = pending.slice(esc);
    }

    const end = pending.indexOf("R", 2);
    if (end < 0) break;
    const seq = pending.slice(0, end + 1);
    pending = pending.slice(end + 1);

    const body = seq.slice(2, seq.length - 1);
    const sep = body.indexOf(";");
    if (sep <= 0 || sep >= body.length - 1) continue;
    const rowText = body.slice(0, sep);
    const colText = body.slice(sep + 1);
    if (!/^\d+$/.test(rowText) || !/^\d+$/.test(colText)) continue;
    const row = Number.parseInt(rowText, 10);
    const col = Number.parseInt(colText, 10);
    if (Number.isFinite(row) && Number.isFinite(col)) {
      out.push({ row, col });
    }
  }
  return pending;
}

async function probeGlyphWidthViaCpr(glyph: string, timeoutMs: number): Promise<1 | 2 | null> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) return null;
  if (typeof stdin.setRawMode !== "function") return null;

  const wasRaw = stdin.isRaw === true;
  let pending = "";
  const cprs: Cpr[] = [];

  const onData = (chunk: string | Buffer): void => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    pending = pushParsedCpr(pending + text, cprs);
  };

  let timeout: NodeJS.Timeout | null = null;
  try {
    stdin.on("data", onData);
    stdin.resume();
    if (!wasRaw) stdin.setRawMode(true);

    // Save cursor, move to a stable column, query CPR, print glyph, query CPR again, restore cursor.
    await new Promise<void>((resolve, reject) => {
      stdout.write(`\x1b[s\x1b[999;1H\x1b[6n${glyph}\x1b[6n\x1b[u`, (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const done = (): void => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        resolve();
      };

      timeout = setTimeout(done, timeoutMs);
      const poll = (): void => {
        if (cprs.length >= 2) {
          done();
          return;
        }
        setTimeout(poll, 2);
      };
      poll();
    });
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
    stdin.off("data", onData);
    if (!wasRaw) {
      try {
        stdin.setRawMode(false);
      } catch {
        // no-op
      }
    }
  }

  const a = cprs[0];
  const b = cprs[1];
  if (!a || !b) return null;
  if (b.row !== a.row) return null;
  const delta = b.col - a.col;
  if (delta === 1 || delta === 2) return delta;
  return null;
}

async function probeTerminalEmojiWidthPolicy(
  timeoutMs: number,
): Promise<ResolvedEmojiWidthPolicy | null> {
  const widths: Array<1 | 2> = [];
  for (const glyph of PROBE_GLYPHS) {
    const width = await probeGlyphWidthViaCpr(glyph, timeoutMs);
    if (width !== null) widths.push(width);
  }
  if (widths.length === 0) return null;
  if (widths.includes(1)) return "narrow";
  return "wide";
}

async function probeTerminalEmojiWidthPolicyCached(
  timeoutMs: number,
): Promise<ResolvedEmojiWidthPolicy | null> {
  if (cachedProbePolicy !== null) return cachedProbePolicy;
  if (cachedProbePromise) return cachedProbePromise;
  cachedProbePromise = probeTerminalEmojiWidthPolicy(timeoutMs)
    .then((probed) => {
      if (probed !== null) cachedProbePolicy = probed;
      return probed;
    })
    .finally(() => {
      cachedProbePromise = null;
    });
  return cachedProbePromise;
}

/**
 * Resolve backend emoji width policy and align core/native width models.
 *
 * Resolution order:
 * 1) explicit `requested` ("wide"/"narrow")
 * 2) explicit native override (`nativeConfig.widthPolicy|width_policy`)
 * 3) env override (`ZRUI_EMOJI_WIDTH_POLICY`)
 * 4) optional probe (CPR-based) when `ZRUI_EMOJI_WIDTH_PROBE=1`
 * 5) deterministic default ("wide")
 */
export async function resolveBackendEmojiWidthPolicy(
  requested: BackendEmojiWidthPolicy | undefined,
  nativeConfig: Readonly<Record<string, unknown>>,
): Promise<ResolvedEmojiWidthPolicy> {
  const requestedPolicy: BackendEmojiWidthPolicy = requested ?? "auto";
  const nativeOverride = readNativeWidthPolicyOverride(nativeConfig);

  if (requestedPolicy === "narrow" || requestedPolicy === "wide") {
    if (nativeOverride !== null && nativeOverride !== requestedPolicy) {
      throw new ZrUiError(
        "ZRUI_INVALID_PROPS",
        `createNodeBackend config mismatch: emojiWidthPolicy=${requestedPolicy} must match nativeConfig.widthPolicy/width_policy=${nativeOverride === "narrow" ? 0 : 1}.`,
      );
    }
    return requestedPolicy;
  }

  if (nativeOverride !== null) return nativeOverride;

  const envOverride = normalizePolicy(process.env[ENV_EMOJI_WIDTH_POLICY]);
  if (envOverride === "wide" || envOverride === "narrow") return envOverride;

  /*
    CPR probing is opt-in because it temporarily consumes stdin bytes while
    collecting CPR responses, which can race startup-time key streams.
  */
  const probeEnabled = process.env[ENV_EMOJI_WIDTH_PROBE] === "1";
  if (probeEnabled) {
    const probed = await probeTerminalEmojiWidthPolicyCached(PROBE_TIMEOUT_MS_DEFAULT);
    if (probed !== null) return probed;
  }

  return "wide";
}

export function applyEmojiWidthPolicy(policy: ResolvedEmojiWidthPolicy): 0 | 1 {
  setTextMeasureEmojiPolicy(policy);
  return resolvedToNativeWidthPolicy(policy);
}
