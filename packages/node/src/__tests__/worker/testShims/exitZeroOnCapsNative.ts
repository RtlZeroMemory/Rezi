import { native as baseNative } from "./mockNative.js";

export const native = {
  ...baseNative,

  engineGetCaps(_engineId: number): never {
    process.exit(0);
  },
};
