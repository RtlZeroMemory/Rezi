import type React from "react";

export interface GradientProps {
  colors?: string[];
  children?: React.ReactNode;
}

declare const Gradient: React.FC<GradientProps>;
export default Gradient;
