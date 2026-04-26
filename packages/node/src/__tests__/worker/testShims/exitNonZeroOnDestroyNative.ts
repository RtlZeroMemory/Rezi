import { native as baseNative } from "./mockNative.js";

export const native = {
  ...baseNative,

  engineDestroy(_engineId: number): never {
    process.exit(7);
  },
};
