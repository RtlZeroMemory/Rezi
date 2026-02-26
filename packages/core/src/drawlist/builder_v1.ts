import { createDrawlistBuilderV6, type DrawlistBuilderV6Opts } from "./builder_v3.js";
import type { DrawlistBuilderV1 } from "./types.js";

export type DrawlistBuilderV1Opts = DrawlistBuilderV6Opts;

export function createDrawlistBuilderV1(opts: DrawlistBuilderV1Opts = {}): DrawlistBuilderV1 {
  return createDrawlistBuilderV6(opts);
}
