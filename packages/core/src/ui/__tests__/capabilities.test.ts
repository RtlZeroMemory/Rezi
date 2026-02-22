import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLOR_MODE_16,
  COLOR_MODE_256,
  COLOR_MODE_RGB,
  DEFAULT_TERMINAL_CAPS,
} from "../../terminalCaps.js";
import { DEFAULT_TERMINAL_PROFILE } from "../../terminalProfile.js";
import {
  DEFAULT_CAPABILITY_CONTEXT,
  getCapabilityTier,
  resolveCapabilityContext,
  rgbTo256,
} from "../capabilities.js";

describe("getCapabilityTier", () => {
  it("returns A for 16-color mode", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_16 };
    assert.equal(getCapabilityTier(caps), "A");
  });

  it("returns A for 256-color mode", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_256 };
    assert.equal(getCapabilityTier(caps), "A");
  });

  it("returns B for truecolor without image protocol", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    assert.equal(getCapabilityTier(caps), "B");
  });

  it("returns B for truecolor with empty profile", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    assert.equal(getCapabilityTier(caps, DEFAULT_TERMINAL_PROFILE), "B");
  });

  it("returns C for truecolor with kitty graphics", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    const profile = { ...DEFAULT_TERMINAL_PROFILE, supportsKittyGraphics: true };
    assert.equal(getCapabilityTier(caps, profile), "C");
  });

  it("returns C for truecolor with sixel", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    const profile = { ...DEFAULT_TERMINAL_PROFILE, supportsSixel: true };
    assert.equal(getCapabilityTier(caps, profile), "C");
  });

  it("returns C for truecolor with iterm2 images", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    const profile = { ...DEFAULT_TERMINAL_PROFILE, supportsIterm2Images: true };
    assert.equal(getCapabilityTier(caps, profile), "C");
  });
});

describe("resolveCapabilityContext", () => {
  it("returns tier A context for non-truecolor terminals", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_256 };
    const ctx = resolveCapabilityContext(caps);
    assert.equal(ctx.tier, "A");
    assert.equal(ctx.truecolor, false);
    assert.equal(ctx.hasImageProtocol, false);
  });

  it("returns full context for tier B", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    const ctx = resolveCapabilityContext(caps);
    assert.equal(ctx.tier, "B");
    assert.equal(ctx.truecolor, true);
    assert.equal(ctx.hasImageProtocol, false);
  });

  it("returns tier C context when image protocol is available", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_RGB };
    const profile = { ...DEFAULT_TERMINAL_PROFILE, supportsKittyGraphics: true };
    const ctx = resolveCapabilityContext(caps, profile);
    assert.equal(ctx.tier, "C");
    assert.equal(ctx.truecolor, true);
    assert.equal(ctx.hasImageProtocol, true);
  });

  it("detects underline styles", () => {
    const caps = {
      ...DEFAULT_TERMINAL_CAPS,
      colorMode: COLOR_MODE_RGB,
      supportsUnderlineStyles: true,
    };
    const ctx = resolveCapabilityContext(caps);
    assert.equal(ctx.hasUnderlineStyles, true);
  });

  it("merges profile capabilities for underline colors and hyperlinks", () => {
    const caps = { ...DEFAULT_TERMINAL_CAPS, colorMode: COLOR_MODE_16 };
    const profile = {
      ...DEFAULT_TERMINAL_PROFILE,
      supportsColoredUnderlines: true,
      supportsHyperlinks: true,
    };
    const ctx = resolveCapabilityContext(caps, profile);
    assert.equal(ctx.hasColoredUnderlines, true);
    assert.equal(ctx.hasHyperlinks, true);
  });
});

describe("DEFAULT_CAPABILITY_CONTEXT", () => {
  it("defaults to tier A", () => {
    assert.equal(DEFAULT_CAPABILITY_CONTEXT.tier, "A");
    assert.equal(DEFAULT_CAPABILITY_CONTEXT.truecolor, false);
  });
});

describe("rgbTo256", () => {
  it("maps pure red to cube index", () => {
    const idx = rgbTo256(255, 0, 0);
    assert.equal(idx, 196); // 16 + 36*5 + 6*0 + 0
  });

  it("maps pure green to cube index", () => {
    const idx = rgbTo256(0, 255, 0);
    assert.equal(idx, 46); // 16 + 36*0 + 6*5 + 0
  });

  it("maps pure blue to cube index", () => {
    const idx = rgbTo256(0, 0, 255);
    assert.equal(idx, 21); // 16 + 36*0 + 6*0 + 5
  });

  it("maps pure black to the darkest cube entry", () => {
    const idx = rgbTo256(0, 0, 0);
    assert.equal(idx, 16);
  });

  it("maps pure white to brightest cube entry", () => {
    const idx = rgbTo256(255, 255, 255);
    // 5,5,5 cube entry (231) is a perfect match for pure white
    assert.equal(idx, 231);
  });

  it("maps mid-gray to grayscale ramp", () => {
    const idx = rgbTo256(128, 128, 128);
    // Gray value ~128, grayIndex = round((128-8)/10) = 12, idx = 232+12 = 244
    assert.equal(idx, 244);
  });

  it("maps a light gray to grayscale ramp", () => {
    const idx = rgbTo256(200, 200, 200);
    assert.equal(idx, 251);
  });

  it("maps mid-range color deterministically", () => {
    const idx = rgbTo256(120, 60, 200);
    assert.equal(idx, 98);
  });
});
