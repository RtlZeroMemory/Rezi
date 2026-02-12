import React from "react";

export type AppContextValue = Readonly<{
  /**
   * Exit (unmount) the whole Ink app.
   */
  exit: (error?: Error) => void;
}>;

const AppContext = React.createContext<AppContextValue>({
  exit() {},
});

export default AppContext;
