import React from "react";

export interface TransformProps {
  transform: (line: string, index: number) => string;
  children: React.ReactNode;
}

export const Transform: React.FC<TransformProps> = ({ transform, children }) => {
  return React.createElement("ink-virtual", {
    __inkType: "transform",
    __inkTransform: transform,
    children,
  });
};

Transform.displayName = "Transform";
