import { createDrawlistBuilderV6, type DrawlistBuilderV6Opts } from "./builder_v3.js";
import type { DrawlistBuilderV2 } from "./types.js";

export type DrawlistBuilderV2Opts = DrawlistBuilderV6Opts;

export function createDrawlistBuilderV2(opts: DrawlistBuilderV2Opts = {}): DrawlistBuilderV2 {
  return createDrawlistBuilderV6(opts);
}
