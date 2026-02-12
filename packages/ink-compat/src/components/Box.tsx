import React, { forwardRef, useContext, type PropsWithChildren } from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";
import BackgroundContext from "../context/BackgroundContext.js";
import type { BoxProps, DOMElement } from "../types.js";

export type Props = BoxProps;

/**
 * Ink-compatible `<Box>` component.
 *
 * We render a host element (`"ink-box"`) that is interpreted by this package's
 * custom reconciler and converted into Rezi VNodes.
 */
const Box = forwardRef<DOMElement, PropsWithChildren<Props>>((props, ref) => {
  const {
    children,
    backgroundColor,
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden,
    "aria-role": role,
    "aria-state": ariaState,
    ...style
  } = props;

  const isScreenReaderEnabled = useContext(AccessibilityContext);
  if (isScreenReaderEnabled && ariaHidden) {
    return null;
  }

  const label = ariaLabel ? React.createElement("ink-text", null, ariaLabel) : undefined;

  const boxElement = React.createElement(
    "ink-box",
    {
      ...style,
      ref,
      backgroundColor,
      flexWrap: style.flexWrap ?? "nowrap",
      flexDirection: style.flexDirection ?? "row",
      flexGrow: style.flexGrow ?? 0,
      flexShrink: style.flexShrink ?? 1,
      overflowX: style.overflowX ?? style.overflow ?? "visible",
      overflowY: style.overflowY ?? style.overflow ?? "visible",
      internal_accessibility: { role, state: ariaState },
    },
    isScreenReaderEnabled && label ? label : children,
  );

  if (backgroundColor) {
    return React.createElement(BackgroundContext.Provider, { value: backgroundColor }, boxElement);
  }

  return boxElement;
});

Box.displayName = "Box";

export default Box;
