import { open, stat } from "node:fs/promises";
import type { TailSource, TailSourceFactory } from "@rezi-ui/core";

const DEFAULT_POLL_MS = 200;
const READ_CHUNK_BYTES = 64 * 1024;

type SleepState = Readonly<{
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (() => void) | null;
}>;

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function isNodeErrorWithCode(error: unknown): error is Readonly<{ code: string }> {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string";
}

async function readUtf8Slice(filePath: string, start: number, end: number): Promise<string> {
  if (end <= start) return "";

  const handle = await open(filePath, "r");
  let offset = start;
  let output = "";

  try {
    while (offset < end) {
      const bytesToRead = Math.min(READ_CHUNK_BYTES, end - offset);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
      if (bytesRead <= 0) break;
      output += buffer.toString("utf8", 0, bytesRead);
      offset += bytesRead;
    }
    return output;
  } finally {
    await handle.close();
  }
}

/**
 * Node.js tail source factory for `useTail`.
 */
export const createNodeTailSource: TailSourceFactory<string> = (
  filePath,
  options,
): TailSource<string> => {
  const pollMs = normalizePositiveInteger(options.pollMs, DEFAULT_POLL_MS);
  const fromEnd = options.fromEnd;

  let closed = false;
  let sleepState: SleepState = { timer: null, resolve: null };

  const wakeSleep = (): void => {
    if (sleepState.timer !== null) {
      clearTimeout(sleepState.timer);
    }
    if (sleepState.resolve) {
      sleepState.resolve();
    }
    sleepState = { timer: null, resolve: null };
  };

  const sleep = async (ms: number): Promise<void> => {
    if (ms <= 0) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        sleepState = { timer: null, resolve: null };
        resolve();
      }, ms);
      sleepState = { timer, resolve };
    });
  };

  async function* iterator(): AsyncGenerator<string> {
    let initialized = false;
    let offset = 0;
    let carry = "";

    while (!closed) {
      let fileSize: number;
      try {
        const stats = await stat(filePath);
        fileSize = Number(stats.size);
      } catch (error) {
        if (isNodeErrorWithCode(error) && error.code === "ENOENT") {
          await sleep(pollMs);
          continue;
        }
        throw error;
      }

      if (!initialized) {
        initialized = true;
        offset = fromEnd ? fileSize : 0;
      }

      if (fileSize < offset) {
        // File was truncated/rotated.
        offset = 0;
        carry = "";
      }

      if (fileSize > offset) {
        const delta = await readUtf8Slice(filePath, offset, fileSize);
        offset = fileSize;
        const segments = `${carry}${delta}`.split(/\r?\n/);
        carry = segments.pop() ?? "";
        for (const line of segments) {
          if (closed) return;
          yield line;
        }
      }

      await sleep(pollMs);
    }
  }

  return {
    [Symbol.asyncIterator]: iterator,
    close: () => {
      closed = true;
      wakeSleep();
    },
  };
};
