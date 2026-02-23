import { ZR_DRAWLIST_VERSION_V1 } from "../abi.js";
import type { DrawlistBuildResult, DrawlistBuilderV1 } from "./types.js";
import {
  DrawlistBuilderLegacyBase,
  type DrawlistBuilderBaseOpts,
} from "./builderBase.js";

export type DrawlistBuilderV1Opts = DrawlistBuilderBaseOpts;

export function createDrawlistBuilderV1(opts: DrawlistBuilderV1Opts = {}): DrawlistBuilderV1 {
  return new DrawlistBuilderV1Impl(opts);
}

class DrawlistBuilderV1Impl extends DrawlistBuilderLegacyBase implements DrawlistBuilderV1 {
  constructor(opts: DrawlistBuilderV1Opts) {
    super(opts, "DrawlistBuilderV1");
  }

  build(): DrawlistBuildResult {
    return this.buildWithVersion(ZR_DRAWLIST_VERSION_V1);
  }
}
