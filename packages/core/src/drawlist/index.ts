/**
 * packages/core/src/drawlist/index.ts — ZRDL drawlist module public API.
 *
 * Why: Re-exports the drawlist builder factory and types for external use.
 * The drawlist module produces ZRDL binary format that the C engine executes
 * to render terminal UI.
 *
 * @see docs/protocol/zrdl.md
 */

export { createDrawlistBuilderV1, type DrawlistBuilderV1Opts } from "./builder_v1.js";
export { createDrawlistBuilderV2, type DrawlistBuilderV2Opts } from "./builder_v2.js";
export { createDrawlistBuilderV3, type DrawlistBuilderV3Opts } from "./builder_v3.js";

export type {
  DrawlistCanvasBlitter,
  CursorState,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  DrawlistBuildError,
  DrawlistBuildErrorCode,
  DrawlistBuildResult,
  DrawlistBuilderV1,
  DrawlistBuilderV2,
  DrawlistBuilderV3,
} from "./types.js";
