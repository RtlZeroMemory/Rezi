import { ZR_DRAWLIST_VERSION_V2 } from "../abi.js";
import {
  type DrawlistBuilderBaseOpts,
  DrawlistBuilderLegacyBase,
  OP_SET_CURSOR,
} from "./builderBase.js";
import type { CursorState, DrawlistBuildResult, DrawlistBuilderV2 } from "./types.js";

export type DrawlistBuilderV2Opts = DrawlistBuilderBaseOpts;

export function createDrawlistBuilderV2(opts: DrawlistBuilderV2Opts = {}): DrawlistBuilderV2 {
  return new DrawlistBuilderV2Impl(opts);
}

class DrawlistBuilderV2Impl extends DrawlistBuilderLegacyBase implements DrawlistBuilderV2 {
  constructor(opts: DrawlistBuilderV2Opts) {
    super(opts, "DrawlistBuilderV2");
  }

  setCursor(state: CursorState): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("setCursor", "x", state.x) : state.x | 0;
    const yi = this.validateParams ? this.requireI32("setCursor", "y", state.y) : state.y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    const shape = state.shape & 0xff;
    if (this.validateParams && (shape < 0 || shape > 2)) {
      this.fail("ZRDL_BAD_PARAMS", `setCursor: shape must be 0, 1, or 2 (got ${shape})`);
      return;
    }

    this.writeCommandHeader(OP_SET_CURSOR, 20);
    this.writeI32(xi);
    this.writeI32(yi);
    this.writeU8(shape);
    this.writeU8(state.visible ? 1 : 0);
    this.writeU8(state.blink ? 1 : 0);
    this.writeU8(0);
    this.padCmdTo4();

    this.maybeFailTooLargeAfterWrite();
  }

  hideCursor(): void {
    this.setCursor({ x: -1, y: -1, shape: 0, visible: false, blink: false });
  }

  buildInto(dst: Uint8Array): DrawlistBuildResult {
    return this.buildIntoWithVersion(ZR_DRAWLIST_VERSION_V2, dst);
  }

  build(): DrawlistBuildResult {
    return this.buildWithVersion(ZR_DRAWLIST_VERSION_V2);
  }

  protected override expectedExtraCmdSize(opcode: number): number {
    if (opcode === OP_SET_CURSOR) {
      return 8 + 12;
    }
    return -1;
  }
}
