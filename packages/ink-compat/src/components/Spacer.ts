import React from "react";

export const Spacer: React.FC = () => {
  return React.createElement("ink-box", { __inkType: "spacer", flexGrow: 1 });
};

Spacer.displayName = "Spacer";
