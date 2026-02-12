import type { TextStyle } from "@rezi-ui/core";
import { resolveInkColor } from "../color.js";
import { warnOnce } from "../internal/warn.js";
import type { TextProps } from "../types.js";

function mapTextStyle(
  p: Pick<TextProps, "color" | "backgroundColor" | "dimColor">,
): TextStyle | undefined {
  const fg = resolveInkColor(p.color);
  const bg = resolveInkColor(p.backgroundColor);
  const dim = p.dimColor;

  if (!fg && !bg && dim !== true) return undefined;
  return {
    ...(fg ? { fg } : {}),
    ...(bg ? { bg } : {}),
    ...(dim ? { dim: true } : {}),
  };
}

export type MappedInkText = Readonly<{
  style: TextStyle | undefined;
  wrap:
    | "wrap"
    | "end"
    | "middle"
    | "truncate-end"
    | "truncate"
    | "truncate-middle"
    | "truncate-start";
  textOverflow: "clip" | "ellipsis" | "middle" | undefined;
}>;

export function mapTextProps(p: TextProps): MappedInkText {
  if (p.strikethrough) {
    warnOnce("strikethrough is not supported by Rezi, ignoring");
  }

  const style: TextStyle | undefined = {
    ...mapTextStyle(p),
    ...(p.bold ? { bold: true } : {}),
    ...(p.italic ? { italic: true } : {}),
    ...(p.underline ? { underline: true } : {}),
    ...(p.inverse ? { inverse: true } : {}),
  };

  const wrap = p.wrap ?? "wrap";
  const textOverflow =
    wrap === "truncate-start"
      ? "ellipsis"
      : wrap === "truncate-middle"
        ? "middle"
        : wrap === "truncate" || wrap === "truncate-end"
          ? "ellipsis"
          : undefined;

  return { style: Object.keys(style).length === 0 ? undefined : style, wrap, textOverflow };
}
