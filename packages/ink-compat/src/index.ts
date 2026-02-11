// Public surface (drop-in replacement for "ink").

// Components
export { default as Box } from "./components/Box.js";
export { default as Text } from "./components/Text.js";
export { default as Spacer } from "./components/Spacer.js";
export { default as Newline } from "./components/Newline.js";
export { default as Transform } from "./components/Transform.js";
export { default as Static } from "./components/Static.js";

// Hooks
export { default as useInput } from "./hooks/useInput.js";
export { default as useApp } from "./hooks/useApp.js";
export { default as useStdin } from "./hooks/useStdin.js";
export { default as useStdout } from "./hooks/useStdout.js";
export { default as useStderr } from "./hooks/useStderr.js";
export { default as useFocus } from "./hooks/useFocus.js";
export { default as useFocusManager } from "./hooks/useFocusManager.js";
export { default as useIsScreenReaderEnabled } from "./hooks/useIsScreenReaderEnabled.js";

// Render
export { render } from "./render.js";

// Measurement
export { default as measureElement } from "./measureElement.js";
export {
  getBoundingBox,
  getInnerHeight,
  getScrollHeight,
  getScrollWidth,
} from "./measureElement.js";
export { default as ResizeObserver, ResizeObserverEntry } from "./resizeObserver.js";

// Types
export type { Instance, RenderOptions } from "./types.js";
export type { Key, BoxProps, TextProps } from "./types.js";
export type { AppProps, StdinProps, StdoutProps, StderrProps } from "./types.js";
export type { StaticProps, TransformProps, NewlineProps } from "./types.js";
export type { DOMElement } from "./types.js";
