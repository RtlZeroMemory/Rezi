/*
  src/util/zr_caps.c — Limits defaults + validation.

  Why: Enforces deterministic, non-zero cap defaults and rejects invalid inputs.
*/

#include "util/zr_caps.h"

enum {
  /* Arena default budget for engine-owned transient allocations. */
  ZR_LIMIT_DEFAULT_ARENA_MAX_TOTAL_BYTES = 4u * 1024u * 1024u,
  /* Arena starts smaller and grows up to max budget as needed. */
  ZR_LIMIT_DEFAULT_ARENA_INITIAL_BYTES = 64u * 1024u,
  /* Drawlist bytes cap protects validator/runtime from oversized command streams. */
  ZR_LIMIT_DEFAULT_DL_TOTAL_BYTES = 256u * 1024u,
  /* Upper bound for drawlist commands/segments/rects to cap validator work per frame. */
  ZR_LIMIT_DEFAULT_MAX_ITEMS = 4096u,
  /* Clip stack depth cap avoids pathological nesting while covering normal UIs. */
  ZR_LIMIT_DEFAULT_MAX_CLIP_DEPTH = 64u,
  /* Output byte budget keeps one present bounded for terminals/CI pipes. */
  ZR_LIMIT_DEFAULT_MAX_OUT_FRAME_BYTES = 256u * 1024u,
};

/* Return sensible default limits for arena, drawlist, and clip depth. */
zr_limits_t zr_limits_default(void) {
  zr_limits_t l;
  l.arena_max_total_bytes = ZR_LIMIT_DEFAULT_ARENA_MAX_TOTAL_BYTES;
  l.arena_initial_bytes = ZR_LIMIT_DEFAULT_ARENA_INITIAL_BYTES;
  l.out_max_bytes_per_frame = ZR_LIMIT_DEFAULT_MAX_OUT_FRAME_BYTES;
  l.dl_max_total_bytes = ZR_LIMIT_DEFAULT_DL_TOTAL_BYTES;
  l.dl_max_cmds = ZR_LIMIT_DEFAULT_MAX_ITEMS;
  l.dl_max_strings = ZR_LIMIT_DEFAULT_MAX_ITEMS;
  l.dl_max_blobs = ZR_LIMIT_DEFAULT_MAX_ITEMS;
  l.dl_max_clip_depth = ZR_LIMIT_DEFAULT_MAX_CLIP_DEPTH;
  l.dl_max_text_run_segments = ZR_LIMIT_DEFAULT_MAX_ITEMS;
  l.diff_max_damage_rects = ZR_LIMIT_DEFAULT_MAX_ITEMS;
  return l;
}

/* Validate that all limits are non-zero and internally consistent. */
zr_result_t zr_limits_validate(const zr_limits_t* limits) {
  if (!limits) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (limits->arena_max_total_bytes == 0u || limits->arena_initial_bytes == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (limits->arena_initial_bytes > limits->arena_max_total_bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (limits->out_max_bytes_per_frame == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (limits->dl_max_total_bytes == 0u || limits->dl_max_cmds == 0u || limits->dl_max_strings == 0u ||
      limits->dl_max_blobs == 0u || limits->dl_max_clip_depth == 0u || limits->dl_max_text_run_segments == 0u ||
      limits->diff_max_damage_rects == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return ZR_OK;
}
