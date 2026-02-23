import type { DrawApi } from "../drawApi.js";
import type { UiEvent } from "../events.js";
import type {
  BindingMap,
  KeyContext,
  ModeBindingMap,
  RegisteredBinding,
} from "../keybindings/index.js";
import type { Rect } from "../layout/types.js";
import type { RouteDefinition, RouterApi } from "../router/types.js";
import type { FocusInfo } from "../runtime/widgetMeta.js";
import type { TerminalProfile } from "../terminalProfile.js";
import type { Theme } from "../theme/theme.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import type { VNode } from "../widgets/types.js";

export type ViewFn<S> = (state: Readonly<S>) => VNode;
export type DrawFn = (g: DrawApi) => void;
export type EventHandler = (ev: UiEvent) => void;
export type FocusChangeHandler = (info: FocusInfo) => void;
export type AppRenderMetrics = Readonly<{ renderTime: number }>;
export type AppLayoutSnapshot = Readonly<{ idRects: ReadonlyMap<string, Rect> }>;
export type MiddlewareContext<S> = Readonly<{
  getState(): Readonly<S>;
  update(updater: S | ((prev: Readonly<S>) => S)): void;
}>;

export type Middleware<S> = (event: UiEvent, ctx: MiddlewareContext<S>, next: () => void) => void;

export type Thunk<S> = (
  dispatch: (action: Thunk<S> | S | ((prev: Readonly<S>) => S)) => void,
  getState: () => Readonly<S>,
) => void | Promise<void>;

export type AppConfig = Readonly<{
  fpsCap?: number;
  maxEventBytes?: number;
  maxDrawlistBytes?: number;
  rootPadding?: number;
  breakpoints?: Readonly<{
    smMax?: number;
    mdMax?: number;
    lgMax?: number;
  }>;
  useV2Cursor?: boolean;
  drawlistValidateParams?: boolean;
  drawlistReuseOutputBuffer?: boolean;
  drawlistEncodedStringCacheCap?: number;
  maxFramesInFlight?: number;
  internal_onRender?: (metrics: AppRenderMetrics) => void;
  internal_onLayout?: (snapshot: AppLayoutSnapshot) => void;
}>;

export interface App<S> {
  view(fn: ViewFn<S>): void;
  replaceView(fn: ViewFn<S>): void;
  replaceRoutes(routes: readonly RouteDefinition<S>[]): void;
  draw(fn: DrawFn): void;
  onEvent(handler: EventHandler): () => void;
  /**
   * Register a middleware that intercepts events before they reach handlers.
   * Middleware receives the event and a `next()` function.
   * Call `next()` to pass the event to the next middleware / default processing.
   * Omit `next()` to suppress the event.
   * Returns an unsubscribe function.
   */
  use(middleware: Middleware<S>): () => void;
  /**
   * Read current committed state (useful in middleware and event handlers).
   */
  getState(): Readonly<S>;
  onFocusChange(handler: FocusChangeHandler): () => void;
  update(updater: S | ((prev: Readonly<S>) => S)): void;
  /**
   * Dispatch a state update or an async thunk.
   * - If passed a function with 2 params (dispatch, getState): treated as thunk
   * - If passed a state value or updater: equivalent to app.update()
   */
  dispatch(action: Thunk<S> | S | ((prev: Readonly<S>) => S)): void;
  setTheme(theme: Theme | ThemeDefinition): void;
  debugLayout(enabled?: boolean): boolean;
  start(): Promise<void>;
  run(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
  keys(bindings: BindingMap<KeyContext<S>>): void;
  modes(modes: ModeBindingMap<KeyContext<S>>): void;
  setMode(modeName: string): void;
  getMode(): string;
  getBindings(mode?: string): readonly RegisteredBinding[];
  readonly pendingChord: string | null;
  getTerminalProfile(): TerminalProfile;
  readonly router?: RouterApi;
}
