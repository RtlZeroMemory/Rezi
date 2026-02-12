import { useEffect } from "react";
import parseKeypress, { nonAlphanumericKeys } from "../input/parseKeypress.js";
import reconciler from "../reconciler.js";
import type { Key } from "../types.js";
import useStdin from "./useStdin.js";

export type { Key };

type Handler = (input: string, key: Key) => void;
type Options = Readonly<{
  isActive?: boolean;
}>;

/**
 * Ink-compatible `useInput()` implemented on top of Ink-style stdin chunks.
 */
const useInput = (inputHandler: Handler, options: Options = {}) => {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { stdin, setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin();

  useEffect(() => {
    if (options.isActive === false) {
      return;
    }

    setRawMode(true);

    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);

  useEffect(() => {
    if (options.isActive === false) {
      return;
    }

    const handleData = (data: string) => {
      const keypress = parseKeypress(data);

      const key = {
        upArrow: keypress.name === "up",
        downArrow: keypress.name === "down",
        leftArrow: keypress.name === "left",
        rightArrow: keypress.name === "right",
        pageDown: keypress.name === "pagedown",
        pageUp: keypress.name === "pageup",
        home: keypress.name === "home",
        end: keypress.name === "end",
        return: keypress.name === "return",
        escape: keypress.name === "escape",
        ctrl: keypress.ctrl,
        shift: keypress.shift,
        tab: keypress.name === "tab",
        backspace: keypress.name === "backspace",
        delete: keypress.name === "delete",
        // `parseKeypress` parses \u001B\u001B[A (meta + up arrow) as meta = false
        // but with option = true, so we need to take this into account here
        // to avoid breaking changes in Ink.
        // TODO(vadimdemedes): consider removing this in the next major version.
        meta: keypress.meta || keypress.name === "escape" || keypress.option,
        // Kitty keyboard protocol modifiers
        super: keypress.super ?? false,
        hyper: keypress.hyper ?? false,
        capsLock: keypress.capsLock ?? false,
        numLock: keypress.numLock ?? false,
        eventType: keypress.eventType,
      } as Key;

      let input: string;
      if (keypress.isKittyProtocol) {
        // Use text-as-codepoints field for printable keys (needed when
        // reportAllKeysAsEscapeCodes flag is enabled), suppress non-printable
        if (keypress.isPrintable) {
          input = keypress.text ?? keypress.name;
        } else if (keypress.ctrl && keypress.name.length === 1) {
          // Ctrl+letter via codepoint 1-26 form: not printable text, but
          // the letter name must flow through so handlers (e.g. exitOnCtrlC
          // checking `input === 'c' && key.ctrl`) still work.
          input = keypress.name;
        } else {
          input = "";
        }
      } else if (keypress.ctrl) {
        input = keypress.name;
      } else {
        input = keypress.sequence;
      }

      if (!keypress.isKittyProtocol && nonAlphanumericKeys.includes(keypress.name)) {
        input = "";
      }

      // Strip meta if it's still remaining after `parseKeypress`
      // TODO(vadimdemedes): remove this in the next major version.
      if (input.startsWith("\u001B")) {
        input = input.slice(1);
      }

      if (input.length === 1 && typeof input[0] === "string" && /[A-Z]/.test(input[0])) {
        key.shift = true;
      }

      // If app is not supposed to exit on Ctrl+C, then let input listener handle it
      if (!(input === "c" && key.ctrl) || !internal_exitOnCtrlC) {
        // @ts-expect-error TypeScript types for `batchedUpdates` require an argument.
        reconciler.batchedUpdates(() => {
          inputHandler(input, key);
        });
      }
    };

    internal_eventEmitter?.on("input", handleData);

    return () => {
      internal_eventEmitter?.removeListener("input", handleData);
    };
  }, [options.isActive, stdin, internal_exitOnCtrlC, inputHandler]);
};

export default useInput;
