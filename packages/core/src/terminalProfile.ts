import type { TerminalCaps } from "./terminalCaps.js";

export type TerminalProfile = Readonly<{
  id: string;
  versionString: string;
  supportsKittyGraphics: boolean;
  supportsSixel: boolean;
  supportsIterm2Images: boolean;
  supportsUnderlineStyles: boolean;
  supportsColoredUnderlines: boolean;
  supportsHyperlinks: boolean;
  cellWidthPx: number;
  cellHeightPx: number;
}>;

export const DEFAULT_TERMINAL_PROFILE: TerminalProfile = Object.freeze({
  id: "unknown",
  versionString: "",
  supportsKittyGraphics: false,
  supportsSixel: false,
  supportsIterm2Images: false,
  supportsUnderlineStyles: false,
  supportsColoredUnderlines: false,
  supportsHyperlinks: false,
  cellWidthPx: 0,
  cellHeightPx: 0,
});

const SGR_UNDERLINE = 1 << 2;

export function terminalProfileFromCaps(caps: TerminalCaps): TerminalProfile {
  const supportsUnderline = (caps.sgrAttrsSupported & SGR_UNDERLINE) !== 0;
  return Object.freeze({
    ...DEFAULT_TERMINAL_PROFILE,
    supportsUnderlineStyles: supportsUnderline,
    supportsColoredUnderlines: supportsUnderline,
    supportsHyperlinks: caps.supportsOsc52,
  });
}
