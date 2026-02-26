import { type DrawlistBuilderV1Opts, createDrawlistBuilderV1 } from "./builder_v3.js";
import type { DrawlistBuilderV3 } from "./types.js";

export type DrawlistBuilderV2Opts = DrawlistBuilderV1Opts;

export function createDrawlistBuilderV2(opts: DrawlistBuilderV2Opts = {}): DrawlistBuilderV3 {
  return createDrawlistBuilderV1(opts);
}
