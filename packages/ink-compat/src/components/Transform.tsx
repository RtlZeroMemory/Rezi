import React, { useContext, type ReactNode } from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";

export type Props = Readonly<{
  /**
   * Screen-reader-specific text to output. If this is set, all children will be ignored.
   */
  accessibilityLabel?: string;
  /**
   * Function which transforms children output. It accepts children and must return
   * transformed children too.
   */
  transform: (children: string, index: number) => string;
  children?: ReactNode;
}>;

/**
 * Ink-compatible `<Transform>` component.
 *
 * In Ink, this transforms the rendered string output. In the Rezi compat layer,
 * we apply the transform to the flattened text content (best-effort).
 */
export default function Transform({
  children,
  transform,
  accessibilityLabel,
}: Props): React.JSX.Element | null {
  const isScreenReaderEnabled = useContext(AccessibilityContext);

  if (children === undefined || children === null) return null;

  return React.createElement(
    "ink-text",
    {
      style: { flexGrow: 0, flexShrink: 1, flexDirection: "row" },
      internal_transform: transform,
    },
    isScreenReaderEnabled && accessibilityLabel ? accessibilityLabel : children,
  );
}
