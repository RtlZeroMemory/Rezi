import React from "react";

type BackgroundColor = string;

const BackgroundContext = React.createContext<BackgroundColor | undefined>(undefined);

export default BackgroundContext;
