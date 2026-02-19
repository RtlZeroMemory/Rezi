/*
  src/core/zr_framebuffer.h — In-memory framebuffer model + clip-aware drawing ops.

  Why: Provides a deterministic, OS-header-free framebuffer used by drawlist execution
  and internal renderers. Ops are clip-aware and preserve wide-glyph invariants
  without allocating in hot paths.
  Exception (LOCKED): paired-cell invariant repair may touch exactly one
  adjacent wide-pair cell outside clip when needed to avoid orphan pairs.
*/

#ifndef ZR_CORE_ZR_FRAMEBUFFER_H_INCLUDED
#define ZR_CORE_ZR_FRAMEBUFFER_H_INCLUDED

#include "util/zr_result.h"

#include <stddef.h>
#include <stdint.h>

/* Shared rect type for clip and draw ops. */
typedef struct zr_rect_t {
  int32_t x;
  int32_t y;
  int32_t w;
  int32_t h;
} zr_rect_t;

/*
  zr_style_t:
    - reserved is ABI-pinned to 0 in v1.
    - fg_rgb/bg_rgb are 0x00RRGGBB in v1 (consistent with diff renderer pins).
*/
typedef struct zr_style_t {
  uint32_t fg_rgb;
  uint32_t bg_rgb;
  uint32_t attrs;
  uint32_t reserved;
} zr_style_t;

/* Cell model (LOCKED v1). */
enum { ZR_CELL_GLYPH_MAX = 32 };

typedef struct zr_cell_t {
  uint8_t glyph[ZR_CELL_GLYPH_MAX]; /* UTF-8 bytes for one grapheme cluster (or ASCII) */
  uint8_t glyph_len;                /* 0..ZR_CELL_GLYPH_MAX */
  uint8_t width;                    /* 0=continuation, 1=normal, 2=wide lead */
  uint16_t _pad0;
  zr_style_t style;
} zr_cell_t;

typedef struct zr_fb_t {
  uint32_t cols;
  uint32_t rows;
  zr_cell_t* cells; /* engine-owned backing; row-major; length cols*rows */
} zr_fb_t;

zr_result_t zr_fb_init(zr_fb_t* fb, uint32_t cols, uint32_t rows);
void zr_fb_release(zr_fb_t* fb);

/*
  zr_fb_resize:
    - Allocates a new backing store when needed.
    - No partial effects on failure: on OOM/limit, fb remains unchanged.
*/
zr_result_t zr_fb_resize(zr_fb_t* fb, uint32_t cols, uint32_t rows);

zr_cell_t* zr_fb_cell(zr_fb_t* fb, uint32_t x, uint32_t y);
const zr_cell_t* zr_fb_cell_const(const zr_fb_t* fb, uint32_t x, uint32_t y);

/*
  Painter + clip stack:
    - Caller provides clip_stack storage (bounded, no allocations).
    - Current clip is the intersection of framebuffer bounds and all stacked clips.
*/
typedef struct zr_fb_painter_t {
  zr_fb_t* fb;
  zr_rect_t* clip_stack;
  uint32_t clip_cap;
  uint32_t clip_len;
} zr_fb_painter_t;

zr_result_t zr_fb_painter_begin(zr_fb_painter_t* p, zr_fb_t* fb, zr_rect_t* clip_stack, uint32_t clip_cap);
zr_result_t zr_fb_clip_push(zr_fb_painter_t* p, zr_rect_t clip);
zr_result_t zr_fb_clip_pop(zr_fb_painter_t* p);

/*
  Ops (clip-aware unless noted).

  Invariant-repair exception (LOCKED):
    - zr_fb_put_grapheme() may clear one adjacent paired wide cell (x-1 or x+1)
      outside clip when overwriting a continuation/lead edge.
    - This exception is bounded to that single pair cell only.
*/
zr_result_t zr_fb_clear(zr_fb_t* fb, const zr_style_t* style); /* ignores clip */
zr_result_t zr_fb_fill_rect(zr_fb_painter_t* p, zr_rect_t r, const zr_style_t* style);
zr_result_t zr_fb_draw_hline(zr_fb_painter_t* p, int32_t x, int32_t y, int32_t len, const zr_style_t* style);
zr_result_t zr_fb_draw_vline(zr_fb_painter_t* p, int32_t x, int32_t y, int32_t len, const zr_style_t* style);
zr_result_t zr_fb_draw_box(zr_fb_painter_t* p, zr_rect_t r, const zr_style_t* style);
zr_result_t zr_fb_draw_scrollbar_v(zr_fb_painter_t* p, zr_rect_t track, zr_rect_t thumb, const zr_style_t* track_style,
                                   const zr_style_t* thumb_style);
zr_result_t zr_fb_draw_scrollbar_h(zr_fb_painter_t* p, zr_rect_t track, zr_rect_t thumb, const zr_style_t* track_style,
                                   const zr_style_t* thumb_style);

/*
  zr_fb_draw_text_bytes:
    - Convenience: iterates UTF-8 graphemes using the pinned width policy and
      calls zr_fb_put_grapheme() per cluster.
    - Never allocates; clip-aware via the painter.
*/
zr_result_t zr_fb_draw_text_bytes(zr_fb_painter_t* p, int32_t x, int32_t y, const uint8_t* bytes, size_t len,
                                  const zr_style_t* style);

/* Deterministic UTF-8 cell count using the pinned width policy. */
size_t zr_fb_count_cells_utf8(const uint8_t* bytes, size_t len);

/*
  zr_fb_put_grapheme:
    - bytes are already grapheme-segmented (caller responsibility).
    - width is provided by caller (0/1/2); width==0 is invalid for put.
    - len==0 is normalized to a single ASCII space (width 1).
    - Paired-cell invariant repair may clear one adjacent pair cell outside clip
      (bounded exception; no broader out-of-clip mutation).
    - Replacement policy (LOCKED):
        - len > ZR_CELL_GLYPH_MAX -> render U+FFFD (width 1)
        - width==2 but cannot fully fit within bounds/clip -> render U+FFFD (width 1)
*/
zr_result_t zr_fb_put_grapheme(zr_fb_painter_t* p, int32_t x, int32_t y, const uint8_t* bytes, size_t len,
                               uint8_t width, const zr_style_t* style);

/* Overlap-safe blit (memmove-like), invariant-preserving. */
zr_result_t zr_fb_blit_rect(zr_fb_painter_t* p, zr_rect_t dst, zr_rect_t src);

#endif /* ZR_CORE_ZR_FRAMEBUFFER_H_INCLUDED */
