import React from "react";
import type { InkHostNode } from "../reconciler/types.js";

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

type TextComponent = React.ForwardRefExoticComponent<
  TextProps & React.RefAttributes<InkHostNode>
> & {
  displayName?: string;
  // Downstream test suites often cast Text to a Vitest Mock after vi.mock("ink").
  // Keeping these optional fields on the public type avoids TS2352 assertion failures.
  mock?: unknown;
  mockClear?: unknown;
  mockReset?: unknown;
};

export const Text = React.forwardRef<InkHostNode, TextProps>((props, ref) => {
  return React.createElement("ink-text", { ...props, ref });
}) as unknown as TextComponent;

Text.displayName = "Text";
