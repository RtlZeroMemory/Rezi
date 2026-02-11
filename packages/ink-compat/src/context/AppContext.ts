import React from "react";
import { InkCompatError } from "../errors.js";

export type AppContextValue = Readonly<{
  exit: (error?: Error) => void;
  rerender: () => void;
  selection?: unknown;
}>;

function missing(): never {
  throw new InkCompatError(
    "INK_COMPAT_INTERNAL",
    "useApp() was called outside of a render() root (AppContext missing)",
  );
}

function missingRerender(): never {
  throw new InkCompatError(
    "INK_COMPAT_INTERNAL",
    "useApp() was called outside of a render() root (AppContext missing)",
  );
}

const AppContext = React.createContext<AppContextValue>({
  exit: missing,
  rerender: missingRerender,
});

export default AppContext;
