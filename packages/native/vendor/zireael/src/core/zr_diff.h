/*
  src/core/zr_diff.h — Pure framebuffer diff renderer to VT/ANSI bytes.

  Why: Computes deterministic terminal output bytes for prev→next framebuffer
  changes under pinned capabilities and an assumed initial terminal state.
*/

#ifndef ZR_CORE_ZR_DIFF_H_INCLUDED
#define ZR_CORE_ZR_DIFF_H_INCLUDED

#include "core/zr_framebuffer.h"
#include "core/zr_cursor.h"
#include "core/zr_damage.h"
#include "platform/zr_platform.h"
#include "util/zr_caps.h"
#include "util/zr_result.h"

#include <stddef.h>
#include <stdint.h>

typedef struct zr_term_state_t {
  /* 0-based cursor position in character cells. */
  uint32_t cursor_x;
  uint32_t cursor_y;
  uint8_t cursor_visible; /* 0/1 */
  uint8_t cursor_shape;   /* zr_cursor_shape_t values */
  uint8_t cursor_blink;   /* 0/1 */
  /*
    Validity mask for the fields above.

    Why: The engine sometimes knows its cursor/style assumptions are desynced
    (startup, resize). The diff renderer must be able to force emission of
    baseline state even when numeric fields match, without changing the public
    API/ABI surface.
  */
  uint8_t flags;
  zr_style_t style;
} zr_term_state_t;

/* --- zr_term_state_t.flags bits --- */
#define ZR_TERM_STATE_STYLE_VALID ((uint8_t)0x01u)
#define ZR_TERM_STATE_CURSOR_POS_VALID ((uint8_t)0x02u)
#define ZR_TERM_STATE_CURSOR_VIS_VALID ((uint8_t)0x04u)
#define ZR_TERM_STATE_CURSOR_SHAPE_VALID ((uint8_t)0x08u)
/*
  Indicates whether the renderer can assume the terminal's *screen contents*
  are synchronized with `prev`.

  Why: Resizes (and some external terminal events) can preserve prior on-screen
  glyphs even when the engine reallocates/clears its internal buffers. When this
  bit is not set, the diff renderer must establish a known blank baseline (clear
  screen) before applying sparse diffs; otherwise stale cells can remain visible.
*/
#define ZR_TERM_STATE_SCREEN_VALID ((uint8_t)0x10u)
#define ZR_TERM_STATE_VALID_ALL                                                                                        \
  ((uint8_t)(ZR_TERM_STATE_STYLE_VALID | ZR_TERM_STATE_CURSOR_POS_VALID | ZR_TERM_STATE_CURSOR_VIS_VALID |             \
             ZR_TERM_STATE_CURSOR_SHAPE_VALID | ZR_TERM_STATE_SCREEN_VALID))

typedef struct zr_diff_stats_t {
  uint32_t dirty_lines;
  uint32_t dirty_cells;
  uint32_t damage_rects;
  uint32_t damage_cells;
  uint8_t damage_full_frame;
  uint8_t path_sweep_used;
  uint8_t path_damage_used;
  uint8_t scroll_opt_attempted;
  uint8_t scroll_opt_hit;
  uint32_t collision_guard_hits;
  uint32_t _pad0;
  size_t bytes_emitted;
} zr_diff_stats_t;

typedef struct zr_diff_scratch_t {
  /*
    Optional per-line scratch caches.

    Why: Lets callers supply engine-owned storage so the diff path can avoid
    per-frame allocations while caching row fingerprints/dirty-line hints.

    Contract:
      - Set prev_hashes_valid=1 when prev_row_hashes[] already match `prev`.
      - On successful present, callers can swap prev/next hash buffers to reuse
        next-row hashes as the next frame's prev-row hashes.
  */
  uint64_t* prev_row_hashes;
  uint64_t* next_row_hashes;
  uint8_t* dirty_rows;
  uint32_t row_cap;
  uint8_t prev_hashes_valid;
  uint8_t _pad0[3];
} zr_diff_scratch_t;

/*
  zr_diff_render:
    - Pure function: does not mutate framebuffers.
    - On success:
        - returns ZR_OK
        - writes [0..*out_len) bytes to out_buf
        - writes final terminal state to out_final_term_state
        - writes stats to out_stats
    - On failure:
        - returns a negative ZR_ERR_*
        - sets *out_len = 0
        - zeroes out_final_term_state and out_stats
        - out_buf contents are unspecified (caller must respect *out_len)
*/
zr_result_t zr_diff_render(const zr_fb_t* prev, const zr_fb_t* next, const plat_caps_t* caps,
                           const zr_term_state_t* initial_term_state, const zr_cursor_state_t* desired_cursor_state,
                           const zr_limits_t* lim, zr_damage_rect_t* scratch_damage_rects,
                           uint32_t scratch_damage_rect_cap, uint8_t enable_scroll_optimizations, uint8_t* out_buf,
                           size_t out_cap, size_t* out_len, zr_term_state_t* out_final_term_state,
                           zr_diff_stats_t* out_stats);

/*
  Extended entrypoint for engine-internal callsites that can provide
  optional per-line scratch storage.
*/
zr_result_t zr_diff_render_ex(const zr_fb_t* prev, const zr_fb_t* next, const plat_caps_t* caps,
                              const zr_term_state_t* initial_term_state, const zr_cursor_state_t* desired_cursor_state,
                              const zr_limits_t* lim, zr_damage_rect_t* scratch_damage_rects,
                              uint32_t scratch_damage_rect_cap, zr_diff_scratch_t* scratch,
                              uint8_t enable_scroll_optimizations, uint8_t* out_buf, size_t out_cap, size_t* out_len,
                              zr_term_state_t* out_final_term_state, zr_diff_stats_t* out_stats);

#endif /* ZR_CORE_ZR_DIFF_H_INCLUDED */
