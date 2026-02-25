import React from "react";

export interface BoxProps {
  flexDirection?: "row" | "row-reverse" | "column" | "column-reverse";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end";
  justifyContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  display?: "flex" | "none";

  width?: number | string;
  height?: number | string;
  minWidth?: number;
  minHeight?: number | string;
  maxWidth?: number;
  maxHeight?: number | string;

  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  gap?: number;
  columnGap?: number;
  rowGap?: number;

  borderStyle?: string | Record<string, string>;
  borderColor?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderDimColor?: boolean;
  borderTopDimColor?: boolean;
  borderRightDimColor?: boolean;
  borderBottomDimColor?: boolean;
  borderLeftDimColor?: boolean;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;

  backgroundColor?: string;

  overflow?: "visible" | "hidden" | "scroll";
  overflowX?: "visible" | "hidden" | "scroll";
  overflowY?: "visible" | "hidden" | "scroll";

  /** @jrichman/ink fork: horizontal scroll offset */
  scrollLeft?: number;
  /** @jrichman/ink fork: vertical scroll offset */
  scrollTop?: number;
  /** @jrichman/ink fork: scrollbar thumb color */
  scrollbarThumbColor?: string;
  /** @jrichman/ink fork: make this box opaque (paints background over content below) */
  opaque?: boolean;
  /** @jrichman/ink fork: pin this box to the top of its parent (sticky header) */
  sticky?: boolean;
  /** @jrichman/ink fork: children rendered inside the sticky area */
  stickyChildren?: React.ReactNode;

  children?: React.ReactNode;
  ref?: React.Ref<unknown>;
}

export const Box = React.forwardRef<unknown, BoxProps>((props, ref) => {
  return React.createElement("ink-box", { ...props, ref });
});

Box.displayName = "Box";
