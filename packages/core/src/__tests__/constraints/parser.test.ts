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

function parserBootstrapError(error: unknown): Error {
  return new Error(`Failed to load parser constraint test bootstrap: ${describeThrown(error)}`);
}

const require = createRequire(import.meta.url);
const tsImplPath = fileURLToPath(new URL("./parser.test.impl.ts", import.meta.url));
const jsImplPath = fileURLToPath(new URL("./parser.test.impl.js", import.meta.url));

try {
  if (existsSync(tsImplPath)) {
    require("tsx/cjs");
    require(tsImplPath);
  } else if (existsSync(jsImplPath)) {
    void import("./parser.test.impl.js").catch((error: unknown) => {
      process.nextTick(() => {
        throw parserBootstrapError(error);
      });
    });
  } else {
    throw new Error("Missing parser constraint test implementation");
  }
} catch (error: unknown) {
  throw parserBootstrapError(error);
}
