import { createRequire } from "node:module";
import { Stream } from "node:stream";

import { type RenderOptions as InkRenderOptions, type Instance, render as inkRender } from "ink";

const require = createRequire(import.meta.url);
const inkRequire = createRequire(require.resolve("ink"));
const InkReact = inkRequire("react") as typeof import("react");
const CompatReact = require("react") as typeof import("react");

type InkReactInternals = Readonly<{
  ReactCurrentDispatcher?: Readonly<{ current: unknown }>;
}>;

type CompatReactInternals = {
  H?: unknown;
};

const inkInternals = (
  InkReact as typeof InkReact & {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: InkReactInternals;
  }
).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const compatInternals = (
  CompatReact as typeof CompatReact & {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: CompatReactInternals;
  }
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

let lastKnownCompatDispatcher: unknown;

type InkNode = Parameters<typeof inkRender>[0];

type CompatWriteStream = NodeJS.WritableStream &
  Partial<
    Pick<
      NodeJS.WriteStream,
      "isTTY" | "columns" | "rows" | "clearLine" | "clearScreenDown" | "cursorTo" | "moveCursor"
    >
  >;

type CompatReadStream = NodeJS.ReadableStream &
  Partial<Pick<NodeJS.ReadStream, "isTTY" | "setRawMode" | "isRaw">>;

export type RenderOptions = Omit<InkRenderOptions, "stdout" | "stderr" | "stdin"> &
  Readonly<{
    stdout?: NodeJS.WriteStream | CompatWriteStream;
    stdin?: NodeJS.ReadStream | CompatReadStream;
    stderr?: NodeJS.WriteStream | CompatWriteStream;
    onRender?: () => void;
  }>;

type RenderTarget = Stream | RenderOptions | undefined;
type ResolvedStreams = Readonly<{
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
}>;

export type RenderResult = Instance &
  Readonly<{
    stdout: NodeJS.WriteStream;
    stderr: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
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

  const runWithCompatDispatcher = <T>(action: () => T): T => {
    const dispatcher = inkInternals?.ReactCurrentDispatcher?.current;
    if (dispatcher !== null && dispatcher !== undefined) {
      lastKnownCompatDispatcher = dispatcher;
    }

    const compatDispatcher = dispatcher ?? lastKnownCompatDispatcher;

    if (!compatInternals || compatDispatcher === undefined || CompatReact === InkReact) {
      return action();
    }

    compatInternals.H = compatDispatcher;
    return action();
  };

  const wrapped = (props: Record<string, unknown>) => {
    const rendered = runWithCompatDispatcher(() =>
      (typeFn as (componentProps: Record<string, unknown>) => unknown)(props),
    );
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

function getOnRender(options: RenderTarget): (() => void) | undefined {
  if (!options || options instanceof Stream) {
    return undefined;
  }

  if (typeof options.onRender === "function") {
    return options.onRender;
  }

  return undefined;
}

function resolveStreams(options: RenderTarget): ResolvedStreams {
  if (options instanceof Stream) {
    return {
      stdout: options as unknown as NodeJS.WriteStream,
      stderr: process.stderr,
      stdin: process.stdin,
    };
  }

  if (!options) {
    return {
      stdout: process.stdout,
      stderr: process.stderr,
      stdin: process.stdin,
    };
  }

  return {
    stdout: (options.stdout ?? process.stdout) as NodeJS.WriteStream,
    stderr: (options.stderr ?? process.stderr) as NodeJS.WriteStream,
    stdin: (options.stdin ?? process.stdin) as NodeJS.ReadStream,
  };
}

function toInkOptions(options: RenderTarget): NodeJS.WriteStream | InkRenderOptions | undefined {
  if (!options || options instanceof Stream) {
    return options as unknown as NodeJS.WriteStream | undefined;
  }

  const {
    onRender: _onRender,
    stdout,
    stderr,
    stdin,
    ...otherOptions
  } = options as RenderOptions & Record<string, unknown>;

  return {
    ...otherOptions,
    stdout: stdout as NodeJS.WriteStream | undefined,
    stderr: stderr as NodeJS.WriteStream | undefined,
    stdin: stdin as NodeJS.ReadStream | undefined,
  } as InkRenderOptions;
}

export function render(node: InkNode, options?: Stream | RenderOptions): RenderResult {
  const onRender = getOnRender(options);
  const streams = resolveStreams(options);
  const instance = inkRender(normalizeReactNode(node) as InkNode, toInkOptions(options));
  const swallowClearErrors = (streams.stdout as { isTTY?: unknown }).isTTY !== true;

  onRender?.();

  let cleanedUp = false;
  const rerender: Instance["rerender"] = (nextNode) => {
    instance.rerender(normalizeReactNode(nextNode) as InkNode);
    onRender?.();
  };

  return {
    rerender,
    unmount: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
    stdout: streams.stdout,
    stderr: streams.stderr,
    stdin: streams.stdin,
    clear: () => {
      try {
        instance.clear();
      } catch (error) {
        if (!swallowClearErrors) throw error;
      }
    },
    cleanup: () => {
      if (cleanedUp) return;
      cleanedUp = true;
      instance.cleanup();
    },
  };
}

export type { Instance };
