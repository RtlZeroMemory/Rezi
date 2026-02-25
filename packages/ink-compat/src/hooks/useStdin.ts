import type { Readable } from "node:stream";
import type tty from "node:tty";

import { useInkContext } from "../runtime/context.js";

export function useStdin(): {
  stdin: tty.ReadStream;
  isRawModeSupported: boolean;
  setRawMode: (enabled: boolean) => void;
} {
  const ctx = useInkContext();
  // The actual stdin may be process.stdin (a ReadStream) or a mock PassThrough.
  // We cast to ReadStream to match Ink's typing — callers already guard with isRawModeSupported.
  return {
    stdin: ctx.stdin as unknown as tty.ReadStream,
    isRawModeSupported: ctx.isRawModeSupported,
    setRawMode: ctx.setRawMode,
  };
}
