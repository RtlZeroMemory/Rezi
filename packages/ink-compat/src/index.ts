import "./runtime/reactBridge.js";
import type React from "react";

export { Box, type BoxProps } from "./components/Box.js";
export { Newline, type NewlineProps } from "./components/Newline.js";
export { Spacer } from "./components/Spacer.js";
export { Static, type StaticProps } from "./components/Static.js";
export { Text, type TextProps } from "./components/Text.js";
export { Transform, type TransformProps } from "./components/Transform.js";

export { useApp } from "./hooks/useApp.js";
export { useCursor } from "./hooks/useCursor.js";
export { useFocus } from "./hooks/useFocus.js";
export { useFocusManager } from "./hooks/useFocusManager.js";
export { useInput, type Key } from "./hooks/useInput.js";
export { useIsScreenReaderEnabled } from "./hooks/useIsScreenReaderEnabled.js";
export { useStderr } from "./hooks/useStderr.js";
export { useStdin } from "./hooks/useStdin.js";
export { useStdout } from "./hooks/useStdout.js";
export { kittyFlags, kittyModifiers } from "./kitty-keyboard.js";

export { getBoundingBox, type BoundingBox } from "./runtime/getBoundingBox.js";
export { getInnerHeight, getScrollHeight } from "./runtime/domHelpers.js";
export { measureElement } from "./runtime/measureElement.js";
export { render, type Instance, type RenderOptions } from "./runtime/render.js";
export { renderToString, type RenderToStringOptions } from "./runtime/renderToString.js";
export {
  InkResizeObserver as ResizeObserver,
  type ResizeObserverCallback,
  type ResizeObserverEntry,
} from "./runtime/ResizeObserver.js";
export {
  type StyledChar,
  toStyledCharacters,
  styledCharsToString,
  styledCharsWidth,
  wordBreakStyledChars,
  wrapStyledChars,
  widestLineFromStyledChars,
} from "./styledChars.js";
export type { InkHostNode as DOMElement } from "./reconciler/types.js";

/**
 * AppProps — the return type of useApp().
 * Gemini CLI types the result as `const app: AppProps = useApp()`.
 */
export interface AppProps {
  exit(errorOrResult?: Error | unknown): void;
  rerender(tree?: React.ReactElement): void;
}
