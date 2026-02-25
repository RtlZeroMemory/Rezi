import React from "react";

export interface TextProps {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  dimColor?: boolean;
  wrap?: "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end";
  /** @jrichman/ink fork: show terminal cursor at this position */
  terminalCursorFocus?: boolean;
  /** @jrichman/ink fork: cursor column offset within the text */
  terminalCursorPosition?: number;
  ariaLabel?: string;
  "aria-label"?: string;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

export const Text = React.forwardRef<unknown, TextProps>((props, ref) => {
  return React.createElement("ink-text", { ...props, ref });
});

Text.displayName = "Text";
