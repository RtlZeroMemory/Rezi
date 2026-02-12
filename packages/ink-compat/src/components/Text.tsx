import React, { useContext } from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";
import BackgroundContext from "../context/BackgroundContext.js";
import type { TextProps } from "../types.js";

export type Props = TextProps;

/**
 * Ink-compatible `<Text>` component.
 *
 * Mirrors Ink behavior: returns null when `children` is null/undefined.
 */
export default function Text(props: Props): React.JSX.Element | null {
  const {
    children,
    color,
    backgroundColor,
    dimColor,
    bold,
    italic,
    underline,
    strikethrough,
    inverse,
    wrap = "wrap",
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden = false,
  } = props;

  const isScreenReaderEnabled = useContext(AccessibilityContext);
  const inheritedBackgroundColor = useContext(BackgroundContext);
  const childrenOrAriaLabel = isScreenReaderEnabled && ariaLabel ? ariaLabel : children;

  if (childrenOrAriaLabel === undefined || childrenOrAriaLabel === null) return null;
  if (isScreenReaderEnabled && ariaHidden) return null;

  return React.createElement(
    "ink-text",
    {
      color,
      backgroundColor: backgroundColor ?? inheritedBackgroundColor,
      dimColor,
      bold,
      italic,
      underline,
      strikethrough,
      inverse,
      wrap,
      style: {
        flexGrow: 0,
        flexShrink: 1,
        flexDirection: "row",
        textWrap: wrap,
      },
    },
    childrenOrAriaLabel,
  );
}
