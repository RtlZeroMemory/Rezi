/*
  src/core/zr_framebuffer.c — Framebuffer + painter clipping + core draw ops.

  Why: Implements a bounded, deterministic in-memory framebuffer with a clip stack
  and invariant-safe drawing primitives. Ops avoid per-call allocations and ensure
  wide glyphs are never split across cell boundaries.
*/

#include "core/zr_framebuffer.h"

#include "unicode/zr_grapheme.h"
#include "unicode/zr_utf8.h"
#include "unicode/zr_width.h"

#include "util/zr_checked.h"

#include <limits.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

/* U+FFFD replacement character in UTF-8. */
static const uint8_t ZR_UTF8_REPLACEMENT[] = {0xEFu, 0xBFu, 0xBDu};
#define ZR_UTF8_REPLACEMENT_LEN 3u

enum {
  ZR_FB_UTF8_ASCII_CONTROL_MAX = 0x20u,
  ZR_FB_UTF8_ASCII_DEL = 0x7Fu,
  ZR_FB_UTF8_C1_MIN = 0x80u,
  ZR_FB_UTF8_C1_MAX_EXCL = 0xA0u,
};

static bool zr_fb_utf8_grapheme_bytes_safe_for_terminal(const uint8_t* bytes, size_t len) {
  if (!bytes || len == 0u) {
    return false;
  }

  size_t off = 0u;
  while (off < len) {
    const zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes + off, len - off);
    if (d.size == 0u) {
      return false;
    }
    if (d.valid == 0u) {
      return false;
    }
    const uint32_t s = d.scalar;
    if (s < (uint32_t)ZR_FB_UTF8_ASCII_CONTROL_MAX || s == (uint32_t)ZR_FB_UTF8_ASCII_DEL ||
        (s >= (uint32_t)ZR_FB_UTF8_C1_MIN && s < (uint32_t)ZR_FB_UTF8_C1_MAX_EXCL)) {
      return false;
    }
    off += (size_t)d.size;
  }

  return true;
}

static zr_style_t zr_style_default(void) {
  zr_style_t s;
  s.fg_rgb = 0u;
  s.bg_rgb = 0u;
  s.attrs = 0u;
  s.reserved = 0u;
  return s;
}

static zr_rect_t zr_rect_empty(void) {
  zr_rect_t r;
  r.x = 0;
  r.y = 0;
  r.w = 0;
  r.h = 0;
  return r;
}

static int32_t zr_i32_max(int32_t a, int32_t b) {
  return (a > b) ? a : b;
}
static int64_t zr_i64_min(int64_t a, int64_t b) {
  return (a < b) ? a : b;
}

static zr_rect_t zr_fb_bounds_rect(const zr_fb_t* fb) {
  zr_rect_t r;
  r.x = 0;
  r.y = 0;
  r.w = fb ? (int32_t)fb->cols : 0;
  r.h = fb ? (int32_t)fb->rows : 0;
  return r;
}

/* Compute intersection of rectangles; returns empty rect if no overlap. */
static zr_rect_t zr_rect_intersect(zr_rect_t a, zr_rect_t b) {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) {
    return zr_rect_empty();
  }

  const int64_t ax2 = (int64_t)a.x + (int64_t)a.w;
  const int64_t ay2 = (int64_t)a.y + (int64_t)a.h;
  const int64_t bx2 = (int64_t)b.x + (int64_t)b.w;
  const int64_t by2 = (int64_t)b.y + (int64_t)b.h;

  zr_rect_t r;
  const int32_t x1 = zr_i32_max(a.x, b.x);
  const int32_t y1 = zr_i32_max(a.y, b.y);
  const int64_t x2 = zr_i64_min(ax2, bx2);
  const int64_t y2 = zr_i64_min(ay2, by2);

  r.x = x1;
  r.y = y1;

  int64_t w = x2 - (int64_t)x1;
  int64_t h = y2 - (int64_t)y1;
  if (w < 0) {
    w = 0;
  }
  if (h < 0) {
    h = 0;
  }
  if (w > (int64_t)INT32_MAX) {
    w = (int64_t)INT32_MAX;
  }
  if (h > (int64_t)INT32_MAX) {
    h = (int64_t)INT32_MAX;
  }
  r.w = (int32_t)w;
  r.h = (int32_t)h;
  return r;
}

static bool zr_rect_contains(zr_rect_t r, int32_t x, int32_t y) {
  if (r.w <= 0 || r.h <= 0) {
    return false;
  }
  if (x < r.x || y < r.y) {
    return false;
  }
  const int64_t x2 = (int64_t)r.x + (int64_t)r.w;
  const int64_t y2 = (int64_t)r.y + (int64_t)r.h;
  return ((int64_t)x < x2) && ((int64_t)y < y2);
}

static bool zr_fb_has_backing(const zr_fb_t* fb) {
  return fb && fb->cells && fb->cols != 0u && fb->rows != 0u;
}

/* Convert (x,y) coordinates to linear cell index with overflow-safe arithmetic. */
static bool zr_fb_cell_index(const zr_fb_t* fb, uint32_t x, uint32_t y, size_t* out_idx) {
  if (!out_idx) {
    return false;
  }
  if (!zr_fb_has_backing(fb)) {
    return false;
  }
  if (x >= fb->cols || y >= fb->rows) {
    return false;
  }

  size_t row_start = 0u;
  if (!zr_checked_mul_size((size_t)y, (size_t)fb->cols, &row_start)) {
    return false;
  }
  if (!zr_checked_add_size(row_start, (size_t)x, &row_start)) {
    return false;
  }
  *out_idx = row_start;
  return true;
}

static void zr_cell_set_space(zr_cell_t* cell, zr_style_t style) {
  if (!cell) {
    return;
  }
  memset(cell->glyph, 0, sizeof(cell->glyph));
  cell->glyph[0] = (uint8_t)' ';
  cell->glyph_len = 1u;
  cell->width = 1u;
  cell->_pad0 = 0u;
  cell->style = style;
}

static void zr_cell_set_grapheme_width1(zr_cell_t* cell, const uint8_t* bytes, size_t len, zr_style_t style) {
  if (!cell) {
    return;
  }
  memset(cell->glyph, 0, sizeof(cell->glyph));

  size_t copy_len = 0u;
  if (bytes && len != 0u) {
    copy_len = (len <= (size_t)ZR_CELL_GLYPH_MAX) ? len : (size_t)ZR_CELL_GLYPH_MAX;
    memcpy(cell->glyph, bytes, copy_len);
  }
  cell->glyph_len = (uint8_t)copy_len;
  cell->width = 1u;
  cell->_pad0 = 0u;
  cell->style = style;
}

static void zr_cell_set_continuation(zr_cell_t* cell, zr_style_t style) {
  if (!cell) {
    return;
  }
  memset(cell->glyph, 0, sizeof(cell->glyph));
  cell->glyph_len = 0u;
  cell->width = 0u;
  cell->_pad0 = 0u;
  cell->style = style;
}

static bool zr_cell_is_continuation(const zr_cell_t* cell) {
  return cell && cell->width == 0u;
}

static bool zr_cell_is_wide_lead(const zr_cell_t* cell) {
  return cell && cell->width == 2u;
}

static bool zr_i64_fits_i32(int64_t v) {
  return v >= (int64_t)INT32_MIN && v <= (int64_t)INT32_MAX;
}

/* Initialize framebuffer with specified dimensions; allocates backing store. */
zr_result_t zr_fb_init(zr_fb_t* fb, uint32_t cols, uint32_t rows) {
  if (!fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  fb->cols = 0u;
  fb->rows = 0u;
  fb->cells = NULL;
  return zr_fb_resize(fb, cols, rows);
}

/* Release framebuffer backing store and zero out dimensions. */
void zr_fb_release(zr_fb_t* fb) {
  if (!fb) {
    return;
  }
  free(fb->cells);
  fb->cells = NULL;
  fb->cols = 0u;
  fb->rows = 0u;
}

/* Get mutable pointer to cell at (x,y); returns NULL if out of bounds. */
zr_cell_t* zr_fb_cell(zr_fb_t* fb, uint32_t x, uint32_t y) {
  size_t idx = 0u;
  if (!zr_fb_cell_index(fb, x, y, &idx)) {
    return NULL;
  }
  return &fb->cells[idx];
}

/* Get const pointer to cell at (x,y); returns NULL if out of bounds. */
const zr_cell_t* zr_fb_cell_const(const zr_fb_t* fb, uint32_t x, uint32_t y) {
  size_t idx = 0u;
  if (!zr_fb_cell_index(fb, x, y, &idx)) {
    return NULL;
  }
  return &fb->cells[idx];
}

/* Fill all cells with spaces using the given style; ignores clip stack. */
zr_result_t zr_fb_clear(zr_fb_t* fb, const zr_style_t* style) {
  if (!fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_fb_has_backing(fb)) {
    return ZR_OK;
  }

  size_t total = 0u;
  if (!zr_checked_mul_size((size_t)fb->cols, (size_t)fb->rows, &total)) {
    return ZR_ERR_LIMIT;
  }

  const zr_style_t s = style ? *style : zr_style_default();
  for (size_t i = 0u; i < total; i++) {
    zr_cell_set_space(&fb->cells[i], s);
  }
  return ZR_OK;
}

/* Allocate cell array for cols*rows with overflow-safe size calculation. */
static zr_result_t zr_fb_alloc_cells(uint32_t cols, uint32_t rows, zr_cell_t** out_cells) {
  if (!out_cells) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_cells = NULL;

  if (cols == 0u || rows == 0u) {
    return ZR_OK;
  }
  if (cols > (uint32_t)INT32_MAX || rows > (uint32_t)INT32_MAX) {
    return ZR_ERR_LIMIT;
  }

  size_t count = 0u;
  size_t bytes = 0u;
  if (!zr_checked_mul_size((size_t)cols, (size_t)rows, &count)) {
    return ZR_ERR_LIMIT;
  }
  if (count == 0u) {
    return ZR_ERR_LIMIT;
  }
  if (!zr_checked_mul_size(count, sizeof(zr_cell_t), &bytes)) {
    return ZR_ERR_LIMIT;
  }
  if (bytes == 0u) {
    return ZR_ERR_LIMIT;
  }

  zr_cell_t* mem = (zr_cell_t*)malloc(bytes);
  if (!mem) {
    return ZR_ERR_OOM;
  }
  *out_cells = mem;
  return ZR_OK;
}

/* Validate and repair invariants for a single row after copy/resize. */
static void zr_fb_repair_row(zr_fb_t* fb, uint32_t y) {
  if (!fb || !zr_fb_has_backing(fb) || y >= fb->rows) {
    return;
  }
  if (fb->cols == 0u) {
    return;
  }

  for (uint32_t x = 0u; x < fb->cols; x++) {
    zr_cell_t* c = zr_fb_cell(fb, x, y);
    if (!c) {
      continue;
    }

    if (zr_cell_is_continuation(c)) {
      if (x == 0u) {
        zr_cell_set_space(c, c->style);
        continue;
      }
      const zr_cell_t* lead = zr_fb_cell_const(fb, x - 1u, y);
      if (!zr_cell_is_wide_lead(lead)) {
        zr_cell_set_space(c, c->style);
      }
      continue;
    }

    if (zr_cell_is_wide_lead(c)) {
      if (x + 1u >= fb->cols) {
        zr_cell_set_grapheme_width1(c, ZR_UTF8_REPLACEMENT, ZR_UTF8_REPLACEMENT_LEN, c->style);
        continue;
      }
      zr_cell_t* cont = zr_fb_cell(fb, x + 1u, y);
      if (!zr_cell_is_continuation(cont)) {
        zr_cell_set_grapheme_width1(c, ZR_UTF8_REPLACEMENT, ZR_UTF8_REPLACEMENT_LEN, c->style);
        zr_cell_set_space(cont, c->style);
      }
      continue;
    }
  }
}

/*
 * Resize framebuffer to new dimensions, preserving content where possible.
 *
 * On success, allocates new backing store and copies intersecting cells.
 * On failure (OOM/limit), returns error and leaves fb unchanged (no partial effects).
 */
zr_result_t zr_fb_resize(zr_fb_t* fb, uint32_t cols, uint32_t rows) {
  if (!fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (cols == fb->cols && rows == fb->rows) {
    return ZR_OK;
  }

  zr_cell_t* new_cells = NULL;
  zr_result_t rc = zr_fb_alloc_cells(cols, rows, &new_cells);
  if (rc != ZR_OK) {
    return rc;
  }

  zr_fb_t tmp;
  tmp.cols = cols;
  tmp.rows = rows;
  tmp.cells = new_cells;
  (void)zr_fb_clear(&tmp, NULL);

  if (zr_fb_has_backing(fb) && zr_fb_has_backing(&tmp)) {
    const uint32_t copy_cols = (fb->cols < tmp.cols) ? fb->cols : tmp.cols;
    const uint32_t copy_rows = (fb->rows < tmp.rows) ? fb->rows : tmp.rows;
    for (uint32_t y = 0u; y < copy_rows; y++) {
      for (uint32_t x = 0u; x < copy_cols; x++) {
        const zr_cell_t* src = zr_fb_cell_const(fb, x, y);
        zr_cell_t* dst = zr_fb_cell(&tmp, x, y);
        if (!src || !dst) {
          continue;
        }
        *dst = *src;
      }
      zr_fb_repair_row(&tmp, y);
    }
  }

  /* Commit. */
  free(fb->cells);
  fb->cells = new_cells;
  fb->cols = cols;
  fb->rows = rows;
  return ZR_OK;
}

/*
 * Initialize a painter with caller-provided clip stack storage.
 *
 * The clip stack starts with the full framebuffer bounds as the initial clip.
 * All drawing ops will be intersected with the current clip rectangle.
 */
zr_result_t zr_fb_painter_begin(zr_fb_painter_t* p, zr_fb_t* fb, zr_rect_t* clip_stack, uint32_t clip_cap) {
  if (!p || !fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (clip_cap == 0u || !clip_stack) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  p->fb = fb;
  p->clip_stack = clip_stack;
  p->clip_cap = clip_cap;
  p->clip_len = 1u;
  p->clip_stack[0] = zr_fb_bounds_rect(fb);
  return ZR_OK;
}

static zr_rect_t zr_painter_clip_cur(const zr_fb_painter_t* p) {
  if (!p || !p->clip_stack || p->clip_len == 0u) {
    return zr_rect_empty();
  }
  return p->clip_stack[p->clip_len - 1u];
}

/* Push a new clip rectangle; intersected with current clip and framebuffer bounds. */
zr_result_t zr_fb_clip_push(zr_fb_painter_t* p, zr_rect_t clip) {
  if (!p || !p->clip_stack || !p->fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (p->clip_len >= p->clip_cap) {
    return ZR_ERR_LIMIT;
  }

  const zr_rect_t bounds = zr_fb_bounds_rect(p->fb);
  zr_rect_t next = zr_rect_intersect(bounds, clip);
  next = zr_rect_intersect(zr_painter_clip_cur(p), next);
  p->clip_stack[p->clip_len++] = next;
  return ZR_OK;
}

/* Pop the most recent clip rectangle; returns ZR_ERR_LIMIT if at initial clip. */
zr_result_t zr_fb_clip_pop(zr_fb_painter_t* p) {
  if (!p || !p->clip_stack) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (p->clip_len <= 1u) {
    return ZR_ERR_LIMIT;
  }
  p->clip_len--;
  return ZR_OK;
}

static bool zr_painter_can_touch(const zr_fb_painter_t* p, int32_t x, int32_t y) {
  if (!p || !p->fb) {
    return false;
  }
  if (x < 0 || y < 0) {
    return false;
  }
  if ((uint32_t)x >= p->fb->cols || (uint32_t)y >= p->fb->rows) {
    return false;
  }
  return zr_rect_contains(zr_painter_clip_cur(p), x, y);
}

static bool zr_painter_can_write_width2(const zr_fb_painter_t* p, uint32_t x, uint32_t y) {
  if (!p || !p->fb) {
    return false;
  }
  if (x + 1u >= p->fb->cols) {
    return false;
  }
  return zr_painter_can_touch(p, (int32_t)x, (int32_t)y) && zr_painter_can_touch(p, (int32_t)(x + 1u), (int32_t)y);
}

/*
 * Overwrite a single cell with a width-1 grapheme while preserving wide invariants.
 *
 * Why: Overwriting any part of an existing wide glyph must clear the paired cell.
 * Clip exception (LOCKED): paired-cell invariant repair may touch exactly one
 * immediate neighbor cell (x-1 or x+1) even when that neighbor is outside clip.
 * No other out-of-clip writes are allowed.
 */
static bool zr_painter_write_width1(zr_fb_painter_t* p, uint32_t x, uint32_t y, const uint8_t* bytes, size_t len,
                                    zr_style_t style) {
  if (!p || !p->fb) {
    return false;
  }
  if (!zr_painter_can_touch(p, (int32_t)x, (int32_t)y)) {
    return false;
  }

  zr_cell_t* c = zr_fb_cell(p->fb, x, y);
  if (!c) {
    return false;
  }

  /* If writing into a continuation cell, clear both cells (when possible). */
  if (zr_cell_is_continuation(c)) {
    if (x == 0u) {
      return false;
    }
    zr_cell_t* lead = zr_fb_cell(p->fb, x - 1u, y);
    if (!lead) {
      return false;
    }
    zr_cell_set_space(lead, style);
    zr_cell_set_space(c, style);
  }

  /* If overwriting a wide lead, clear its continuation too (when possible). */
  if (zr_cell_is_wide_lead(c)) {
    if (x + 1u >= p->fb->cols) {
      return false;
    }
    zr_cell_t* cont = zr_fb_cell(p->fb, x + 1u, y);
    if (!cont) {
      return false;
    }
    zr_cell_set_space(cont, style);
  }

  /* If next cell is a continuation (lead cell of a wide glyph), clear it too. */
  if (x + 1u < p->fb->cols) {
    zr_cell_t* next = zr_fb_cell(p->fb, x + 1u, y);
    if (zr_cell_is_continuation(next)) {
      zr_cell_set_space(next, style);
    }
  }

  zr_cell_set_grapheme_width1(c, bytes, len, style);
  return true;
}

/*
 * Write a width-2 grapheme (lead + continuation) while preserving invariants.
 *
 * Why: Both cells must be writable; otherwise callers must use replacement width-1.
 */
static bool zr_painter_write_width2(zr_fb_painter_t* p, uint32_t x, uint32_t y, const uint8_t* bytes, size_t len,
                                    zr_style_t style) {
  if (!p || !p->fb) {
    return false;
  }
  if (!zr_painter_can_write_width2(p, x, y)) {
    return false;
  }

  const uint8_t space = (uint8_t)' ';
  if (!zr_painter_write_width1(p, x, y, &space, 1u, style)) {
    return false;
  }
  if (!zr_painter_write_width1(p, x + 1u, y, &space, 1u, style)) {
    return false;
  }

  zr_cell_t* c0 = zr_fb_cell(p->fb, x, y);
  zr_cell_t* c1 = zr_fb_cell(p->fb, x + 1u, y);
  if (!c0 || !c1) {
    return false;
  }

  zr_cell_set_grapheme_width1(c0, bytes, len, style);
  c0->width = 2u;
  zr_cell_set_continuation(c1, style);
  return true;
}

/* Fill a rectangle with spaces using the given style; clip-aware. */
zr_result_t zr_fb_fill_rect(zr_fb_painter_t* p, zr_rect_t r, const zr_style_t* style) {
  if (!p || !p->fb || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (r.w <= 0 || r.h <= 0) {
    return ZR_OK;
  }
  if (!zr_fb_has_backing(p->fb)) {
    return ZR_OK;
  }

  const zr_rect_t bounds = zr_fb_bounds_rect(p->fb);
  zr_rect_t clip = zr_rect_intersect(bounds, zr_painter_clip_cur(p));
  zr_rect_t rr = zr_rect_intersect(r, bounds);
  rr = zr_rect_intersect(rr, clip);
  if (rr.w <= 0 || rr.h <= 0) {
    return ZR_OK;
  }

  const zr_style_t s = *style;
  const int64_t y_end = (int64_t)rr.y + (int64_t)rr.h;
  const int64_t x_end = (int64_t)rr.x + (int64_t)rr.w;
  const uint8_t space = (uint8_t)' ';
  for (int64_t yy = (int64_t)rr.y; yy < y_end; yy++) {
    for (int64_t xx = (int64_t)rr.x; xx < x_end; xx++) {
      if (xx < 0 || yy < 0) {
        continue;
      }
      if (!zr_i64_fits_i32(xx) || !zr_i64_fits_i32(yy)) {
        continue;
      }
      (void)zr_painter_write_width1(p, (uint32_t)(int32_t)xx, (uint32_t)(int32_t)yy, &space, 1u, s);
    }
  }
  return ZR_OK;
}

static zr_result_t zr_draw_repeat_ascii(zr_fb_painter_t* p, int32_t x, int32_t y, int32_t len, uint8_t ch,
                                        const zr_style_t* style) {
  if (!p || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (len <= 0) {
    return ZR_OK;
  }
  const zr_style_t s = *style;
  for (int32_t i = 0; i < len; i++) {
    const int32_t xx = x + i;
    if (xx < 0) {
      continue;
    }
    (void)zr_fb_put_grapheme(p, xx, y, &ch, 1u, 1u, &s);
  }
  return ZR_OK;
}

/* Draw a horizontal line of '-' characters; clip-aware. */
zr_result_t zr_fb_draw_hline(zr_fb_painter_t* p, int32_t x, int32_t y, int32_t len, const zr_style_t* style) {
  return zr_draw_repeat_ascii(p, x, y, len, (uint8_t)'-', style);
}

/* Draw a vertical line of '|' characters; clip-aware. */
zr_result_t zr_fb_draw_vline(zr_fb_painter_t* p, int32_t x, int32_t y, int32_t len, const zr_style_t* style) {
  if (!p || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (len <= 0) {
    return ZR_OK;
  }
  const zr_style_t s = *style;
  const uint8_t ch = (uint8_t)'|';
  for (int32_t i = 0; i < len; i++) {
    (void)zr_fb_put_grapheme(p, x, y + i, &ch, 1u, 1u, &s);
  }
  return ZR_OK;
}

/* Draw an ASCII box outline using '+', '-', and '|' characters; clip-aware. */
zr_result_t zr_fb_draw_box(zr_fb_painter_t* p, zr_rect_t r, const zr_style_t* style) {
  if (!p || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (r.w <= 0 || r.h <= 0) {
    return ZR_OK;
  }
  const zr_style_t s = *style;

  if (r.w == 1 && r.h == 1) {
    const uint8_t ch = (uint8_t)'+';
    (void)zr_fb_put_grapheme(p, r.x, r.y, &ch, 1u, 1u, &s);
    return ZR_OK;
  }

  const uint8_t ch_h = (uint8_t)'-';
  const uint8_t ch_v = (uint8_t)'|';
  const uint8_t ch_c = (uint8_t)'+';

  const int64_t x1 = (int64_t)r.x;
  const int64_t y1 = (int64_t)r.y;
  const int64_t x2 = (int64_t)r.x + (int64_t)r.w - 1;
  const int64_t y2 = (int64_t)r.y + (int64_t)r.h - 1;

  if (zr_i64_fits_i32(x1) && zr_i64_fits_i32(y1)) {
    (void)zr_fb_put_grapheme(p, (int32_t)x1, (int32_t)y1, &ch_c, 1u, 1u, &s);
  }
  if (zr_i64_fits_i32(x2) && zr_i64_fits_i32(y1)) {
    (void)zr_fb_put_grapheme(p, (int32_t)x2, (int32_t)y1, &ch_c, 1u, 1u, &s);
  }
  if (zr_i64_fits_i32(x1) && zr_i64_fits_i32(y2)) {
    (void)zr_fb_put_grapheme(p, (int32_t)x1, (int32_t)y2, &ch_c, 1u, 1u, &s);
  }
  if (zr_i64_fits_i32(x2) && zr_i64_fits_i32(y2)) {
    (void)zr_fb_put_grapheme(p, (int32_t)x2, (int32_t)y2, &ch_c, 1u, 1u, &s);
  }

  const int64_t x_inner_start = (int64_t)r.x + 1;
  const int64_t x_inner_end = (int64_t)r.x + (int64_t)r.w - 1;
  for (int64_t xx = x_inner_start; xx < x_inner_end; xx++) {
    if (!zr_i64_fits_i32(xx) || !zr_i64_fits_i32(y1) || !zr_i64_fits_i32(y2)) {
      continue;
    }
    (void)zr_fb_put_grapheme(p, (int32_t)xx, (int32_t)y1, &ch_h, 1u, 1u, &s);
    (void)zr_fb_put_grapheme(p, (int32_t)xx, (int32_t)y2, &ch_h, 1u, 1u, &s);
  }
  const int64_t y_inner_start = (int64_t)r.y + 1;
  const int64_t y_inner_end = (int64_t)r.y + (int64_t)r.h - 1;
  for (int64_t yy = y_inner_start; yy < y_inner_end; yy++) {
    if (!zr_i64_fits_i32(x1) || !zr_i64_fits_i32(x2) || !zr_i64_fits_i32(yy)) {
      continue;
    }
    (void)zr_fb_put_grapheme(p, (int32_t)x1, (int32_t)yy, &ch_v, 1u, 1u, &s);
    (void)zr_fb_put_grapheme(p, (int32_t)x2, (int32_t)yy, &ch_v, 1u, 1u, &s);
  }
  return ZR_OK;
}

/* Draw a vertical scrollbar with track background and '#' thumb; clip-aware. */
zr_result_t zr_fb_draw_scrollbar_v(zr_fb_painter_t* p, zr_rect_t track, zr_rect_t thumb, const zr_style_t* track_style,
                                   const zr_style_t* thumb_style) {
  if (!p || !track_style || !thumb_style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  (void)zr_fb_fill_rect(p, track, track_style);
  const uint8_t ch = (uint8_t)'#';
  const zr_style_t ts = *thumb_style;
  const int64_t y_end = (int64_t)thumb.y + (int64_t)thumb.h;
  const int64_t x_end = (int64_t)thumb.x + (int64_t)thumb.w;
  for (int64_t yy = (int64_t)thumb.y; yy < y_end; yy++) {
    for (int64_t xx = (int64_t)thumb.x; xx < x_end; xx++) {
      if (!zr_i64_fits_i32(xx) || !zr_i64_fits_i32(yy)) {
        continue;
      }
      (void)zr_fb_put_grapheme(p, (int32_t)xx, (int32_t)yy, &ch, 1u, 1u, &ts);
    }
  }
  return ZR_OK;
}

/* Draw a horizontal scrollbar (delegates to vertical implementation). */
zr_result_t zr_fb_draw_scrollbar_h(zr_fb_painter_t* p, zr_rect_t track, zr_rect_t thumb, const zr_style_t* track_style,
                                   const zr_style_t* thumb_style) {
  return zr_fb_draw_scrollbar_v(p, track, thumb, track_style, thumb_style);
}

/*
 * Place a pre-segmented grapheme at (x,y) with specified display width.
 *
 * Replacement policy (LOCKED):
 *   - len > ZR_CELL_GLYPH_MAX: render U+FFFD (width 1)
 *   - width==2 but cannot fully fit: render U+FFFD (width 1)
 *
 * This ensures wide glyphs are never split (no half-glyph state).
 */
zr_result_t zr_fb_put_grapheme(zr_fb_painter_t* p, int32_t x, int32_t y, const uint8_t* bytes, size_t len,
                               uint8_t width, const zr_style_t* style) {
  if (!p || !p->fb || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_fb_has_backing(p->fb)) {
    return ZR_OK;
  }
  if (width != 1u && width != 2u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (len > 0u && !bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  const zr_style_t s = *style;
  const uint8_t space = (uint8_t)' ';
  const uint8_t* out_bytes = bytes;
  size_t out_len = len;
  bool try_wide = (width == 2u);

  /*
   * Canonicalize empty graphemes to a drawable width-1 space.
   *
   * Why: width-1 cells with glyph_len==0 are non-drawable and can desynchronize
   * terminal cursor state in strict renderers when diff emits style + no bytes.
   */
  if (out_len == 0u) {
    out_bytes = &space;
    out_len = 1u;
    try_wide = false;
  }

  if (out_len > (size_t)ZR_CELL_GLYPH_MAX) {
    out_bytes = ZR_UTF8_REPLACEMENT;
    out_len = ZR_UTF8_REPLACEMENT_LEN;
    try_wide = false;
  }

  /*
   * Ensure framebuffer never stores bytes that could be interpreted as terminal
   * control output (invalid UTF-8, ASCII controls, or C1 controls).
   *
   * Why: The diff renderer emits glyph bytes verbatim. Strict terminals can
   * treat control bytes as cursor movement or mode changes, causing drift and
   * visual artifacts.
   */
  if (!zr_fb_utf8_grapheme_bytes_safe_for_terminal(out_bytes, out_len)) {
    out_bytes = ZR_UTF8_REPLACEMENT;
    out_len = ZR_UTF8_REPLACEMENT_LEN;
    try_wide = false;
  }

  if (x < 0 || y < 0) {
    return ZR_OK;
  }
  const uint32_t ux = (uint32_t)x;
  const uint32_t uy = (uint32_t)y;
  if (ux >= p->fb->cols || uy >= p->fb->rows) {
    return ZR_OK;
  }

  if (try_wide) {
    const bool can_wide = zr_painter_write_width2(p, ux, uy, out_bytes, out_len, s);
    if (can_wide) {
      return ZR_OK;
    }
    /* Replacement policy: never half-glyph. */
    out_bytes = ZR_UTF8_REPLACEMENT;
    out_len = ZR_UTF8_REPLACEMENT_LEN;
  }

  (void)zr_painter_write_width1(p, ux, uy, out_bytes, out_len, s);
  return ZR_OK;
}

static bool zr_rects_overlap(zr_rect_t a, zr_rect_t b) {
  zr_rect_t i = zr_rect_intersect(a, b);
  return i.w > 0 && i.h > 0;
}

/*
 * Copy cells from src rect to dst rect with memmove-like overlap safety.
 *
 * Preserves wide-glyph invariants by skipping continuation cells (their lead
 * cells handle the copy). Clip-aware for the destination.
 */
zr_result_t zr_fb_blit_rect(zr_fb_painter_t* p, zr_rect_t dst, zr_rect_t src) {
  if (!p || !p->fb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (dst.w <= 0 || dst.h <= 0 || src.w <= 0 || src.h <= 0) {
    return ZR_OK;
  }
  if (!zr_fb_has_backing(p->fb)) {
    return ZR_OK;
  }

  const int32_t w = (dst.w < src.w) ? dst.w : src.w;
  const int32_t h = (dst.h < src.h) ? dst.h : src.h;
  if (w <= 0 || h <= 0) {
    return ZR_OK;
  }

  zr_rect_t dst_eff = dst;
  dst_eff.w = w;
  dst_eff.h = h;
  zr_rect_t src_eff = src;
  src_eff.w = w;
  src_eff.h = h;

  const bool overlap = zr_rects_overlap(dst_eff, src_eff);
  int32_t y0 = 0;
  int32_t y1 = h;
  int32_t ystep = 1;
  int32_t x0 = 0;
  int32_t x1 = w;
  int32_t xstep = 1;

  if (overlap) {
    if (dst_eff.y > src_eff.y) {
      y0 = h - 1;
      y1 = -1;
      ystep = -1;
    } else if (dst_eff.y == src_eff.y && dst_eff.x > src_eff.x) {
      x0 = w - 1;
      x1 = -1;
      xstep = -1;
    }
  }

  zr_rect_t clip = zr_painter_clip_cur(p);

  for (int32_t oy = y0; oy != y1; oy += ystep) {
    const int32_t sy = src_eff.y + oy;
    const int32_t dy = dst_eff.y + oy;

    for (int32_t ox = x0; ox != x1; ox += xstep) {
      const int32_t sx = src_eff.x + ox;
      const int32_t dx = dst_eff.x + ox;

      if (!zr_rect_contains(clip, dx, dy)) {
        continue;
      }
      if (sx < 0 || sy < 0 || dx < 0 || dy < 0) {
        continue;
      }
      const uint32_t usx = (uint32_t)sx;
      const uint32_t usy = (uint32_t)sy;
      if (usx >= p->fb->cols || usy >= p->fb->rows) {
        continue;
      }

      const zr_cell_t* c = zr_fb_cell_const(p->fb, usx, usy);
      if (!c) {
        continue;
      }

      /* Continuations are written by their lead cell. */
      if (zr_cell_is_continuation(c)) {
        continue;
      }

      (void)zr_fb_put_grapheme(p, dx, dy, c->glyph, (size_t)c->glyph_len, c->width, &c->style);
    }
  }

  return ZR_OK;
}

/* Count total display width (in cells) for UTF-8 text using pinned width policy. */
size_t zr_fb_count_cells_utf8(const uint8_t* bytes, size_t len) {
  if (!bytes || len == 0u) {
    return 0u;
  }

  size_t total = 0u;
  zr_grapheme_iter_t it;
  zr_grapheme_iter_init(&it, bytes, len);

  zr_grapheme_t g;
  while (zr_grapheme_next(&it, &g)) {
    const uint8_t w = zr_width_grapheme_utf8(bytes + g.offset, g.size, zr_width_policy_default());
    total += (size_t)w;
  }

  return total;
}

/*
 * Draw UTF-8 text by iterating graphemes with pinned width policy.
 *
 * Applies replacement policy for oversized graphemes and wide glyphs that
 * cannot fit within clip. Cursor advancement is stable regardless of clipping
 * to maintain deterministic layout.
 */
zr_result_t zr_fb_draw_text_bytes(zr_fb_painter_t* p, int32_t x, int32_t y, const uint8_t* bytes, size_t len,
                                  const zr_style_t* style) {
  if (!p || !p->fb || !bytes || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_fb_has_backing(p->fb) || len == 0u) {
    return ZR_OK;
  }
  if (y < 0) {
    return ZR_OK;
  }
  if ((uint32_t)y >= p->fb->rows) {
    return ZR_OK;
  }

  int64_t cx = (int64_t)x;
  zr_grapheme_iter_t it;
  zr_grapheme_iter_init(&it, bytes, len);

  zr_grapheme_t g;
  while (zr_grapheme_next(&it, &g)) {
    const uint8_t* gb = bytes + g.offset;
    const size_t gl = g.size;
    const uint8_t w = zr_width_grapheme_utf8(gb, gl, zr_width_policy_default());
    if (w == 0u) {
      continue;
    }

    const uint8_t* out_bytes = gb;
    size_t out_len = gl;
    uint8_t out_w = w;
    uint8_t out_adv = w;

    /* Replacement policy: oversized grapheme -> U+FFFD, width 1. */
    if (out_len > (size_t)ZR_CELL_GLYPH_MAX) {
      out_bytes = ZR_UTF8_REPLACEMENT;
      out_len = ZR_UTF8_REPLACEMENT_LEN;
      out_w = 1u;
      out_adv = 1u;
    }

    /*
      Replacement policy: a wide glyph must either write both cells or be
      replaced with U+FFFD (width 1). Clipping/bounds may therefore reduce the
      on-screen width to 1 when the lead cell is drawable but the continuation is not.

      Important: cursor advancement must not depend on clipping; layout stays stable even
      when the drawn glyph is replaced.
    */
    if (out_w == 2u) {
      out_adv = 2u;
      const int64_t cx1 = cx + 1;
      if (zr_i64_fits_i32(cx) && zr_i64_fits_i32(cx1)) {
        const int32_t ix = (int32_t)cx;
        const bool lead_touch = zr_painter_can_touch(p, ix, y);
        if (!lead_touch) {
          /* Fully clipped/outside: draw nothing, keep logical advance 2. */
          out_w = 0u;
        } else if (!zr_painter_can_touch(p, ix + 1, y)) {
          /* Lead visible but wide can't fit: replace, keep logical advance 2. */
          out_bytes = ZR_UTF8_REPLACEMENT;
          out_len = ZR_UTF8_REPLACEMENT_LEN;
          out_w = 1u;
          out_adv = 2u;
        }
      } else {
        /* Off-range: draw nothing, keep logical advance 2. */
        out_w = 0u;
      }
    }

    if (out_w != 0u && zr_i64_fits_i32(cx)) {
      (void)zr_fb_put_grapheme(p, (int32_t)cx, y, out_bytes, out_len, out_w, style);
    }

    if (cx > (int64_t)INT32_MAX - (int64_t)out_adv) {
      return ZR_ERR_LIMIT;
    }
    cx += (int64_t)out_adv;
  }

  return ZR_OK;
}
