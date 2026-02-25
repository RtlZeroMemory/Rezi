/**
 * ink-gradient shim — simplified replacement using ink-compat primitives.
 *
 * Gemini CLI usage:
 *   import Gradient from 'ink-gradient';
 *   <Gradient colors={['#ff0000', '#00ff00']}>
 *     <Text>Hello</Text>
 *   </Gradient>
 *
 * Real ink-gradient applies per-character color interpolation using tinygradient.
 * Our shim uses the first color as a simple text color since Rezi doesn't have
 * per-character coloring at the Ink compat layer. The visual result is simplified
 * but functionally correct (text renders with a color from the gradient).
 */
import React from "react";

import { Text } from "../components/Text.js";

export interface GradientProps {
  colors: string[];
  children?: React.ReactNode;
}

const Gradient: React.FC<GradientProps> = ({ colors, children }) => {
  // Use the first gradient color as the text color.
  // This is a simplification — real ink-gradient interpolates across characters.
  const color = colors[0] ?? "white";
  return React.createElement(Text, { color }, children);
};

export default Gradient;
