import { createRequire } from "node:module";

import {
  Box as InkBox,
  type BoxProps as InkBoxProps,
  Text as InkText,
  type TextProps as InkTextProps,
} from "ink";

const require = createRequire(import.meta.url);
const inkRequire = createRequire(require.resolve("ink"));
const InkReact = inkRequire("react") as typeof import("react");

type DimAliasProps = Readonly<{
  dim?: boolean;
  dimColor?: boolean;
}>;

export type TextProps = InkTextProps & DimAliasProps;
type InkBoxChildren = Parameters<typeof InkBox>[0] extends { children?: infer T } ? T : never;
export type BoxProps = InkBoxProps &
  Readonly<{
    children?: InkBoxChildren;
  }> &
  DimAliasProps;

export function Text({ dim, dimColor, ...rest }: TextProps): ReturnType<typeof InkText> {
  const resolvedDimColor = dim ?? dimColor;

  if (resolvedDimColor === undefined) {
    return InkReact.createElement(InkText, rest) as ReturnType<typeof InkText>;
  }

  return InkReact.createElement(InkText, {
    ...rest,
    dimColor: resolvedDimColor,
  }) as ReturnType<typeof InkText>;
}

export function Box({
  dim: _dim,
  dimColor: _dimColor,
  ...rest
}: BoxProps): ReturnType<typeof InkBox> {
  return InkReact.createElement(InkBox, rest) as ReturnType<typeof InkBox>;
}
