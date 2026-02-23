/**
 * Event types for the Rezi runtime.
 * @see docs/protocol/index.md
 * @see docs/guide/lifecycle-and-updates.md
 */

import type { ZrevEvent } from "./protocol/types.js";
import type { RoutedAction } from "./runtime/router/types.js";

// =============================================================================
// Protocol Event Types
// =============================================================================

export type { ZrevEvent, ZrevKeyAction, ZrevMouseKind } from "./protocol/types.js";

// =============================================================================
// UiEvent Union (from docs/guide/lifecycle-and-updates.md)
// =============================================================================

/**
 * Events emitted by the app runtime to registered handlers.
 *
 * For each decoded ZREV event:
 * 1. The app MUST emit `{ kind: "engine", event }`.
 * 2. The runtime MUST apply focus/routing rules.
 * 3. If routing produces a user action, the app MUST emit
 *    `{ kind: "action", ... }` immediately after the corresponding engine event.
 */
export type UiEvent =
  | Readonly<{
      /**
       * Raw engine event from ZREV batch.
       */
      kind: "engine";
      event: ZrevEvent;
    }>
  | Readonly<
      {
        /**
         * User action triggered by focus/routing (e.g., button press, input edit).
         */
        kind: "action";
      } & RoutedAction
    >
  | Readonly<{
      /**
       * Input loss notification.
       *
       * Emission rules:
       * - Emit exactly one overrun event per affected batch
       * - Emit before any `kind: "engine"` events from that batch
       * - Overrun events are NOT fatal by themselves
       */
      kind: "overrun";
      /** True if ZREV header flags include TRUNCATED */
      engineTruncated: boolean;
      /** Runtime-level drops due to backpressure */
      droppedBatches: number;
    }>
  | Readonly<{
      /**
       * Fatal runtime error.
       *
       * When a fatal error occurs while Running:
       * 1. This event is emitted to all handlers in registration order
       * 2. App transitions to Faulted state
       * 3. Backend is stopped and disposed best-effort
       */
      kind: "fatal";
      /** Error code (ZrUiErrorCode or other string) */
      code: string;
      /** Human-readable error detail */
      detail: string;
    }>;
