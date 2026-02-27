/*
  include/zr/zr_engine.h - Public engine ABI surface (header-only declarations).

  Why: Exposes Zireael's stable, buffer-oriented API for wrappers while keeping
  ownership and platform boundaries explicit.
*/

#ifndef ZR_ZR_ENGINE_H_INCLUDED
#define ZR_ZR_ENGINE_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

#include "zr/zr_config.h"
#include "zr/zr_debug.h"
#include "zr/zr_metrics.h"
#include "zr/zr_result.h"
#include "zr/zr_terminal_caps.h"

#include <stddef.h>
#include <stdint.h>

/* Opaque engine handle (owned and managed by the engine API). */
typedef struct zr_engine_t zr_engine_t;

/*
  Threading contract (normative):
    - Engine instances are single-thread-affine.
    - All `engine_*` APIs are engine-thread-only, except:
        `engine_post_user_event()`, which is callable cross-thread.
    - During teardown, `engine_post_user_event()` may return
      `ZR_ERR_INVALID_ARGUMENT`.
    - Wrappers must quiesce post threads before calling `engine_destroy()`.
*/

/*
  Create an engine instance.

  Contract:
    - Validates cfg (including version negotiation).
    - Initializes platform/backend resources and enters raw mode.
    - Allocates engine-owned state (framebuffers, queues, output buffers).
    - Enqueues an initial ZR_EV_RESIZE event.

  Args:
    - out_engine: required output pointer; set to NULL on failure.
    - cfg: required create-time config.

  Returns:
    - ZR_OK on success.
    - ZR_ERR_INVALID_ARGUMENT, ZR_ERR_UNSUPPORTED, ZR_ERR_OOM,
      or ZR_ERR_PLATFORM on failure.
*/
zr_result_t engine_create(zr_engine_t** out_engine, const zr_engine_config_t* cfg);

/*
  Destroy an engine instance.

  Contract:
    - Safe with NULL.
    - Must be called after external post threads are quiesced.
    - Releases engine-owned resources.
    - Restores platform state best-effort (e.g. leave raw mode).
*/
void engine_destroy(zr_engine_t* e);

/*
  Poll input, normalize queued events, and write a packed event batch.

  Args:
    - e: engine instance.
    - timeout_ms: wait timeout in milliseconds (>= 0).
    - out_buf/out_cap: caller output buffer for packed batch.

  Returns:
    - >0: bytes written into out_buf.
    -  0: timeout/no events available.
    - <0: negative ZR_ERR_* failure code.

  Notes:
    - If out_cap > 0, out_buf must be non-NULL.
    - Batch format is defined in zr_event.h.
    - Truncation (insufficient capacity for all records) is success-mode and
      signaled by ZR_EV_BATCH_TRUNCATED in batch header flags.
*/
int engine_poll_events(zr_engine_t* e, int timeout_ms, uint8_t* out_buf, int out_cap);

/*
  Post a wrapper-defined user event to the engine queue.

  Contract:
    - Intended to be callable cross-thread to wake blocked polling.
    - Payload bytes are copied during the call.
    - Returns ZR_ERR_INVALID_ARGUMENT when teardown has started.

  Args:
    - tag: wrapper-defined event discriminator.
    - payload/payload_len: optional opaque payload.

  Returns:
    - ZR_OK on success; negative error code on failure.
*/
zr_result_t engine_post_user_event(zr_engine_t* e, uint32_t tag, const uint8_t* payload, int payload_len);

/*
  Validate and execute drawlist bytes into engine render state.

  Contract:
    - Input is treated as untrusted and fully validated.
    - No-partial-effects: state commit only occurs on success.
*/
zr_result_t engine_submit_drawlist(zr_engine_t* e, const uint8_t* bytes, int bytes_len);

/*
  Present current frame by diffing and writing terminal output.

  Contract:
    - Performs one backend write on success.
    - Commits presented-frame state/metrics only after successful write.
*/
zr_result_t engine_present(zr_engine_t* e);

/*
  Copy a metrics snapshot into caller storage.

  Note:
    - Uses prefix-copy semantics via zr_metrics_t.struct_size.
*/
zr_result_t engine_get_metrics(zr_engine_t* e, zr_metrics_t* out_metrics);

/* Return backend capability snapshot used by runtime output decisions. */
zr_result_t engine_get_caps(zr_engine_t* e, zr_terminal_caps_t* out_caps);

/* Return pointer to engine-owned extended terminal profile snapshot. */
const zr_terminal_profile_t* engine_get_terminal_profile(const zr_engine_t* e);

/*
  Apply runtime config updates.

  Contract:
    - Validates cfg.
    - Uses no-partial-effects resource swap semantics.
    - Platform sub-config changes are not supported at runtime.
*/
zr_result_t engine_set_config(zr_engine_t* e, const zr_engine_runtime_config_t* cfg);

/*
  Debug trace API.

  Why: Allows wrappers/tooling to capture and inspect bounded diagnostic
  records without introducing per-frame heap churn.
*/

/*
  Enable debug tracing with the provided configuration.

  Behavior:
    - Re-enabling replaces existing trace storage and resets prior records.
    - If config is NULL, defaults are used.
*/
zr_result_t engine_debug_enable(zr_engine_t* e, const zr_debug_config_t* config);

/* Disable tracing and free trace storage. Safe to call when already disabled. */
void engine_debug_disable(zr_engine_t* e);

/*
  Query debug record headers.

  Args:
    - query: filter criteria.
    - out_headers/out_headers_cap: optional output array for matched headers.
    - out_result: required query summary output.

  Notes:
    - Count-only queries are possible with out_headers == NULL.
*/
zr_result_t engine_debug_query(zr_engine_t* e, const zr_debug_query_t* query, zr_debug_record_header_t* out_headers,
                               uint32_t out_headers_cap, zr_debug_query_result_t* out_result);

/*
  Fetch payload bytes for a record by record_id.

  Returns:
    - ZR_OK and writes payload when found and capacity is sufficient.
    - ZR_ERR_LIMIT when record is not found or out_cap is insufficient.
*/
zr_result_t engine_debug_get_payload(zr_engine_t* e, uint64_t record_id, void* out_payload, uint32_t out_cap,
                                     uint32_t* out_size);

/* Return aggregate trace counters/health statistics. */
zr_result_t engine_debug_get_stats(zr_engine_t* e, zr_debug_stats_t* out_stats);

/*
  Export all trace records as a contiguous sequence of (header,payload) items.

  Returns:
    - bytes written (>= 0), or negative error code.
    - 0 when tracing is disabled or currently empty.
*/
int32_t engine_debug_export(zr_engine_t* e, uint8_t* out_buf, size_t out_cap);

/* Clear trace records while keeping tracing enabled. */
void engine_debug_reset(zr_engine_t* e);

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_ENGINE_H_INCLUDED */
