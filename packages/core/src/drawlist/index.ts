/**
 * packages/core/src/drawlist/index.ts — ZRDL drawlist module public API.
 *
 * Why: Re-exports the drawlist builder factory and types for external use.
 * The drawlist module produces ZRDL binary format that the C engine executes
 * to render terminal UI.
 *
 * @see docs/protocol/zrdl.md
 */

export { createDrawlistBuilder, type DrawlistBuilderOpts } from "./builder.js";

export type {
  DrawlistCanvasBlitter,
  CursorState,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  DrawlistBuildError,
  DrawlistBuildErrorCode,
  DrawlistBuildResult,
  DrawlistBuildInto,
  DrawlistBuilder,
  DrawlistTextPerfCounters,
} from "./types.js";
