import React from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";

export default function useIsScreenReaderEnabled(): boolean {
  return React.useContext(AccessibilityContext);
}
