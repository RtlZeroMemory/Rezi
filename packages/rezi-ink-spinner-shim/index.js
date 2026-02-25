/**
 * @rezi-ui/ink-spinner-shim.
 * Scoped alias package with the same behavior as ink-spinner-shim.
 */
import React, { useEffect, useState } from "react";

const SPINNER_FRAMES = {
  dots: { frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], interval: 80 },
  line: { frames: ["-", "\\", "|", "/"], interval: 130 },
  arrow: { frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"], interval: 120 },
};

const Spinner = ({ type = "dots" }) => {
  const [frame, setFrame] = useState(0);
  const spinner = SPINNER_FRAMES[type] ?? SPINNER_FRAMES.dots;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % spinner.frames.length);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner]);

  return React.createElement("ink-text", { color: "green" }, spinner.frames[frame]);
};

export default Spinner;
