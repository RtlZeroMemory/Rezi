import type { App } from "@rezi-ui/core";
import {
  type HotStateReloadController,
  type HotStateReloadRoutesOptions,
  type HotStateReloadViewOptions,
  createHotStateReload,
} from "./hotStateReload.js";

export type NodeAppHotReloadViewOptions<S> = Omit<HotStateReloadViewOptions<S>, "app">;
export type NodeAppHotReloadRoutesOptions<S> = Omit<HotStateReloadRoutesOptions<S>, "app">;
export type NodeAppHotReloadOptions<S> =
  | NodeAppHotReloadViewOptions<S>
  | NodeAppHotReloadRoutesOptions<S>;

type NodeAppLifecycle<S> = Pick<App<S>, "start" | "stop" | "dispose">;
type NodeAppHotReloadTargets<S> = Pick<App<S>, "replaceView" | "replaceRoutes">;

function createViewHotReloadApp<S>(app: NodeAppHotReloadTargets<S>): Pick<App<S>, "replaceView"> {
  return {
    replaceView: app.replaceView.bind(app),
  };
}

function createRoutesHotReloadApp<S>(
  app: NodeAppHotReloadTargets<S>,
): Pick<App<S>, "replaceRoutes"> {
  return {
    replaceRoutes: app.replaceRoutes.bind(app),
  };
}

export function createNodeAppHotReloadController<S>(
  app: NodeAppHotReloadTargets<S>,
  options: NodeAppHotReloadOptions<S>,
): HotStateReloadController {
  if ("viewModule" in options) {
    const opts: HotStateReloadViewOptions<S> = {
      ...options,
      app: createViewHotReloadApp(app),
    };
    return createHotStateReload(opts);
  }
  const opts: HotStateReloadRoutesOptions<S> = {
    ...options,
    app: createRoutesHotReloadApp(app),
  };
  return createHotStateReload(opts);
}

export function attachNodeAppHotReloadLifecycle<S>(
  app: NodeAppLifecycle<S>,
  controller: HotStateReloadController,
): void {
  const baseStart = app.start.bind(app);
  const baseStop = app.stop.bind(app);
  const baseDispose = app.dispose.bind(app);

  app.start = async (): Promise<void> => {
    let startedByLifecycle = false;
    if (!controller.isRunning()) {
      await controller.start();
      startedByLifecycle = true;
    }
    try {
      await baseStart();
    } catch (error: unknown) {
      if (startedByLifecycle && controller.isRunning()) {
        try {
          await controller.stop();
        } catch {
          // Preserve app.start() failure as the primary error.
        }
      }
      throw error;
    }
  };

  app.stop = async (): Promise<void> => {
    let failure: unknown = null;
    try {
      await baseStop();
    } catch (error: unknown) {
      failure = error;
    }

    if (controller.isRunning()) {
      try {
        await controller.stop();
      } catch (error: unknown) {
        if (failure === null) failure = error;
      }
    }

    if (failure !== null) throw failure;
  };

  app.dispose = (): void => {
    if (controller.isRunning()) {
      void controller.stop().catch(() => undefined);
    }
    baseDispose();
  };
}
