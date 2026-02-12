import { createRequire } from "node:module";
import { PassThrough, Writable } from "node:stream";

import { type RenderOptions, render } from "../index.js";

const require = createRequire(import.meta.url);
const inkRequire = createRequire(require.resolve("ink"));
const InkReact = inkRequire("react") as typeof import("react");

export class MemoryWriteStream extends Writable {
  public isTTY: boolean;
  public columns: number;

  private readonly chunks: string[] = [];

  constructor(opts: Readonly<{ isTTY: boolean; columns?: number }>) {
    super();
    this.isTTY = opts.isTTY;
    this.columns = opts.columns ?? 80;
  }

  _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    callback();
  }

  public output(): string {
    return this.chunks.join("");
  }

  public lastChunk(): string {
    return this.chunks.at(-1) ?? "";
  }

  public getColorDepth(_env?: Record<string, unknown>): number {
    return this.isTTY ? 8 : 1;
  }

  public hasColors(_count?: number, _env?: Record<string, unknown>): boolean {
    return this.isTTY;
  }
}

export function createStdin(isTTY: boolean): PassThrough & NodeJS.ReadStream {
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
  stdin.isTTY = isTTY;
  stdin.isRaw = false;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  stdin.setRawMode = (mode: boolean) => {
    stdin.isRaw = mode;
    return stdin;
  };
  stdin.setEncoding("utf8");
  stdin.resume();
  return stdin;
}

export async function flushTurns(turns = 3): Promise<void> {
  for (let index = 0; index < turns; index++) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

export function stripAnsi(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index++) {
    const current = value[index];
    const next = value[index + 1];

    if (current === "\u001B" && next === "[") {
      index += 2;

      while (index < value.length) {
        const code = value.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }

        index++;
      }

      continue;
    }

    result += current;
  }

  return result;
}

export type RenderTestingResult = Readonly<{
  stdin: PassThrough & NodeJS.ReadStream;
  rerender: (node: unknown) => void;
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
  clear: () => void;
  cleanup: () => void;
  lastFrame: () => string;
}>;

type RenderTestingOptions = Omit<RenderOptions, "stdout" | "stderr" | "stdin"> &
  Readonly<{
    stdout?: MemoryWriteStream;
    stderr?: MemoryWriteStream;
    stdin?: PassThrough & NodeJS.ReadStream;
  }>;

type ElementLike = Readonly<{
  $$typeof: unknown;
  type: unknown;
  key: unknown;
  ref?: unknown;
  props: Record<string, unknown>;
}>;

type AnyFunction = (...args: unknown[]) => unknown;
type ReactClassLike = { prototype?: { isReactComponent?: unknown } };
const refProp = "ref";
const keyProp = "key";

const callbackCache = new WeakMap<AnyFunction, AnyFunction>();
const componentTypeCache = new WeakMap<AnyFunction, AnyFunction>();

function isElementLike(value: unknown): value is ElementLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "$$typeof" in value && "type" in value && "props" in value;
}

function normalizeCallback(fn: AnyFunction): AnyFunction {
  const cached = callbackCache.get(fn);
  if (cached) {
    return cached;
  }

  const wrapped = (...args: unknown[]) => normalizeReactNode(fn(...args));
  callbackCache.set(fn, wrapped);
  return wrapped;
}

function isClassComponent(value: unknown): value is { new (...args: unknown[]): unknown } {
  if (typeof value !== "function") {
    return false;
  }

  return Boolean((value as ReactClassLike).prototype?.isReactComponent);
}

function normalizeElementType(type: unknown): unknown {
  if (typeof type !== "function" || isClassComponent(type)) {
    return type;
  }

  const typeFn = type as AnyFunction;
  const cached = componentTypeCache.get(typeFn);
  if (cached) {
    return cached;
  }

  const wrapped = (props: Record<string, unknown>) => {
    const rendered = (typeFn as (componentProps: Record<string, unknown>) => unknown)(props);
    return normalizeReactNode(rendered);
  };

  componentTypeCache.set(typeFn, wrapped as AnyFunction);
  return wrapped;
}

function normalizeProps(source: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "function") {
      props[key] = normalizeCallback(value as AnyFunction);
      continue;
    }

    if (key === "children") {
      props[key] = normalizeReactNode(value);
      continue;
    }

    props[key] = value;
  }

  return props;
}

function normalizeReactNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => normalizeReactNode(entry));
  }

  if (isElementLike(node)) {
    const props = normalizeProps(node.props);

    if (node.ref !== null && node.ref !== undefined) {
      props[refProp] = node.ref;
    }

    if (node.key !== null && node.key !== undefined) {
      props[keyProp] = node.key;
    }

    return InkReact.createElement(normalizeElementType(node.type) as never, props);
  }

  return node;
}

export function renderTesting(
  node: unknown,
  options: RenderTestingOptions = {},
): RenderTestingResult {
  const stdout = options.stdout ?? new MemoryWriteStream({ isTTY: false, columns: 80 });
  const stderr = options.stderr ?? new MemoryWriteStream({ isTTY: false, columns: 80 });
  const stdin = options.stdin ?? createStdin(true);

  const app = render(normalizeReactNode(node) as Parameters<typeof render>[0], {
    ...options,
    stdout,
    stderr,
    stdin,
    debug: options.debug ?? true,
  });

  return {
    stdin,
    rerender: (nextNode) => {
      app.rerender(normalizeReactNode(nextNode) as Parameters<typeof render>[0]);
    },
    unmount: app.unmount,
    waitUntilExit: app.waitUntilExit,
    clear: app.clear,
    cleanup: app.cleanup,
    lastFrame: () => stdout.lastChunk(),
  };
}
