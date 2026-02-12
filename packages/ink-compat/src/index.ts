// Public surface (drop-in replacement for "ink").

// ── Upstream Ink exports (v6.7.0) ────────────────────────────────────

export type { RenderOptions, Instance } from "./render.js";
export { default as render } from "./render.js";

export type { Props as BoxProps } from "./components/Box.js";
export { default as Box } from "./components/Box.js";

export type { Props as TextProps } from "./components/Text.js";
export { default as Text } from "./components/Text.js";

export type { AppProps, StdinProps, StdoutProps, StderrProps } from "./types.js";

export type { Props as StaticProps } from "./components/Static.js";
export { default as Static } from "./components/Static.js";

export type { Props as TransformProps } from "./components/Transform.js";
export { default as Transform } from "./components/Transform.js";

export type { Props as NewlineProps } from "./components/Newline.js";
export { default as Newline } from "./components/Newline.js";

export { default as Spacer } from "./components/Spacer.js";

export type { Key } from "./hooks/useInput.js";
export { default as useInput } from "./hooks/useInput.js";
export { default as useApp } from "./hooks/useApp.js";
export { default as useStdin } from "./hooks/useStdin.js";
export { default as useStdout } from "./hooks/useStdout.js";
export { default as useStderr } from "./hooks/useStderr.js";
export { default as useFocus } from "./hooks/useFocus.js";
export { default as useFocusManager } from "./hooks/useFocusManager.js";
export { default as useIsScreenReaderEnabled } from "./hooks/useIsScreenReaderEnabled.js";
export { default as useCursor } from "./hooks/useCursor.js";

export type { CursorPosition } from "./logUpdate.js";

export { default as measureElement } from "./measureElement.js";
export type { DOMElement } from "./types.js";

export { kittyFlags, kittyModifiers } from "./kittyKeyboard.js";
export type { KittyKeyboardOptions, KittyFlagName } from "./kittyKeyboard.js";

// ── Extra Rezi-only exports (non-upstream) ───────────────────────────

export {
  getBoundingBox,
  getInnerHeight,
  getInnerWidth,
  getScrollHeight,
  getScrollWidth,
} from "./measureElement.js";
export { default as ResizeObserver, ResizeObserverEntry } from "./resizeObserver.js";

export {
  clearStringWidthCache,
  setStringWidthFunction,
  styledCharsToString,
  styledCharsWidth,
  toStyledCharacters,
  widestLineFromStyledChars,
  wordBreakStyledChars,
  wrapStyledChars,
} from "./styledTextCompat.js";

export type { StyledChar } from "./styledTextCompat.js";
