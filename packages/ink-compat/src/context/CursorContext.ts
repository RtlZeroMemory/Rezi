import React from "react";
import type { CursorPosition } from "../logUpdate.js";

export type CursorContextValue = Readonly<{
  /**
   * Set the cursor position relative to the Ink output.
   *
   * Pass `undefined` to hide the cursor.
   */
  setCursorPosition: (position: CursorPosition | undefined) => void;
}>;

const CursorContext = React.createContext<CursorContextValue>({
  setCursorPosition() {},
});

export default CursorContext;

