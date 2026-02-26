/*
  include/zr/zr_metrics.h — ABI-safe engine metrics snapshot (POD, append-only).

  Why: Provides a stable, fixed-width metrics struct for wrappers and internal
  diagnostics. The struct is POD (no pointers) and is designed to be appended
  to over time without breaking older callers that prefix-copy by struct_size.
*/

#ifndef ZR_ZR_METRICS_H_INCLUDED
#define ZR_ZR_METRICS_H_INCLUDED

#include <stdint.h>

/*
  zr_metrics_t (ABI):
    - POD: fixed-width integers only; no pointers.
    - Append-only: new fields must be appended at the end.
    - Prefix-copy: callers set out->struct_size to the number of bytes they
      can receive; engine_get_metrics copies only what fits.
*/
typedef struct zr_metrics_t {
  /* --- ABI handshake --- */
  /*
    struct_size:
      - Caller-provided capacity for prefix-copy (bytes).
      - If struct_size != 0, the engine overwrites this field with sizeof(zr_metrics_t)
        in the copied prefix.
  */
  uint32_t struct_size;

  uint32_t negotiated_engine_abi_major;
  uint32_t negotiated_engine_abi_minor;
  uint32_t negotiated_engine_abi_patch;

  uint32_t negotiated_drawlist_version;
  uint32_t negotiated_event_batch_version;

  /* --- Frame and output stats --- */
  uint64_t frame_index; /* increments per present */
  uint32_t fps;         /* best-effort */
  uint32_t _pad0;

  uint64_t bytes_emitted_total;
  uint32_t bytes_emitted_last_frame;
  uint32_t _pad1;

  uint32_t dirty_lines_last_frame;
  uint32_t dirty_cols_last_frame;

  /* --- Timing (microseconds; best-effort telemetry) --- */
  uint32_t us_input_last_frame;
  uint32_t us_drawlist_last_frame;
  uint32_t us_diff_last_frame;
  uint32_t us_write_last_frame;

  /* --- Event stats --- */
  uint32_t events_out_last_poll;
  uint32_t events_dropped_total;

  /* --- Arena high-water marks (bytes) --- */
  uint64_t arena_frame_high_water_bytes;
  uint64_t arena_persistent_high_water_bytes;

  /* --- Damage summary (last frame) --- */
  uint32_t damage_rects_last_frame;
  uint32_t damage_cells_last_frame;
  uint8_t  damage_full_frame;
  uint8_t  _pad2[3];
} zr_metrics_t;

#endif /* ZR_ZR_METRICS_H_INCLUDED */
