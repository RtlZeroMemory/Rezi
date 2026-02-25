import React from "react";

export interface NewlineProps {
  count?: number;
}

export const Newline: React.FC<NewlineProps> = ({ count = 1 }) => {
  return React.createElement("ink-virtual", { __inkType: "newline", count });
};

Newline.displayName = "Newline";
