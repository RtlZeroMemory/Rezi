type HookUseEffect = {
  (effect: () => void, deps?: readonly unknown[]): void;
  (effect: () => () => void, deps?: readonly unknown[]): void;
};

type HookUseRef = <T>(initial: T) => { current: T };
type HookUseState = <T>(initial: T | (() => T)) => [T, (v: T | ((prev: T) => T)) => void];

type DataHookContext = Readonly<{
  useEffect: HookUseEffect;
  useRef: HookUseRef;
  useState: HookUseState;
}>;

/**
 * Minimal context required by `useAsync`.
 */
type AsyncHookContext = DataHookContext;

/**
 * Minimal context required by `useStream`.
 */
type StreamHookContext = DataHookContext;

/**
 * Minimal context required by `useInterval`.
 */
type IntervalHookContext = Pick<DataHookContext, "useEffect" | "useRef">;

/**
 * Minimal context required by `useEventSource`.
 */
type EventSourceHookContext = DataHookContext;

/**
 * Minimal context required by `useWebSocket`.
 */
type WebSocketHookContext = DataHookContext;

/**
 * Minimal context required by `useTail`.
 */
type TailHookContext = DataHookContext;

/**
 * Async state returned by `useAsync`.
 */
export type UseAsyncState<T> = Readonly<{
  data: T | undefined;
  loading: boolean;
  error: unknown;
}>;

/**
 * State returned by `useStream`.
 */
export type UseStreamState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  error: unknown;
  done: boolean;
}>;

/**
 * Normalized event payload emitted by `useEventSource`.
 */
export type UseEventSourceMessage = Readonly<{
  type: string;
  data: string;
  lastEventId: string | undefined;
  origin: string | undefined;
}>;

/**
 * Runtime EventSource-like contract used by `useEventSource`.
 */
export type EventSourceLike = Readonly<{
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  close: () => void;
}>;

/**
 * Factory used to create EventSource instances.
 */
export type EventSourceFactory = (
  url: string,
  options: Readonly<{ withCredentials?: boolean }>,
) => EventSourceLike;

/**
 * Options for `useEventSource`.
 */
export type UseEventSourceOptions<T> = Readonly<{
  enabled?: boolean;
  reconnectMs?: number;
  withCredentials?: boolean;
  eventType?: string;
  parse?: (message: UseEventSourceMessage) => T;
  factory?: EventSourceFactory;
}>;

/**
 * State returned by `useEventSource`.
 */
export type UseEventSourceState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
}>;

/**
 * Send payload types accepted by `useWebSocket`.
 */
export type WebSocketSendPayload = string | ArrayBuffer | ArrayBufferView;

/**
 * Runtime WebSocket-like contract used by `useWebSocket`.
 */
export type WebSocketLike = Readonly<{
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  send: (payload: WebSocketSendPayload) => void;
  close: (code?: number, reason?: string) => void;
}>;

/**
 * Factory used to create WebSocket instances.
 */
export type WebSocketFactory = (
  url: string,
  protocol?: string | readonly string[],
) => WebSocketLike;

/**
 * Options for `useWebSocket`.
 */
export type UseWebSocketOptions<T> = Readonly<{
  enabled?: boolean;
  reconnectMs?: number;
  parse?: (payload: unknown) => T;
  factory?: WebSocketFactory;
}>;

/**
 * State returned by `useWebSocket`.
 */
export type UseWebSocketState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
  send: (payload: WebSocketSendPayload) => boolean;
  close: (code?: number, reason?: string) => void;
}>;

/**
 * Tail source contract used by `useTail`.
 */
export type TailSource<T = string> = AsyncIterable<T> &
  Readonly<{
    close?: () => void;
  }>;

/**
 * Factory used to create tail sources for `useTail`.
 */
export type TailSourceFactory<T = string> = (
  filePath: string,
  options: Readonly<{ fromEnd: boolean; pollMs: number }>,
) => TailSource<T>;

/**
 * Options for `useTail`.
 */
export type UseTailOptions<T> = Readonly<{
  enabled?: boolean;
  maxBuffer?: number;
  fromEnd?: boolean;
  pollMs?: number;
  parse?: (chunk: string) => T;
  sourceFactory?: TailSourceFactory<string>;
}>;

/**
 * State returned by `useTail`.
 */
export type UseTailState<T> = Readonly<{
  latest: T | undefined;
  lines: readonly T[];
  dropped: number;
  loading: boolean;
  error: unknown;
}>;

type TailBufferState<T> = Readonly<{
  lines: readonly T[];
  dropped: number;
}>;

const DEFAULT_STREAM_RECONNECT_MS = 1000;
const DEFAULT_TAIL_POLL_MS = 200;
const DEFAULT_TAIL_MAX_BUFFER = 512;

let defaultTailSourceFactory: TailSourceFactory<string> | undefined;

/**
 * Configure the default `useTail` source factory.
 *
 * Runtime packages can register environment-specific tail implementations
 * without introducing Node/browser imports into `@rezi-ui/core`.
 */
export function setDefaultTailSourceFactory(factory: TailSourceFactory<string> | undefined): void {
  defaultTailSourceFactory = factory;
}

function readUnknownProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readUnknownProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === "function";
}

function closeAsyncIterator<T>(iterator: AsyncIterator<T>): void {
  const maybeReturn = iterator.return;
  if (typeof maybeReturn !== "function") return;
  try {
    const maybePromise = maybeReturn.call(iterator);
    if (isPromiseLike(maybePromise)) {
      void maybePromise.catch(() => {
        // Ignore async-iterator close races.
      });
    }
  } catch {
    // Ignore sync close races.
  }
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  return Math.floor(value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

type EventSourceCtor = new (
  url: string,
  options?: Readonly<{ withCredentials?: boolean }>,
) => EventSourceLike;

function resolveEventSourceFactory(
  factory: EventSourceFactory | undefined,
): EventSourceFactory | undefined {
  if (factory) return factory;
  const ctor = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
  if (typeof ctor !== "function") return undefined;
  return (url, options) => new ctor(url, options);
}

function toEventSourceMessage(event: unknown, fallbackType: string): UseEventSourceMessage {
  const rawData = readUnknownProperty(event, "data");

  return {
    type: readStringProperty(event, "type") ?? fallbackType,
    data:
      typeof rawData === "string"
        ? rawData
        : rawData === undefined || rawData === null
          ? ""
          : String(rawData),
    lastEventId: readStringProperty(event, "lastEventId"),
    origin: readStringProperty(event, "origin"),
  };
}

type WebSocketCtor = new (url: string, protocol?: string | string[]) => WebSocketLike;

function resolveWebSocketFactory(
  factory: WebSocketFactory | undefined,
): WebSocketFactory | undefined {
  if (factory) return factory;
  const ctor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (typeof ctor !== "function") return undefined;
  return (url, protocol) => {
    const normalizedProtocol = Array.isArray(protocol) ? Array.from(protocol) : protocol;
    return new ctor(url, normalizedProtocol as string | string[] | undefined);
  };
}

function toWebSocketPayload(event: unknown): unknown {
  if (!event || typeof event !== "object") return event;
  if (!("data" in event)) return event;
  return readUnknownProperty(event, "data");
}

/**
 * Run an async operation when dependencies change.
 *
 * - Sets `loading` to `true` while the operation is in-flight
 * - Stores resolved value in `data`
 * - Stores thrown/rejected value in `error`
 * - Ignores stale completions from older dependency runs
 */
export function useAsync<T>(
  ctx: AsyncHookContext,
  task: () => Promise<T>,
  deps: readonly unknown[],
): UseAsyncState<T> {
  const [data, setData] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  ctx.useEffect(() => {
    let cancelled = false;
    runIdRef.current += 1;
    const runId = runIdRef.current;

    setLoading(true);
    setError(undefined);

    Promise.resolve()
      .then(() => task())
      .then((nextData) => {
        if (cancelled || runIdRef.current !== runId) return;
        setData(nextData);
        setLoading(false);
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return {
    data,
    loading,
    error,
  };
}

/**
 * Subscribe to an async iterable and re-render on each value.
 *
 * - Sets `loading` while waiting for the first value
 * - Stores the latest stream item in `value`
 * - Sets `done` when iteration completes
 * - Ignores stale values if a newer subscription replaces the stream
 */
export function useStream<T>(
  ctx: StreamHookContext,
  stream: AsyncIterable<T> | undefined,
  deps?: readonly unknown[],
): UseStreamState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(stream !== undefined);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const [done, setDone] = ctx.useState<boolean>(stream === undefined);
  const runIdRef = ctx.useRef(0);

  const effectDeps = deps ?? [stream];

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!stream) {
      setLoading(false);
      setDone(true);
      setError(undefined);
      return;
    }

    let cancelled = false;
    let iterator: AsyncIterator<T> | undefined;

    setLoading(true);
    setDone(false);
    setError(undefined);

    void Promise.resolve()
      .then(() => {
        iterator = stream[Symbol.asyncIterator]();
      })
      .then(async () => {
        if (!iterator) return;
        while (true) {
          const next = await iterator.next();
          if (cancelled || runIdRef.current !== runId) return;
          if (next.done) {
            setLoading(false);
            setDone(true);
            return;
          }
          setValue(next.value);
          setLoading(false);
        }
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
        setDone(true);
      });

    return () => {
      cancelled = true;
      if (iterator) {
        closeAsyncIterator(iterator);
      }
    };
  }, effectDeps);

  return {
    value,
    loading,
    error,
    done,
  };
}

/**
 * Register an interval callback with automatic cleanup.
 *
 * The latest callback is always invoked without requiring interval resubscribe.
 */
export function useInterval(ctx: IntervalHookContext, fn: () => void, ms: number): void {
  const callbackRef = ctx.useRef(fn);

  ctx.useEffect(() => {
    callbackRef.current = fn;
  }, [fn]);

  ctx.useEffect(() => {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }

    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      callbackRef.current();
    }, ms);

    return () => {
      clearInterval(intervalId);
    };
  }, [ms]);
}

/**
 * Subscribe to a server-sent-events endpoint with automatic reconnect.
 */
export function useEventSource<T = string>(
  ctx: EventSourceHookContext,
  url: string,
  options: UseEventSourceOptions<T> = {},
): UseEventSourceState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [connected, setConnected] = ctx.useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = ctx.useState(0);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  const enabled = options.enabled ?? true;
  const reconnectMs = normalizeNonNegativeInteger(options.reconnectMs, DEFAULT_STREAM_RECONNECT_MS);
  const eventType = options.eventType ?? "message";
  const parse = options.parse;

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!enabled || url.length === 0) {
      setLoading(false);
      setConnected(false);
      setReconnectAttempts(0);
      setError(undefined);
      return;
    }

    const createSource = resolveEventSourceFactory(options.factory);
    if (!createSource) {
      setLoading(false);
      setConnected(false);
      setError(new Error("useEventSource: EventSource is unavailable in this runtime."));
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSourceLike | null = null;
    let detachListeners: (() => void) | undefined;
    let attempt = 0;

    const closeSource = () => {
      if (detachListeners) {
        detachListeners();
        detachListeners = undefined;
      }
      if (source) {
        try {
          source.close();
        } catch {
          // Ignore close races.
        }
        source = null;
      }
    };

    const scheduleReconnect = (reason: unknown) => {
      if (cancelled || runIdRef.current !== runId) return;
      setConnected(false);
      setLoading(true);
      setError(reason);
      attempt += 1;
      setReconnectAttempts(attempt);

      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectMs);
    };

    const connect = () => {
      if (cancelled || runIdRef.current !== runId) return;

      try {
        source = createSource(
          url,
          options.withCredentials === undefined ? {} : { withCredentials: options.withCredentials },
        );
      } catch (nextError) {
        scheduleReconnect(nextError);
        return;
      }

      const onOpen = () => {
        if (cancelled || runIdRef.current !== runId) return;
        setConnected(true);
        setLoading(false);
        setError(undefined);
      };

      const onMessage = (rawEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        try {
          const message = toEventSourceMessage(rawEvent, eventType);
          const parsed = parse ? parse(message) : (message.data as unknown as T);
          setValue(parsed);
          setLoading(false);
          setError(undefined);
        } catch (nextError) {
          setError(nextError);
        }
      };

      const onError = (nextError: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        closeSource();
        scheduleReconnect(nextError);
      };

      source.addEventListener("open", onOpen);
      source.addEventListener(eventType, onMessage);
      source.addEventListener("error", onError);

      detachListeners = () => {
        if (!source) return;
        source.removeEventListener("open", onOpen);
        source.removeEventListener(eventType, onMessage);
        source.removeEventListener("error", onError);
      };
    };

    setLoading(true);
    setConnected(false);
    setReconnectAttempts(0);
    setError(undefined);
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      closeSource();
    };
  }, [url, enabled, reconnectMs, eventType, parse, options.factory, options.withCredentials]);

  return {
    value,
    loading,
    connected,
    reconnectAttempts,
    error,
  };
}

/**
 * Subscribe to a websocket endpoint with message parsing and auto-reconnect.
 */
export function useWebSocket<T = string>(
  ctx: WebSocketHookContext,
  url: string,
  protocol?: string | readonly string[],
  options: UseWebSocketOptions<T> = {},
): UseWebSocketState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [connected, setConnected] = ctx.useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = ctx.useState(0);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);
  const socketRef = ctx.useRef<WebSocketLike | null>(null);
  const manualCloseRef = ctx.useRef(false);
  const reconnectTimerRef = ctx.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendRef = ctx.useRef<((payload: WebSocketSendPayload) => boolean) | undefined>(undefined);
  const closeRef = ctx.useRef<((code?: number, reason?: string) => void) | undefined>(undefined);

  if (!sendRef.current) {
    sendRef.current = (payload: WebSocketSendPayload): boolean => {
      const socket = socketRef.current;
      if (!socket) return false;
      try {
        socket.send(payload);
        return true;
      } catch (nextError) {
        setError(nextError);
        return false;
      }
    };
  }

  if (!closeRef.current) {
    closeRef.current = (code?: number, reason?: string): void => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      const socket = socketRef.current;
      if (!socket) return;
      try {
        socket.close(code, reason);
      } catch (nextError) {
        setError(nextError);
      } finally {
        socketRef.current = null;
      }
    };
  }

  const enabled = options.enabled ?? true;
  const reconnectMs = normalizeNonNegativeInteger(options.reconnectMs, DEFAULT_STREAM_RECONNECT_MS);
  const parse = options.parse;

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    manualCloseRef.current = false;

    if (!enabled || url.length === 0) {
      setLoading(false);
      setConnected(false);
      setReconnectAttempts(0);
      setError(undefined);
      return;
    }

    const createSocket = resolveWebSocketFactory(options.factory);
    if (!createSocket) {
      setLoading(false);
      setConnected(false);
      setError(new Error("useWebSocket: WebSocket is unavailable in this runtime."));
      return;
    }

    let cancelled = false;
    let detachListeners: (() => void) | undefined;
    let attempt = 0;

    const closeSocket = () => {
      if (detachListeners) {
        detachListeners();
        detachListeners = undefined;
      }

      const socket = socketRef.current;
      if (!socket) return;
      try {
        socket.close();
      } catch {
        // Ignore close races.
      } finally {
        socketRef.current = null;
      }
    };

    const scheduleReconnect = (reason: unknown) => {
      if (cancelled || runIdRef.current !== runId || manualCloseRef.current) return;
      setConnected(false);
      setLoading(true);
      setError(reason);
      attempt += 1;
      setReconnectAttempts(attempt);

      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = undefined;
        connect();
      }, reconnectMs);
    };

    const connect = () => {
      if (cancelled || runIdRef.current !== runId || manualCloseRef.current) return;

      let socket: WebSocketLike;
      try {
        socket = createSocket(url, protocol);
      } catch (nextError) {
        scheduleReconnect(nextError);
        return;
      }

      socketRef.current = socket;

      const onOpen = () => {
        if (cancelled || runIdRef.current !== runId) return;
        setConnected(true);
        setLoading(false);
        setError(undefined);
      };

      const onMessage = (rawEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        try {
          const payload = toWebSocketPayload(rawEvent);
          const parsed = parse ? parse(payload) : (payload as unknown as T);
          setValue(parsed);
          setLoading(false);
          setError(undefined);
        } catch (nextError) {
          setError(nextError);
        }
      };

      const onError = (nextError: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
      };

      const onClose = (nextEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        socketRef.current = null;
        setConnected(false);
        if (manualCloseRef.current) {
          setLoading(false);
          return;
        }
        scheduleReconnect(nextEvent);
      };

      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);

      detachListeners = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
      };
    };

    setLoading(true);
    setConnected(false);
    setReconnectAttempts(0);
    setError(undefined);
    connect();

    return () => {
      cancelled = true;
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      closeSocket();
    };
  }, [url, protocol, enabled, reconnectMs, parse, options.factory]);

  return {
    value,
    loading,
    connected,
    reconnectAttempts,
    error,
    send: sendRef.current ?? (() => false),
    close: closeRef.current ?? (() => {}),
  };
}

/**
 * Tail a file source and retain a bounded in-memory line buffer.
 *
 * Backpressure behavior: when incoming line rate exceeds the configured
 * `maxBuffer`, the oldest lines are dropped and counted in `dropped`.
 */
export function useTail<T = string>(
  ctx: TailHookContext,
  filePath: string,
  options: UseTailOptions<T> = {},
): UseTailState<T> {
  const [latest, setLatest] = ctx.useState<T | undefined>(undefined);
  const [buffer, setBuffer] = ctx.useState<TailBufferState<T>>({
    lines: [],
    dropped: 0,
  });
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  const enabled = options.enabled ?? true;
  const maxBuffer = normalizePositiveInteger(options.maxBuffer, DEFAULT_TAIL_MAX_BUFFER);
  const fromEnd = options.fromEnd ?? true;
  const pollMs = normalizePositiveInteger(options.pollMs, DEFAULT_TAIL_POLL_MS);
  const parse = options.parse;

  ctx.useEffect(() => {
    setLatest(undefined);
    setBuffer({
      lines: [],
      dropped: 0,
    });
  }, [filePath]);

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!enabled || filePath.length === 0) {
      setLoading(false);
      setError(undefined);
      return;
    }

    const createTailSource = options.sourceFactory ?? defaultTailSourceFactory;
    if (!createTailSource) {
      setLoading(false);
      setError(
        new Error(
          "useTail: no tail source factory configured. Import @rezi-ui/node or pass options.sourceFactory.",
        ),
      );
      return;
    }

    let cancelled = false;
    let source: TailSource<string> | undefined;
    let iterator: AsyncIterator<string> | undefined;

    setLoading(true);
    setError(undefined);

    void Promise.resolve()
      .then(() => {
        source = createTailSource(filePath, {
          fromEnd,
          pollMs,
        });
        iterator = source[Symbol.asyncIterator]();
      })
      .then(async () => {
        if (!iterator) return;

        while (true) {
          const next = await iterator.next();
          if (cancelled || runIdRef.current !== runId) return;
          if (next.done) {
            setLoading(false);
            return;
          }

          const parsed = parse ? parse(next.value) : (next.value as unknown as T);
          setLatest(parsed);
          setBuffer((previous) => {
            const nextLines = [...previous.lines, parsed];
            if (nextLines.length <= maxBuffer) {
              return {
                lines: nextLines,
                dropped: previous.dropped,
              };
            }

            const overflow = nextLines.length - maxBuffer;
            return {
              lines: nextLines.slice(overflow),
              dropped: previous.dropped + overflow,
            };
          });
          setLoading(false);
        }
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (source && typeof source.close === "function") {
        try {
          source.close();
        } catch {
          // Ignore source close races.
        }
      }
      if (iterator) {
        closeAsyncIterator(iterator);
      }
    };
  }, [filePath, enabled, maxBuffer, fromEnd, pollMs, parse, options.sourceFactory]);

  return {
    latest,
    lines: buffer.lines,
    dropped: buffer.dropped,
    loading,
    error,
  };
}
