/**
 * ink-spinner shim — drop-in replacement using ink-compat primitives.
 *
 * Gemini CLI usage:
 *   import Spinner from 'ink-spinner';
 *   <Spinner type="dots" />
 *
 * We implement the "dots" spinner type (the only one Gemini uses).
 */
import React, { useEffect, useState } from "react";

import { Text } from "../components/Text.js";

// Spinner frame sets from cli-spinners
const SPINNER_FRAMES: Record<string, { frames: string[]; interval: number }> = {
  dots: {
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    interval: 80,
  },
  line: {
    frames: ["-", "\\", "|", "/"],
    interval: 130,
  },
  arrow: {
    frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
    interval: 120,
  },
};

export interface SpinnerProps {
  type?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ type = "dots" }) => {
  const [frame, setFrame] = useState(0);
  const spinner = SPINNER_FRAMES[type] ?? SPINNER_FRAMES["dots"]!;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % spinner.frames.length);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner]);

  return React.createElement(Text, { color: "green" }, spinner.frames[frame]);
};

export default Spinner;
