/**
 * Backend interface and types for runtime-backend communication.
 * @see docs/guide/lifecycle-and-updates.md
 */

import type { TerminalCaps } from "./terminalCaps.js";

/**
 * Optional marker on requestFrame() promises for backends that can signal
 * asynchronous "accepted by backend" ACK earlier than final completion.
 */
export const FRAME_ACCEPTED_ACK_MARKER = "__reziFrameAcceptedAckPromise" as const;

/**
 * Optional marker on RuntimeBackend objects exposing the backend drawlist protocol.
 * Used by createApp() to reject core/backend cursor-protocol mismatches early.
 */
export const BACKEND_DRAWLIST_V2_MARKER = "__reziBackendUseDrawlistV2" as const;

/**
 * Optional marker on RuntimeBackend objects exposing the backend event-batch cap.
 * Used by createApp() to reject event-buffer cap mismatches early.
 */
export const BACKEND_MAX_EVENT_BYTES_MARKER = "__reziBackendMaxEventBytes" as const;

/**
 * Optional marker on RuntimeBackend objects exposing the backend frame pacing cap.
 * Used by createApp() to reject fps-cap mismatches early.
 */
export const BACKEND_FPS_CAP_MARKER = "__reziBackendFpsCap" as const;

// =============================================================================
// BackendEventBatch (from docs/guide/lifecycle-and-updates.md)
// =============================================================================

/**
 * A polled event batch with explicit buffer ownership.
 *
 * Rules:
 * - `release()` MUST be idempotent.
 * - The runtime MUST call `release()` exactly once for every successfully
 *   received batch, even if parsing fails (release occurs before faulting).
 * - The backend MUST NOT reuse `bytes.buffer` until `release()` is called.
 */
export type BackendEventBatch = Readonly<{
  /**
   * ZREV v1 bytes. May be 0 length for "no events" batches.
   */
  bytes: Uint8Array;

  /**
   * Runtime-level drops due to backpressure.
   * Backends that do not implement drops MUST report 0.
   */
  droppedBatches: number;

  /**
   * Returns the underlying buffer to the backend pool.
   * MUST be called exactly once per batch.
   */
  release: () => void;
}>;

// =============================================================================
// RuntimeBackend Interface (from docs/guide/lifecycle-and-updates.md)
// =============================================================================

/**
 * Backend interface for the app runtime.
 *
 * The app runtime is backend-agnostic but requires a backend with explicit
 * buffer ownership. The Node backend's worker protocol is one implementation
 * of this contract.
 *
 * @see docs/backend/worker-model.md for the Node implementation details.
 */
export interface RuntimeBackend {
  /**
   * Start the backend (initialize engine, enter raw mode, etc.).
   * Resolves when the backend is ready to process frames.
   */
  start(): Promise<void>;

  /**
   * Stop the backend (exit raw mode, cleanup).
   * Resolves when stopped.
   */
  stop(): Promise<void>;

  /**
   * Dispose of all resources. Idempotent.
   */
  dispose(): void;

  /**
   * Submit a frame to be rendered.
   *
   * Frame submission is async and must not block the main thread.
   * Drawlist bytes are ZRDL v1 and MUST be treated as immutable by the backend.
   *
   * @param drawlist - ZRDL v1 drawlist bytes
   */
  requestFrame(drawlist: Uint8Array): Promise<void>;

  /**
   * Poll for the next event batch.
   *
   * This is poll-based rather than callback-based to avoid callbacks from native.
   * Resolves with the next batch when available.
   */
  pollEvents(): Promise<BackendEventBatch>;

  /**
   * Post a user event without blocking.
   *
   * This is thread-safe and can wake a blocking engine poll.
   *
   * @param tag - User-defined tag for the event
   * @param payload - Arbitrary payload bytes
   */
  postUserEvent(tag: number, payload: Uint8Array): void;

  /**
   * Get terminal capabilities.
   *
   * Resolves with the terminal's capability snapshot. Should be called after
   * start() to get accurate values.
   *
   * @returns Terminal capabilities
   */
  getCaps(): Promise<TerminalCaps>;
}
