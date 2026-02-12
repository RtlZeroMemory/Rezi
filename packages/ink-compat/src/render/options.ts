import process from "node:process";
import { Stream } from "node:stream";
import type { RenderOptions } from "../types.js";

/**
 * Ink-compatible normalization for `render(node, optionsOrStdout)`.
 *
 * If the second arg is a Stream instance, treat it as a `{stdout}` shorthand
 * and set `stdin` to `process.stdin` (matching Ink v6.7.0 behavior).
 */
export function normalizeRenderOptions(options?: RenderOptions | NodeJS.WriteStream): RenderOptions {
  if (!options) return {};
  if (options instanceof Stream) {
    return { stdout: options, stdin: process.stdin };
  }
  return options;
}
