import { EventEmitter } from "node:events";
import process from "node:process";
import React from "react";

export type StdioContextValue = Readonly<{
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;

  internal_writeToStdout: (data: string) => void;
  internal_writeToStderr: (data: string) => void;

  setRawMode: (value: boolean) => void;
  isRawModeSupported: boolean;

  internal_exitOnCtrlC: boolean;
  internal_eventEmitter: EventEmitter;
}>;

const StdioContext = React.createContext<StdioContextValue>({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  internal_writeToStdout: (data: string) => {
    try {
      process.stdout.write(data);
    } catch {
      // ignore
    }
  },
  internal_writeToStderr: (data: string) => {
    try {
      process.stderr.write(data);
    } catch {
      // ignore
    }
  },
  setRawMode() {},
  isRawModeSupported: false,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  internal_exitOnCtrlC: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  internal_eventEmitter: new EventEmitter(),
});

export function useRequiredStdioContext(): StdioContextValue {
  return React.useContext(StdioContext);
}

export default StdioContext;
