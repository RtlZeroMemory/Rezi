import React from "react";
import AppContext from "../context/AppContext.js";
import type { AppProps } from "../types.js";

export default function useApp(): AppProps {
  return React.useContext(AppContext);
}
