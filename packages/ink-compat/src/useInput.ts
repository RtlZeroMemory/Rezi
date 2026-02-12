import { type Key as InkKey, useInput as inkUseInput } from "ink";

import { type InkCompatKey, normalizeKey } from "./keyNormalization.js";

type InkUseInputOptions = Parameters<typeof inkUseInput>[1];

export type InputHandler = (input: string, key: InkCompatKey) => void;

export function useInput(inputHandler: InputHandler, options?: InkUseInputOptions): void {
  inkUseInput((input: string, key: InkKey) => {
    inputHandler(input, normalizeKey(key));
  }, options);
}
