import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TERMINAL_CAPS } from "@rezi-ui/core";
import { terminalProfileFromNodeEnv } from "../backend/terminalProfile.js";

test("terminalProfileFromNodeEnv detects kitty capabilities and pixel size hints", () => {
  const profile = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, {
    TERM: "xterm-kitty",
    KITTY_WINDOW_ID: "1",
    KITTY_VERSION: "0.35.2",
    REZI_CELL_WIDTH_PX: "9",
    REZI_CELL_HEIGHT_PX: "18",
  });
  assert.equal(profile.id, "kitty");
  assert.equal(profile.versionString, "0.35.2");
  assert.equal(profile.supportsKittyGraphics, true);
  assert.equal(profile.supportsHyperlinks, true);
  assert.equal(profile.cellWidthPx, 9);
  assert.equal(profile.cellHeightPx, 18);
});

test("terminalProfileFromNodeEnv detects iTerm2 image support", () => {
  const profile = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, {
    TERM_PROGRAM: "iTerm.app",
    TERM_PROGRAM_VERSION: "3.5.0",
  });
  assert.equal(profile.id, "iterm2");
  assert.equal(profile.versionString, "3.5.0");
  assert.equal(profile.supportsIterm2Images, true);
});

test("terminalProfileFromNodeEnv honors explicit capability overrides", () => {
  const profile = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, {
    TERM: "vt100",
    REZI_TERMINAL_SUPPORTS_KITTY: "1",
    REZI_TERMINAL_SUPPORTS_SIXEL: "true",
    REZI_TERMINAL_SUPPORTS_ITERM2: "yes",
    REZI_TERMINAL_SUPPORTS_OSC8: "on",
  });
  assert.equal(profile.supportsKittyGraphics, true);
  assert.equal(profile.supportsSixel, true);
  assert.equal(profile.supportsIterm2Images, true);
  assert.equal(profile.supportsHyperlinks, true);
});

test("terminalProfileFromNodeEnv is deterministic", () => {
  const env = {
    TERM_PROGRAM: "ghostty",
    TERM_PROGRAM_VERSION: "1.0.1",
    ZR_CELL_WIDTH_PX: "8",
    ZR_CELL_HEIGHT_PX: "16",
  } as const;
  const first = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, env);
  const second = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, env);
  assert.deepEqual(second, first);
});

test("terminalProfileFromNodeEnv does not assume kitty graphics for wezterm without override", () => {
  const profile = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, {
    TERM_PROGRAM: "wezterm",
    WEZTERM_PANE: "1",
  });
  assert.equal(profile.id, "wezterm");
  assert.equal(profile.supportsKittyGraphics, false);
  assert.equal(profile.supportsSixel, true);
  assert.equal(profile.supportsHyperlinks, true);
});

test("terminalProfileFromNodeEnv auto-enables sixel for wezterm", () => {
  const profile = terminalProfileFromNodeEnv(DEFAULT_TERMINAL_CAPS, {
    TERM_PROGRAM: "wezterm",
    WEZTERM_PANE: "1",
  });
  assert.equal(profile.id, "wezterm");
  assert.equal(profile.supportsSixel, true);
  assert.equal(profile.supportsHyperlinks, true);
  assert.equal(profile.supportsKittyGraphics, false);
});
