import {
  DEFAULT_TERMINAL_PROFILE,
  type TerminalCaps,
  type TerminalProfile,
  terminalProfileFromCaps,
} from "@rezi-ui/core";

type EnvMap = Readonly<Record<string, string | undefined>>;

type TerminalProfileHints = Readonly<{
  id?: string;
  versionString?: string;
  supportsKittyGraphics?: boolean;
  supportsSixel?: boolean;
  supportsIterm2Images?: boolean;
  supportsHyperlinks?: boolean;
  cellWidthPx?: number;
  cellHeightPx?: number;
}>;

function envText(env: EnvMap, key: string): string | undefined {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function envLower(env: EnvMap, key: string): string | undefined {
  const value = envText(env, key);
  return value?.toLowerCase();
}

function envInt(env: EnvMap, key: string): number | undefined {
  const raw = envText(env, key);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function envBool(env: EnvMap, key: string): boolean | undefined {
  const raw = envLower(env, key);
  if (!raw) return undefined;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function detectTerminalHints(env: EnvMap): TerminalProfileHints {
  const term = envLower(env, "TERM") ?? "";
  const termProgram = envLower(env, "TERM_PROGRAM");
  const lcTerminal = envLower(env, "LC_TERMINAL");
  const lcTerminalVersion = envText(env, "LC_TERMINAL_VERSION");
  const termProgramVersion = envText(env, "TERM_PROGRAM_VERSION");

  const isKitty = envText(env, "KITTY_WINDOW_ID") !== undefined || term.includes("kitty");
  const isWezTerm =
    envText(env, "WEZTERM_PANE") !== undefined ||
    envText(env, "WEZTERM_EXECUTABLE") !== undefined ||
    termProgram === "wezterm" ||
    term.includes("wezterm");
  const isIterm2 =
    envText(env, "ITERM_SESSION_ID") !== undefined ||
    termProgram === "iterm.app" ||
    lcTerminal === "iterm2";
  const isGhostty =
    envText(env, "GHOSTTY_RESOURCES_DIR") !== undefined ||
    termProgram === "ghostty" ||
    term.includes("ghostty");
  const isWindowsTerminal = envText(env, "WT_SESSION") !== undefined;
  const isXterm = term.includes("xterm");
  const isTmux = envText(env, "TMUX") !== undefined || term.startsWith("tmux");

  let id = "unknown";
  let versionString = "";
  if (isKitty) {
    id = "kitty";
    versionString = envText(env, "KITTY_VERSION") ?? termProgramVersion ?? "";
  } else if (isWezTerm) {
    id = "wezterm";
    versionString = envText(env, "WEZTERM_VERSION") ?? termProgramVersion ?? "";
  } else if (isIterm2) {
    id = "iterm2";
    versionString = termProgramVersion ?? lcTerminalVersion ?? "";
  } else if (isGhostty) {
    id = "ghostty";
    versionString = termProgramVersion ?? "";
  } else if (isWindowsTerminal) {
    id = "windows-terminal";
    versionString = envText(env, "WT_VERSION") ?? "";
  } else if (isTmux) {
    id = "tmux";
  } else if (isXterm) {
    id = "xterm";
  }

  const kittyOverride = envBool(env, "REZI_TERMINAL_SUPPORTS_KITTY");
  const sixelOverride = envBool(env, "REZI_TERMINAL_SUPPORTS_SIXEL");
  const itermOverride = envBool(env, "REZI_TERMINAL_SUPPORTS_ITERM2");
  const osc8Override = envBool(env, "REZI_TERMINAL_SUPPORTS_OSC8");

  const supportsKittyGraphics = kittyOverride ?? (isKitty || isGhostty);
  const supportsSixel = sixelOverride ?? (isWezTerm || term.includes("sixel"));
  const supportsIterm2Images = itermOverride ?? isIterm2;
  const supportsHyperlinks =
    osc8Override ?? (isKitty || isWezTerm || isGhostty || isIterm2 || isWindowsTerminal || isXterm);

  const cellWidthPx = envInt(env, "REZI_CELL_WIDTH_PX") ?? envInt(env, "ZR_CELL_WIDTH_PX");
  const cellHeightPx = envInt(env, "REZI_CELL_HEIGHT_PX") ?? envInt(env, "ZR_CELL_HEIGHT_PX");

  return Object.freeze({
    id,
    versionString,
    supportsKittyGraphics,
    supportsSixel,
    supportsIterm2Images,
    supportsHyperlinks,
    ...(cellWidthPx === undefined ? {} : { cellWidthPx }),
    ...(cellHeightPx === undefined ? {} : { cellHeightPx }),
  });
}

export function terminalProfileFromNodeEnv(
  caps: TerminalCaps,
  env: EnvMap = process.env as EnvMap,
): TerminalProfile {
  const base = terminalProfileFromCaps(caps);
  const hints = detectTerminalHints(env);
  return Object.freeze({
    ...DEFAULT_TERMINAL_PROFILE,
    ...base,
    ...(hints.id ? { id: hints.id } : {}),
    ...(hints.versionString ? { versionString: hints.versionString } : {}),
    ...(hints.cellWidthPx === undefined ? {} : { cellWidthPx: hints.cellWidthPx }),
    ...(hints.cellHeightPx === undefined ? {} : { cellHeightPx: hints.cellHeightPx }),
    supportsKittyGraphics: hints.supportsKittyGraphics ?? base.supportsKittyGraphics,
    supportsSixel: hints.supportsSixel ?? base.supportsSixel,
    supportsIterm2Images: hints.supportsIterm2Images ?? base.supportsIterm2Images,
    supportsHyperlinks: hints.supportsHyperlinks ?? base.supportsHyperlinks,
  });
}
