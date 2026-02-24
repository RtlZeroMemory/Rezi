/**
 * packages/core/src/app/rawRenderer.ts — Raw draw API renderer.
 *
 * Why: Handles the "draw mode" rendering path where users directly call
 * drawlist builder methods. Manages the render lifecycle (enter/exit hooks),
 * builds the drawlist, and submits it to the backend.
 *
 * This is an alternative to widget mode for low-level rendering needs.
 *
 * @see docs/guide/lifecycle-and-updates.md
 */

import type { RuntimeBackend } from "../backend.js";
import {
  type DrawlistBuilderV1,
  createDrawlistBuilderV2,
  createDrawlistBuilderV3,
} from "../drawlist/index.js";
import { perfMarkEnd, perfMarkStart } from "../perf/perf.js";
import type { DrawFn } from "./types.js";

/** Callbacks for render lifecycle tracking (used by app to set inRender flag). */
export type RawRendererHooks = Readonly<{
  enterRender: () => void;
  exitRender: () => void;
}>;

/**
 * Result of submitting a raw render frame.
 * On success, inFlight resolves when backend acknowledges the frame.
 */
export type RawRenderSubmitResult =
  | Readonly<{ ok: true; inFlight: Promise<void> }>
  | Readonly<{
      ok: false;
      code: "ZRUI_USER_CODE_THROW" | "ZRUI_DRAWLIST_BUILD_ERROR" | "ZRUI_BACKEND_ERROR";
      detail: string;
    }>;

/** Format thrown value for error message. */
function describeThrown(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  return String(v);
}

/**
 * Renderer for raw draw API mode.
 *
 * Executes user-provided draw function, builds drawlist, and submits to backend.
 * Catches exceptions from user code and reports as structured errors.
 */
export class RawRenderer {
  private readonly backend: RuntimeBackend;
  private readonly builder: DrawlistBuilderV1;

  constructor(
    opts: Readonly<{
      backend: RuntimeBackend;
      builder?: DrawlistBuilderV1;
      drawlistVersion?: 2 | 3 | 4 | 5;
      maxDrawlistBytes?: number;
      drawlistValidateParams?: boolean;
      drawlistReuseOutputBuffer?: boolean;
      drawlistEncodedStringCacheCap?: number;
    }>,
  ) {
    this.backend = opts.backend;
    const builderOpts = {
      ...(opts.maxDrawlistBytes === undefined ? {} : { maxDrawlistBytes: opts.maxDrawlistBytes }),
      ...(opts.drawlistValidateParams === undefined
        ? {}
        : { validateParams: opts.drawlistValidateParams }),
      ...(opts.drawlistReuseOutputBuffer === undefined
        ? {}
        : { reuseOutputBuffer: opts.drawlistReuseOutputBuffer }),
      ...(opts.drawlistEncodedStringCacheCap === undefined
        ? {}
        : { encodedStringCacheCap: opts.drawlistEncodedStringCacheCap }),
    };
    if (opts.builder) {
      this.builder = opts.builder;
      return;
    }
    const drawlistVersion = opts.drawlistVersion ?? 2;
    if (
      drawlistVersion !== 2 &&
      drawlistVersion !== 3 &&
      drawlistVersion !== 4 &&
      drawlistVersion !== 5
    ) {
      throw new Error(
        `drawlistVersion ${String(
          drawlistVersion,
        )} is no longer supported; use drawlistVersion 2, 3, 4, or 5.`,
      );
    }
    if (drawlistVersion >= 3) {
      this.builder = createDrawlistBuilderV3({
        ...builderOpts,
        drawlistVersion: drawlistVersion === 3 ? 3 : drawlistVersion === 4 ? 4 : 5,
      });
      return;
    }
    this.builder = createDrawlistBuilderV2(builderOpts);
  }

  /**
   * Execute draw function, build drawlist, and submit to backend.
   *
   * @param drawFn - User draw function receiving the builder
   * @param hooks - Lifecycle hooks for render tracking
   * @returns Success with in-flight promise, or error with code/detail
   */
  submitFrame(drawFn: DrawFn, hooks: RawRendererHooks): RawRenderSubmitResult {
    this.builder.reset();

    const renderToken = perfMarkStart("render");
    let entered = false;
    try {
      hooks.enterRender();
      entered = true;
      drawFn(this.builder);
    } catch (e: unknown) {
      perfMarkEnd("render", renderToken);
      return { ok: false, code: "ZRUI_USER_CODE_THROW", detail: describeThrown(e) };
    } finally {
      if (entered) hooks.exitRender();
    }
    perfMarkEnd("render", renderToken);

    const buildToken = perfMarkStart("drawlist_build");
    const built = this.builder.build();
    perfMarkEnd("drawlist_build", buildToken);
    if (!built.ok) {
      return {
        ok: false,
        code: "ZRUI_DRAWLIST_BUILD_ERROR",
        detail: `${built.error.code}: ${built.error.detail}`,
      };
    }

    try {
      const inFlight = this.backend.requestFrame(built.bytes);
      return { ok: true, inFlight };
    } catch (e: unknown) {
      return { ok: false, code: "ZRUI_BACKEND_ERROR", detail: describeThrown(e) };
    }
  }
}
