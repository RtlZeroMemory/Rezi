import type { ReactNode } from "react";

// NOTE: These types are intentionally Ink-shaped to make `@rezi-ui/ink-compat`
// a near drop-in replacement for `ink` in userland TypeScript.

/**
 * Handy information about a key that was pressed.
 * Mirrors Ink's `Key` type (ink/build/hooks/use-input.d.ts).
 */
export type Key = Readonly<{
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
}>;

export type TextWrap =
  | "wrap"
  | "end"
  | "middle"
  | "truncate-end"
  | "truncate"
  | "truncate-middle"
  | "truncate-start";

// Ink's BoxProps is `Except<Styles, "textWrap">` which includes all layout/border
// props. We intentionally keep the surface broad (string-based) to avoid pulling
// `ink`'s dependency types into this package.
export type BoxProps = Readonly<{
  position?: "absolute" | "relative";
  columnGap?: number;
  rowGap?: number;
  gap?: number;
  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexBasis?: number | string;
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  alignSelf?: "flex-start" | "center" | "flex-end" | "auto";
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "center";
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  display?: "flex" | "none";
  borderStyle?: string;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
  borderColor?: string;
  borderTopColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderRightColor?: string;
  borderDimColor?: boolean;
  borderTopDimColor?: boolean;
  borderBottomDimColor?: boolean;
  borderLeftDimColor?: boolean;
  borderRightDimColor?: boolean;
  overflow?: "visible" | "hidden";
  overflowX?: "visible" | "hidden";
  overflowY?: "visible" | "hidden";
  children?: ReactNode;
}>;

export type TextProps = Readonly<{
  color?: string;
  backgroundColor?: string;
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  wrap?: TextWrap;
  children?: ReactNode;
}>;

export type RenderOptions = Readonly<{
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  debug?: boolean;
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
  maxFps?: number;
  onRender?: (metrics: Readonly<{ renderTime: number }>) => void;
  isScreenReaderEnabled?: boolean;
  alternateBuffer?: boolean;
  alternateBufferAlreadyActive?: boolean;
  incrementalRendering?: boolean;
  /**
   * @internal Test-only hook. When provided, `render()` uses this backend instead of
   * `createNodeBackend()`.
   */
  internal_backend?: unknown;
}>;

export type Instance = Readonly<{
  rerender: (tree: ReactNode) => void;
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
  cleanup: () => void;
  clear: () => void;
}>;

// ── Context prop types (match Ink's exported Props types) ────────────

/** Props exposed by Ink's `AppContext`. */
export type AppProps = Readonly<{
  exit: (error?: Error) => void;
}>;

/** Props exposed by Ink's `StdinContext`. */
export type StdinProps = Readonly<{
  stdin: NodeJS.ReadStream;
  setRawMode: (value: boolean) => void;
  isRawModeSupported: boolean;
}>;

/** Props exposed by Ink's `StdoutContext`. */
export type StdoutProps = Readonly<{
  stdout: NodeJS.WriteStream;
  write: (data: string) => void;
}>;

/** Props exposed by Ink's `StderrContext`. */
export type StderrProps = Readonly<{
  stderr: NodeJS.WriteStream;
  write: (data: string) => void;
}>;

/** Props for the `<Static>` component. */
export type StaticProps<T> = Readonly<{
  items: readonly T[];
  style?: BoxProps;
  children: (item: T, index: number) => ReactNode;
}>;

/** Props for the `<Transform>` component. */
export type TransformProps = Readonly<{
  transform: (children: string, index: number) => string;
  children?: ReactNode;
}>;

/** Props for the `<Newline>` component. */
export type NewlineProps = Readonly<{
  count?: number;
}>;

// ── DOMElement ───────────────────────────────────────────────────────

/**
 * Opaque handle returned by a Box `ref`.
 *
 * In Ink this is a full DOM node with a yogaNode for layout queries.
 * In ink-compat it wraps the reconciler's HostElement and carries
 * committed layout metadata populated after each render frame.
 */
export type DOMElement = {
  nodeName: string;
  attributes: Record<string, unknown>;
  childNodes: readonly DOMElement[];
  parentNode?: DOMElement;
  internal_layout?: Readonly<{ x: number; y: number; width: number; height: number }>;
  internal_scrollState?: Readonly<{
    scrollHeight: number;
    scrollWidth: number;
    clientHeight: number;
    clientWidth: number;
  }>;
  resizeObservers?: Set<unknown>;
  internal_lastMeasuredSize?: Readonly<{ width: number; height: number }>;
};
