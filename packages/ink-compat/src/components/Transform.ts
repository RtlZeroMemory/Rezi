import React from "react";

export interface TransformProps {
  transform: (line: string, index: number) => string;
  ariaLabel?: string;
  "aria-label"?: string;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

export const Transform: React.FC<TransformProps> = ({
  transform,
  children,
  ariaLabel,
  accessibilityLabel,
  ...rest
}) => {
  return React.createElement("ink-virtual", {
    __inkType: "transform",
    __inkTransform: transform,
    ...(ariaLabel === undefined ? {} : { ariaLabel }),
    ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
    ...rest,
    children,
  });
};

Transform.displayName = "Transform";
