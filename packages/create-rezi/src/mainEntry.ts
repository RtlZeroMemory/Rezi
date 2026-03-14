import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolveCanonicalPath(pathValue: string): string {
  try {
    return realpathSync(pathValue);
  } catch {
    return pathValue;
  }
}

export function isMainModuleEntry(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) {
    return false;
  }
  const modulePath = resolveCanonicalPath(fileURLToPath(moduleUrl));
  const entryPath = resolveCanonicalPath(resolve(argvPath));
  return modulePath === entryPath;
}
