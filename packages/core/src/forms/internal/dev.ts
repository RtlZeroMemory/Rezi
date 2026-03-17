const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";

export const DEV_MODE = NODE_ENV !== "production";

export function warnDev(message: string): void {
  if (!DEV_MODE) return;
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

export function formatErrorForDev(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  try {
    return String(error);
  } catch {
    return "[unstringifiable thrown value]";
  }
}
