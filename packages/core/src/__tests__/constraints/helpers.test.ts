import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

function describeThrown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return String(value);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

function helpersBootstrapError(error: unknown): Error {
  return new Error(`Failed to load helpers constraint test bootstrap: ${describeThrown(error)}`);
}

const require = createRequire(import.meta.url);
const tsImplPath = fileURLToPath(new URL("./helpers.test.impl.ts", import.meta.url));
const jsImplPath = fileURLToPath(new URL("./helpers.test.impl.js", import.meta.url));

try {
  if (existsSync(tsImplPath)) {
    require("tsx/cjs");
    require(tsImplPath);
  } else if (existsSync(jsImplPath)) {
    void import("./helpers.test.impl.js").catch((error: unknown) => {
      process.nextTick(() => {
        throw helpersBootstrapError(error);
      });
    });
  } else {
    throw new Error("Missing helpers constraint test implementation");
  }
} catch (error: unknown) {
  throw helpersBootstrapError(error);
}
