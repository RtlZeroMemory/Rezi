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
  /** Theme interpolation frame count for setTheme(). 0 disables transitions (default). */
  themeTransitionFrames?: number;
  internal_onRender?: (metrics: AppRenderMetrics) => void;
  internal_onLayout?: (snapshot: AppLayoutSnapshot) => void;
}>;

export interface App<S> {
  view(fn: ViewFn<S>): void;
  replaceView(fn: ViewFn<S>): void;
  replaceRoutes(routes: readonly RouteDefinition<S>[]): void;
  draw(fn: DrawFn): void;
  onEvent(handler: EventHandler): () => void;
  onFocusChange(handler: FocusChangeHandler): () => void;
  update(updater: S | ((prev: Readonly<S>) => S)): void;
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
