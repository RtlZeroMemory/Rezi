import { describeThrown } from "../../debug/describeThrown.js";
import type { VNode } from "../../widgets/types.js";
import type { InstanceId } from "../instance.js";
import type {
  CommitCtx,
  CommitErrorBoundaryState,
  CommitNodeFn,
  CommitNodeResult,
  RuntimeInstance,
} from "./shared.js";
import { isVNode } from "./validation.js";

export function captureErrorBoundaryState(detail: string): CommitErrorBoundaryState {
  return Object.freeze({
    code: "ZRUI_USER_CODE_THROW",
    detail,
    message: detail,
  });
}

export function commitErrorBoundaryFallback(
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  boundaryPath: string,
  fallbackPath: string,
  props: Readonly<{ fallback?: unknown }>,
  state: CommitErrorBoundaryState,
  ctx: CommitCtx,
  commitNode: CommitNodeFn,
): CommitNodeResult {
  const fallback = props.fallback;
  if (typeof fallback !== "function") {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: "errorBoundary fallback must be a function",
      },
    };
  }

  let fallbackVNode: VNode;
  try {
    fallbackVNode = (
      fallback as (error: {
        code: "ZRUI_USER_CODE_THROW";
        message: string;
        detail: string;
        stack?: string;
        retry: () => void;
      }) => VNode
    )(
      Object.freeze({
        code: state.code,
        message: state.message,
        detail: state.detail,
        ...(state.stack ? { stack: state.stack } : {}),
        retry: () => {
          ctx.errorBoundary?.requestRetry(boundaryPath);
        },
      }),
    );
  } catch (e: unknown) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_USER_CODE_THROW",
        detail: describeThrown(e),
      },
    };
  }

  if (!isVNode(fallbackVNode)) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: "errorBoundary fallback must return a VNode",
      },
    };
  }
  return commitNode(prev, instanceId, fallbackVNode, ctx, fallbackPath);
}
