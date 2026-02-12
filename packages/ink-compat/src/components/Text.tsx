import React from "react";
import type { TextProps } from "../types.js";

export type Props = TextProps;

/**
 * Ink-compatible `<Text>` component.
 *
 * Mirrors Ink behavior: returns null when `children` is null/undefined.
 */
export default function Text(props: Props): React.JSX.Element | null {
  if (props.children === undefined || props.children === null) return null;
  const { children, ...rest } = props;
  return React.createElement("ink-text", rest, children);
}
