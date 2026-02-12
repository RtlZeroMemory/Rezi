export { Newline, Spacer, Static, Transform, measureElement } from "ink";
export type {
  AppProps,
  DOMElement,
  NewlineProps,
  StderrProps,
  StaticProps,
  StdinProps,
  StdoutProps,
  TransformProps,
  Instance,
} from "ink";

export { useApp, useFocus, useFocusManager, useStderr, useStdin, useStdout } from "ink";

export { Box, Text } from "./components.js";
export type { BoxProps, TextProps } from "./components.js";

export { render } from "./render.js";
export type { RenderOptions } from "./render.js";

export { useInput } from "./useInput.js";
export type { InputHandler } from "./useInput.js";

export { isCtrlC, normalizeKey } from "./keyNormalization.js";
export type { InkCompatKey } from "./keyNormalization.js";

export type CursorPosition = Readonly<{
  x: number;
  y: number;
}>;
