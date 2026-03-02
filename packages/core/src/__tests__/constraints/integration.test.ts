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

const require = createRequire(import.meta.url);
const tsImplPath = fileURLToPath(new URL("./integration.test.impl.ts", import.meta.url));
const jsImplPath = fileURLToPath(new URL("./integration.test.impl.js", import.meta.url));

try {
  if (existsSync(tsImplPath)) {
    require("tsx/cjs");
    require(tsImplPath);
  } else if (existsSync(jsImplPath)) {
    require(jsImplPath);
  } else {
    throw new Error("Missing integration constraint test implementation");
  }
} catch (error: unknown) {
  throw new Error(`Failed to load integration constraint test bootstrap: ${describeThrown(error)}`);
}
