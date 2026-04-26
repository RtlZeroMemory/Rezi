const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";

function warnDev(message: string): void {
  if (!DEV_MODE) return;
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

function describeThrown(v: unknown): string {
  if (v instanceof Error) return v.message;
  try {
    return String(v);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

export function invokeCallbackSafely<TArgs extends readonly unknown[]>(
  name: string,
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): boolean {
  if (typeof callback !== "function") return false;
  try {
    callback(...args);
    return true;
  } catch (e) {
    const message = describeThrown(e);
    warnDev(`[rezi] ${name} callback threw: ${message}`);
    return false;
  }
}
