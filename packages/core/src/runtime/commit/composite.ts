import { describeThrown } from "../../debug/describeThrown.js";
import type { ResponsiveViewportSnapshot } from "../../layout/responsive.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { mergeThemeOverride } from "../../theme/interop.js";
import type { Theme } from "../../theme/theme.js";
import type { ColorTokens } from "../../theme/tokens.js";
import {
  type CompositeWidgetMeta,
  type WidgetContext,
  getCompositeMeta,
  scopedId,
} from "../../widgets/composition.js";
import type { VNode } from "../../widgets/types.js";
import type { InstanceId } from "../instance.js";
import { type AppStateSelection, createHookContext } from "../instances.js";
import { compositePropsEqual, evaluateAppStateSelections } from "./equality.js";
import {
  type CommitContainerFn,
  type CommitCtx,
  type CommitNodeResult,
  EMPTY_CHILDREN,
} from "./shared.js";
import { isContainerVNode } from "./validation.js";

const MAX_COMPOSITE_RENDER_DEPTH = 100;
const DEFAULT_VIEWPORT_SNAPSHOT: ResponsiveViewportSnapshot = Object.freeze({
  width: 0,
  height: 0,
  breakpoint: "sm",
});

export function currentCompositeTheme(ctx: CommitCtx): Theme | null {
  if (ctx.compositeThemeStack.length === 0) return null;
  return ctx.compositeThemeStack[ctx.compositeThemeStack.length - 1] ?? null;
}

export function resolveCompositeChildTheme(parentTheme: Theme, vnode: VNode): Theme {
  if (vnode.kind === "themed") {
    const props = vnode.props as { theme?: unknown };
    return mergeThemeOverride(parentTheme, props.theme);
  }

  if (
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "grid" ||
    vnode.kind === "box"
  ) {
    const props = vnode.props as { theme?: unknown };
    return mergeThemeOverride(parentTheme, props.theme);
  }

  return parentTheme;
}

export function readCompositeColorTokens(ctx: CommitCtx): ColorTokens {
  const composite = ctx.composite;
  if (!composite) return defaultTheme.definition.colors;

  const theme = currentCompositeTheme(ctx);
  if (theme !== null) {
    if (!composite.getColorTokens) return theme.definition.colors;
    return composite.getColorTokens(theme) ?? theme.definition.colors;
  }

  return composite.colorTokens ?? defaultTheme.definition.colors;
}

export function executeCompositeRender(
  instanceId: InstanceId,
  vnode: VNode,
  compositeMeta: CompositeWidgetMeta,
  ctx: CommitCtx,
  nodePath: string[],
  depth: number,
  commitContainer: CommitContainerFn,
): CommitNodeResult {
  const prev =
    ctx.prevNodeStack.length > 0 ? (ctx.prevNodeStack[ctx.prevNodeStack.length - 1] ?? null) : null;
  const compositeRuntime = ctx.composite as NonNullable<CommitCtx["composite"]>;

  let compositeChild: VNode | null = null;
  let popCompositeStack = false;
  try {
    const activeCompositeMeta = compositeMeta;
    const registry = compositeRuntime.registry;
    const existing = registry.get(instanceId);

    if (existing && existing.widgetKey !== compositeMeta.widgetKey) {
      registry.incrementGeneration(instanceId);
      registry.delete(instanceId);
    }

    if (!registry.get(instanceId)) {
      try {
        registry.create(instanceId, compositeMeta.widgetKey);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: describeThrown(e),
          },
        };
      }
    }

    const state = registry.get(instanceId);
    if (!state) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: `composite state missing for instanceId=${String(instanceId)}`,
        },
      };
    }

    const invalidateInstance = () => {
      registry.invalidate(instanceId);
      ctx.composite?.onInvalidate(instanceId);
    };

    const prevMeta = prev ? getCompositeMeta(prev.vnode) : null;
    const prevChild = prev?.children[0] ?? null;
    const previousSelections = registry.getAppStateSelections(instanceId);
    const skipRenderEligible =
      !state.needsRender &&
      previousSelections.length > 0 &&
      prevMeta !== null &&
      prevChild !== null &&
      prevMeta.widgetKey === activeCompositeMeta.widgetKey &&
      compositePropsEqual(prevMeta.props, activeCompositeMeta.props);

    let canSkipCompositeRender = false;
    if (skipRenderEligible) {
      const evalRes = evaluateAppStateSelections(previousSelections, compositeRuntime.appState);
      if (evalRes.threw !== null) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: describeThrown(evalRes.threw),
          },
        };
      }
      canSkipCompositeRender = !evalRes.changed;
    }

    if (canSkipCompositeRender && prevChild !== null) {
      compositeChild = prevChild.vnode;
    } else {
      let colorTokens: ColorTokens;
      try {
        colorTokens = readCompositeColorTokens(ctx);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: describeThrown(e),
          },
        };
      }
      const compositeDepth = ctx.compositeRenderStack.length + 1;
      if (compositeDepth > MAX_COMPOSITE_RENDER_DEPTH) {
        const chain = ctx.compositeRenderStack
          .map((entry) => entry.widgetKey)
          .concat(activeCompositeMeta.widgetKey)
          .join(" -> ");
        return {
          ok: false,
          fatal: {
            code: "ZRUI_INVALID_PROPS",
            detail: `ZRUI_MAX_DEPTH: composite render depth ${String(compositeDepth)} exceeds max ${String(
              MAX_COMPOSITE_RENDER_DEPTH,
            )}. Chain: ${chain}`,
          },
        };
      }
      registry.beginRender(instanceId);
      const hookCtx = createHookContext(state, invalidateInstance);
      const nextSelections: AppStateSelection[] = [];
      const widgetCtx: WidgetContext<unknown> = Object.freeze({
        id: (suffix: string) => scopedId(activeCompositeMeta.widgetKey, instanceId, suffix),
        useState: hookCtx.useState,
        useReducer: hookCtx.useReducer,
        useRef: hookCtx.useRef,
        useEffect: hookCtx.useEffect,
        useMemo: hookCtx.useMemo,
        useCallback: hookCtx.useCallback,
        useAppState: <T>(selector: (s: unknown) => T): T => {
          const selected = selector(compositeRuntime.appState);
          nextSelections.push({
            selector: selector as (state: unknown) => unknown,
            value: selected,
          });
          return selected;
        },
        useTheme: () => colorTokens,
        useViewport: () => {
          compositeRuntime.onUseViewport?.();
          return compositeRuntime.viewport ?? DEFAULT_VIEWPORT_SNAPSHOT;
        },
        invalidate: invalidateInstance,
      });

      ctx.compositeRenderStack.push({
        widgetKey: activeCompositeMeta.widgetKey,
        instanceId,
      });
      popCompositeStack = true;
      try {
        compositeChild = activeCompositeMeta.render(widgetCtx);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: describeThrown(e),
          },
        };
      }

      try {
        const pending = registry.endRender(instanceId);
        const pendingCleanups = registry.getPendingCleanups(instanceId);
        for (const cleanup of pendingCleanups) ctx.pendingCleanups.push(cleanup);
        for (const eff of pending) ctx.pendingEffects.push(eff);
        registry.setAppStateSelections(instanceId, nextSelections);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: describeThrown(e),
          },
        };
      }
    }

    if (isContainerVNode(vnode)) {
      const childOverride = compositeChild ? ([compositeChild] as const) : null;
      if (childOverride) {
        ctx.containerChildOverrides.set(instanceId, childOverride);
      }
      try {
        return commitContainer(instanceId, vnode, prev, ctx, nodePath, depth);
      } finally {
        if (childOverride) {
          ctx.containerChildOverrides.delete(instanceId);
        }
      }
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode,
          children: EMPTY_CHILDREN,
          dirty: true,
          selfDirty: true,
          renderPacketKey: 0,
          renderPacket: null,
        },
      },
    };
  } finally {
    if (popCompositeStack) {
      ctx.compositeRenderStack.pop();
    }
  }
}
