import React, { forwardRef, type PropsWithChildren } from "react";
import type { BoxProps, DOMElement } from "../types.js";

export type Props = BoxProps;

/**
 * Ink-compatible `<Box>` component.
 *
 * We render a host element (`"ink-box"`) that is interpreted by this package's
 * custom reconciler and converted into Rezi VNodes.
 */
const Box = forwardRef<DOMElement, PropsWithChildren<Props>>((props, ref) => {
  const { children, ...rest } = props;
  // `ref` is accepted for compatibility but currently unused.
  return React.createElement("ink-box", { ...rest, ref }, children);
});

Box.displayName = "Box";

export default Box;
