/*
  src/core/zr_diff.c — Pure framebuffer diff renderer implementation.

  Why: Emits minimal VT output by diffing previous/next framebuffers while
  preserving grapheme/style correctness and deterministic terminal state.
*/

#include "core/zr_diff.h"

#include "util/zr_checked.h"
#include "util/zr_string_builder.h"

#include <stdbool.h>
#include <string.h>

/* --- Color Format Constants --- */

/* RGB color format: 0x00RRGGBB (red in bits 16-23, green 8-15, blue 0-7). */
#define ZR_RGB_R_SHIFT 16u
#define ZR_RGB_G_SHIFT 8u
#define ZR_RGB_MASK 0xFFu

/* xterm 256-color cube: 6 levels per channel (indices 16-231). */
static const uint8_t ZR_XTERM256_LEVELS[6] = {0u, 95u, 135u, 175u, 215u, 255u};
#define ZR_XTERM256_CUBE_START 16u
#define ZR_XTERM256_CUBE_SIZE 6u

/* xterm 256-color grayscale ramp: 24 shades (indices 232-255). */
#define ZR_XTERM256_GRAY_START 232u
#define ZR_XTERM256_GRAY_COUNT 24u
#define ZR_XTERM256_GRAY_BASE 8u  /* First gray level value */
#define ZR_XTERM256_GRAY_STEP 10u /* Increment per gray level */

/* xterm-compatible 16-color palette (ANSI colors 0-15). */
static const uint8_t ZR_ANSI16_PALETTE[16][3] = {
    /* Standard colors (0-7) */
    {0u, 0u, 0u},       /* 0: Black */
    {205u, 0u, 0u},     /* 1: Red */
    {0u, 205u, 0u},     /* 2: Green */
    {205u, 205u, 0u},   /* 3: Yellow */
    {0u, 0u, 238u},     /* 4: Blue */
    {205u, 0u, 205u},   /* 5: Magenta */
    {0u, 205u, 205u},   /* 6: Cyan */
    {229u, 229u, 229u}, /* 7: White */
    /* Bright colors (8-15) */
    {127u, 127u, 127u}, /* 8: Bright Black (Gray) */
    {255u, 0u, 0u},     /* 9: Bright Red */
    {0u, 255u, 0u},     /* 10: Bright Green */
    {255u, 255u, 0u},   /* 11: Bright Yellow */
    {92u, 92u, 255u},   /* 12: Bright Blue */
    {255u, 0u, 255u},   /* 13: Bright Magenta */
    {0u, 255u, 255u},   /* 14: Bright Cyan */
    {255u, 255u, 255u}, /* 15: Bright White */
};

/* SGR (Select Graphic Rendition) codes. */
#define ZR_SGR_RESET 0u
#define ZR_SGR_BOLD 1u
#define ZR_SGR_DIM 2u
#define ZR_SGR_ITALIC 3u
#define ZR_SGR_UNDERLINE 4u
#define ZR_SGR_REVERSE 7u
#define ZR_SGR_STRIKETHROUGH 9u
#define ZR_SGR_NORMAL_INTENSITY 22u
#define ZR_SGR_FG_256 38u        /* Extended foreground color */
#define ZR_SGR_BG_256 48u        /* Extended background color */
#define ZR_SGR_COLOR_MODE_256 5u /* 256-color mode selector */
#define ZR_SGR_COLOR_MODE_RGB 2u /* RGB color mode selector */

/* ANSI 16-color SGR base codes. */
#define ZR_SGR_FG_BASE 30u    /* FG colors 0-7: 30-37 */
#define ZR_SGR_FG_BRIGHT 90u  /* FG colors 8-15: 90-97 */
#define ZR_SGR_BG_BASE 40u    /* BG colors 0-7: 40-47 */
#define ZR_SGR_BG_BRIGHT 100u /* BG colors 8-15: 100-107 */

/* Style attribute bits (v1). */
#define ZR_STYLE_ATTR_BOLD (1u << 0)
#define ZR_STYLE_ATTR_ITALIC (1u << 1)
#define ZR_STYLE_ATTR_UNDERLINE (1u << 2)
#define ZR_STYLE_ATTR_REVERSE (1u << 3)
#define ZR_STYLE_ATTR_DIM (1u << 4)
#define ZR_STYLE_ATTR_STRIKE (1u << 5)
#define ZR_STYLE_ATTR_INTENSITY_MASK (ZR_STYLE_ATTR_BOLD | ZR_STYLE_ATTR_DIM)

/* Adaptive sweep threshold tuning (dirty-row density, percent). */
#define ZR_DIFF_SWEEP_DIRTY_LINE_PCT_BASE 35u
#define ZR_DIFF_SWEEP_DIRTY_LINE_PCT_WIDE_FRAME 30u
#define ZR_DIFF_SWEEP_DIRTY_LINE_PCT_SMALL_FRAME 45u
#define ZR_DIFF_SWEEP_DIRTY_LINE_PCT_VERY_DIRTY 25u
#define ZR_DIFF_SWEEP_VERY_DIRTY_NUM 3u
#define ZR_DIFF_SWEEP_VERY_DIRTY_DEN 4u

/* Scroll detection short-circuit thresholds. */
#define ZR_SCROLL_MAX_DELTA 64u
#define ZR_SCROLL_MIN_DIRTY_LINES 4u
#define ZR_DIFF_DIRTY_ROW_COUNT_UNKNOWN 0xFFFFFFFFu
#define ZR_DIFF_RECT_INDEX_NONE 0xFFFFFFFFu

/* FNV-1a 64-bit row fingerprint constants. */
#define ZR_FNV64_OFFSET_BASIS 14695981039346656037ull
#define ZR_FNV64_PRIME 1099511628211ull

typedef struct zr_attr_map_t {
  uint32_t bit;
  uint32_t sgr;
} zr_attr_map_t;

static const zr_attr_map_t ZR_SGR_ATTRS[] = {
    {ZR_STYLE_ATTR_BOLD, ZR_SGR_BOLD},
    {ZR_STYLE_ATTR_DIM, ZR_SGR_DIM},
    {ZR_STYLE_ATTR_ITALIC, ZR_SGR_ITALIC},
    {ZR_STYLE_ATTR_UNDERLINE, ZR_SGR_UNDERLINE},
    {ZR_STYLE_ATTR_REVERSE, ZR_SGR_REVERSE},
    {ZR_STYLE_ATTR_STRIKE, ZR_SGR_STRIKETHROUGH},
};

static bool zr_style_eq(zr_style_t a, zr_style_t b) {
  return a.fg_rgb == b.fg_rgb && a.bg_rgb == b.bg_rgb && a.attrs == b.attrs && a.reserved == b.reserved;
}

/* Compare two framebuffer cells for equality (glyph, flags, and style). */
static bool zr_cell_eq(const zr_cell_t* a, const zr_cell_t* b) {
  if (!a || !b) {
    return false;
  }
  if (a->glyph_len != b->glyph_len) {
    return false;
  }
  if (a->width != b->width) {
    return false;
  }
  if (!zr_style_eq(a->style, b->style)) {
    return false;
  }
  if (a->glyph_len != 0u && memcmp(a->glyph, b->glyph, (size_t)a->glyph_len) != 0) {
    return false;
  }
  return true;
}

static bool zr_cell_is_continuation(const zr_cell_t* c) {
  return c && c->width == 0u;
}

static size_t zr_fb_row_bytes(const zr_fb_t* fb) {
  if (!fb || fb->cols == 0u) {
    return 0u;
  }
  return (size_t)fb->cols * sizeof(zr_cell_t);
}

static const uint8_t* zr_fb_row_ptr(const zr_fb_t* fb, uint32_t y) {
  if (!fb || !fb->cells || y >= fb->rows) {
    return NULL;
  }

  size_t row_off_cells = 0u;
  if (!zr_checked_mul_size((size_t)y, (size_t)fb->cols, &row_off_cells)) {
    return NULL;
  }
  return (const uint8_t*)&fb->cells[row_off_cells];
}

/* Exact row compare over cell storage bytes; false means "maybe dirty". */
static bool zr_row_eq_exact(const zr_fb_t* a, uint32_t ay, const zr_fb_t* b, uint32_t by) {
  if (!a || !b || a->cols != b->cols) {
    return false;
  }
  const size_t row_bytes = zr_fb_row_bytes(a);
  const uint8_t* pa = zr_fb_row_ptr(a, ay);
  const uint8_t* pb = zr_fb_row_ptr(b, by);
  if (!pa || !pb) {
    return false;
  }
  if (row_bytes == 0u) {
    return true;
  }
  return memcmp(pa, pb, row_bytes) == 0;
}

static uint64_t zr_hash_bytes_fnv1a64(const uint8_t* bytes, size_t n) {
  if (!bytes && n != 0u) {
    return 0u;
  }
  uint64_t h = ZR_FNV64_OFFSET_BASIS;
  for (size_t i = 0u; i < n; i++) {
    h ^= (uint64_t)bytes[i];
    h *= ZR_FNV64_PRIME;
  }
  return h;
}

static uint64_t zr_row_hash64(const zr_fb_t* fb, uint32_t y) {
  if (!fb || y >= fb->rows) {
    return 0u;
  }
  const uint8_t* row = zr_fb_row_ptr(fb, y);
  const size_t row_bytes = zr_fb_row_bytes(fb);
  if (!row && row_bytes != 0u) {
    return 0u;
  }
  return zr_hash_bytes_fnv1a64(row, row_bytes);
}

/* Return display width of cell at (x,y): 0 for continuation, 2 for wide, 1 otherwise. */
static uint8_t zr_cell_width_in_next(const zr_fb_t* fb, uint32_t x, uint32_t y) {
  const zr_cell_t* c = zr_fb_cell_const(fb, x, y);
  if (!c) {
    return 1u;
  }
  if (zr_cell_is_continuation(c)) {
    return 0u;
  }
  if (c->width == 2u) {
    return 2u;
  }
  if (x + 1u < fb->cols) {
    const zr_cell_t* c1 = zr_fb_cell_const(fb, x + 1u, y);
    if (zr_cell_is_continuation(c1)) {
      return 2u;
    }
  }
  return 1u;
}

static uint8_t zr_rgb_r(uint32_t rgb) {
  return (uint8_t)((rgb >> ZR_RGB_R_SHIFT) & ZR_RGB_MASK);
}
static uint8_t zr_rgb_g(uint32_t rgb) {
  return (uint8_t)((rgb >> ZR_RGB_G_SHIFT) & ZR_RGB_MASK);
}
static uint8_t zr_rgb_b(uint32_t rgb) {
  return (uint8_t)(rgb & ZR_RGB_MASK);
}

/* Compute squared Euclidean distance between two RGB colors. */
static uint32_t zr_dist2_u8(uint8_t ar, uint8_t ag, uint8_t ab, uint8_t br, uint8_t bg, uint8_t bb) {
  const int32_t dr = (int32_t)ar - (int32_t)br;
  const int32_t dg = (int32_t)ag - (int32_t)bg;
  const int32_t db = (int32_t)ab - (int32_t)bb;
  return (uint32_t)(dr * dr + dg * dg + db * db);
}

/* Find the nearest xterm 256-color cube level (0-5) for a single RGB component. */
static uint8_t zr_xterm256_component_level(uint8_t v) {
  uint8_t best_i = 0u;
  uint32_t best_d = 0xFFFFFFFFu;
  for (uint8_t i = 0u; i < ZR_XTERM256_CUBE_SIZE; i++) {
    const int32_t diff = (int32_t)v - (int32_t)ZR_XTERM256_LEVELS[i];
    const uint32_t d = (uint32_t)(diff * diff);
    if (d < best_d) {
      best_d = d;
      best_i = i;
    }
  }
  return best_i;
}

/*
 * Map 24-bit RGB to nearest xterm 256-color index.
 * Compares against both the 6x6x6 color cube (16-231) and
 * grayscale ramp (232-255), returning whichever is closer.
 */
static uint8_t zr_rgb_to_xterm256(uint32_t rgb) {
  const uint8_t r = zr_rgb_r(rgb);
  const uint8_t g = zr_rgb_g(rgb);
  const uint8_t b = zr_rgb_b(rgb);

  /* Color cube candidate (16..231). */
  const uint8_t ri = zr_xterm256_component_level(r);
  const uint8_t gi = zr_xterm256_component_level(g);
  const uint8_t bi = zr_xterm256_component_level(b);
  const uint8_t cr = ZR_XTERM256_LEVELS[ri];
  const uint8_t cg = ZR_XTERM256_LEVELS[gi];
  const uint8_t cb = ZR_XTERM256_LEVELS[bi];
  const uint8_t cube_idx = (uint8_t)(ZR_XTERM256_CUBE_START + (ZR_XTERM256_CUBE_SIZE * ZR_XTERM256_CUBE_SIZE) * ri +
                                     ZR_XTERM256_CUBE_SIZE * gi + bi);
  const uint32_t cube_d = zr_dist2_u8(r, g, b, cr, cg, cb);

  /* Grayscale ramp candidate (232..255), levels 8 + 10*i (i=0..23). */
  uint8_t best_gray_i = 0u;
  uint32_t best_gray_d = 0xFFFFFFFFu;
  for (uint8_t i = 0u; i < ZR_XTERM256_GRAY_COUNT; i++) {
    const uint8_t gv = (uint8_t)(ZR_XTERM256_GRAY_BASE + ZR_XTERM256_GRAY_STEP * i);
    const uint32_t d = zr_dist2_u8(r, g, b, gv, gv, gv);
    if (d < best_gray_d) {
      best_gray_d = d;
      best_gray_i = i;
    }
  }
  const uint8_t gray_idx = (uint8_t)(ZR_XTERM256_GRAY_START + best_gray_i);
  const uint32_t gray_d = best_gray_d;

  if (gray_d < cube_d) {
    return gray_idx;
  }
  if (cube_d < gray_d) {
    return cube_idx;
  }
  /* Tie-break: choose the smaller xterm index deterministically. */
  return (gray_idx < cube_idx) ? gray_idx : cube_idx;
}

/* Map 24-bit RGB to nearest ANSI 16-color index (0-15). */
static uint8_t zr_rgb_to_ansi16(uint32_t rgb) {
  const uint8_t r = zr_rgb_r(rgb);
  const uint8_t g = zr_rgb_g(rgb);
  const uint8_t b = zr_rgb_b(rgb);

  uint8_t best = 0u;
  uint32_t best_d = 0xFFFFFFFFu;
  for (uint8_t i = 0u; i < 16u; i++) {
    const uint32_t d = zr_dist2_u8(r, g, b, ZR_ANSI16_PALETTE[i][0], ZR_ANSI16_PALETTE[i][1], ZR_ANSI16_PALETTE[i][2]);
    if (d < best_d) {
      best_d = d;
      best = i;
    } else if (d == best_d && i < best) {
      best = i;
    }
  }
  return best;
}

/* Downgrade style colors/attrs based on terminal capabilities (RGB → 256 → 16). */
static zr_style_t zr_style_apply_caps(zr_style_t in, const plat_caps_t* caps) {
  zr_style_t out = in;
  if (!caps) {
    return out;
  }
  out.attrs &= caps->sgr_attrs_supported;

  if (caps->color_mode == PLAT_COLOR_MODE_RGB) {
    return out;
  }
  if (caps->color_mode == PLAT_COLOR_MODE_256) {
    out.fg_rgb = (uint32_t)zr_rgb_to_xterm256(out.fg_rgb);
    out.bg_rgb = (uint32_t)zr_rgb_to_xterm256(out.bg_rgb);
    return out;
  }
  if (caps->color_mode == PLAT_COLOR_MODE_16) {
    out.fg_rgb = (uint32_t)zr_rgb_to_ansi16(out.fg_rgb);
    out.bg_rgb = (uint32_t)zr_rgb_to_ansi16(out.bg_rgb);
    return out;
  }

  /* Unknown: deterministically degrade to 16. */
  out.fg_rgb = (uint32_t)zr_rgb_to_ansi16(out.fg_rgb);
  out.bg_rgb = (uint32_t)zr_rgb_to_ansi16(out.bg_rgb);
  return out;
}

/* Write u32 as decimal ASCII digits to string builder. */
static bool zr_sb_write_u32_dec(zr_sb_t* sb, uint32_t v) {
  char tmp[10];
  size_t n = 0u;
  do {
    tmp[n++] = (char)('0' + (char)(v % 10u));
    v /= 10u;
  } while (v != 0u && n < sizeof(tmp));

  for (size_t i = 0u; i < n; i++) {
    const uint8_t ch = (uint8_t)tmp[n - 1u - i];
    if (!zr_sb_write_u8(sb, ch)) {
      return false;
    }
  }
  return true;
}

/* Emit CUP (cursor position) escape sequence if cursor is not already at (x,y). */
static bool zr_emit_cup(zr_sb_t* sb, zr_term_state_t* ts, uint32_t x, uint32_t y) {
  if (!sb || !ts) {
    return false;
  }
  if (ts->cursor_x == x && ts->cursor_y == y) {
    return true;
  }
  const uint8_t esc = 0x1Bu;
  if (!zr_sb_write_u8(sb, esc) || !zr_sb_write_u8(sb, (uint8_t)'[')) {
    return false;
  }
  if (!zr_sb_write_u32_dec(sb, y + 1u) || !zr_sb_write_u8(sb, (uint8_t)';') || !zr_sb_write_u32_dec(sb, x + 1u) ||
      !zr_sb_write_u8(sb, (uint8_t)'H')) {
    return false;
  }
  ts->cursor_x = x;
  ts->cursor_y = y;
  return true;
}

static bool zr_emit_cursor_visibility(zr_sb_t* sb, zr_term_state_t* ts, uint8_t visible) {
  if (!sb || !ts) {
    return false;
  }
  if (visible > 1u) {
    return false;
  }
  if (ts->cursor_visible == visible) {
    return true;
  }

  const uint8_t seq_show[] = "\x1b[?25h";
  const uint8_t seq_hide[] = "\x1b[?25l";
  const uint8_t* seq = (visible != 0u) ? seq_show : seq_hide;
  const size_t n = sizeof(seq_show) - 1u;
  if (!zr_sb_write_bytes(sb, seq, n)) {
    return false;
  }
  ts->cursor_visible = visible;
  return true;
}

static uint32_t zr_cursor_shape_ps(uint8_t shape, uint8_t blink) {
  if (shape == ZR_CURSOR_SHAPE_UNDERLINE) {
    return (blink != 0u) ? 3u : 4u;
  }
  if (shape == ZR_CURSOR_SHAPE_BAR) {
    return (blink != 0u) ? 5u : 6u;
  }
  return (blink != 0u) ? 1u : 2u;
}

static bool zr_emit_cursor_shape(zr_sb_t* sb, zr_term_state_t* ts, uint8_t shape, uint8_t blink,
                                 const plat_caps_t* caps) {
  if (!sb || !ts || !caps) {
    return false;
  }
  if (shape > ZR_CURSOR_SHAPE_BAR || blink > 1u) {
    return false;
  }
  if (caps->supports_cursor_shape == 0u) {
    return true;
  }
  if (ts->cursor_shape == shape && ts->cursor_blink == blink) {
    return true;
  }

  const uint32_t ps = zr_cursor_shape_ps(shape, blink);
  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[') || !zr_sb_write_u32_dec(sb, ps) ||
      !zr_sb_write_u8(sb, (uint8_t)' ') || !zr_sb_write_u8(sb, (uint8_t)'q')) {
    return false;
  }

  ts->cursor_shape = shape;
  ts->cursor_blink = blink;
  return true;
}

static uint32_t zr_clamp_u32_from_i32(int32_t v, uint32_t lo, uint32_t hi) {
  if (hi < lo) {
    return lo;
  }
  if (v <= (int32_t)lo) {
    return lo;
  }
  if (v >= (int32_t)hi) {
    return hi;
  }
  return (uint32_t)v;
}

static bool zr_emit_cursor_desired(zr_sb_t* sb, zr_term_state_t* ts, const zr_cursor_state_t* desired,
                                   const zr_fb_t* next, const plat_caps_t* caps) {
  if (!sb || !ts || !next || !caps) {
    return false;
  }
  if (!desired) {
    return true;
  }

  if (!zr_emit_cursor_shape(sb, ts, desired->shape, desired->blink, caps)) {
    return false;
  }
  if (!zr_emit_cursor_visibility(sb, ts, desired->visible)) {
    return false;
  }

  if (next->cols == 0u || next->rows == 0u) {
    return true;
  }

  uint32_t x = ts->cursor_x;
  uint32_t y = ts->cursor_y;
  if (desired->x != -1) {
    x = zr_clamp_u32_from_i32(desired->x, 0u, next->cols - 1u);
  }
  if (desired->y != -1) {
    y = zr_clamp_u32_from_i32(desired->y, 0u, next->rows - 1u);
  }

  return zr_emit_cup(sb, ts, x, y);
}

static bool zr_emit_sgr_color_param(zr_sb_t* sb, zr_style_t desired, const plat_caps_t* caps, bool foreground) {
  if (!sb) {
    return false;
  }
  if (!caps || caps->color_mode == PLAT_COLOR_MODE_RGB) {
    const uint32_t rgb = foreground ? desired.fg_rgb : desired.bg_rgb;
    const uint8_t r = zr_rgb_r(rgb);
    const uint8_t g = zr_rgb_g(rgb);
    const uint8_t b = zr_rgb_b(rgb);
    const uint32_t base = foreground ? ZR_SGR_FG_256 : ZR_SGR_BG_256;

    if (!zr_sb_write_u32_dec(sb, base) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, ZR_SGR_COLOR_MODE_RGB) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, (uint32_t)r) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, (uint32_t)g) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, (uint32_t)b)) {
      return false;
    }
    return true;
  }

  if (caps->color_mode == PLAT_COLOR_MODE_256) {
    const uint32_t idx = foreground ? (desired.fg_rgb & 0xFFu) : (desired.bg_rgb & 0xFFu);
    const uint32_t base = foreground ? ZR_SGR_FG_256 : ZR_SGR_BG_256;
    if (!zr_sb_write_u32_dec(sb, base) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, ZR_SGR_COLOR_MODE_256) || !zr_sb_write_u8(sb, (uint8_t)';') ||
        !zr_sb_write_u32_dec(sb, idx)) {
      return false;
    }
    return true;
  }

  /* 16-color (or unknown degraded to 16): desired.fg_rgb/bg_rgb are indices 0..15. */
  const uint8_t idx = (uint8_t)((foreground ? desired.fg_rgb : desired.bg_rgb) & 0x0Fu);
  const uint32_t code =
      foreground ? ((idx < 8u) ? (ZR_SGR_FG_BASE + (uint32_t)idx) : (ZR_SGR_FG_BRIGHT + (uint32_t)(idx - 8u)))
                 : ((idx < 8u) ? (ZR_SGR_BG_BASE + (uint32_t)idx) : (ZR_SGR_BG_BRIGHT + (uint32_t)(idx - 8u)));
  return zr_sb_write_u32_dec(sb, code);
}

/* Emit full SGR sequence with reset to establish an exact style baseline. */
static bool zr_emit_sgr_absolute(zr_sb_t* sb, zr_term_state_t* ts, zr_style_t desired, const plat_caps_t* caps) {
  if (!sb || !ts) {
    return false;
  }
  desired = zr_style_apply_caps(desired, caps);
  if (zr_style_eq(ts->style, desired)) {
    return true;
  }

  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[') || !zr_sb_write_u32_dec(sb, ZR_SGR_RESET)) {
    return false;
  }

  for (size_t i = 0u; i < (sizeof(ZR_SGR_ATTRS) / sizeof(ZR_SGR_ATTRS[0])); i++) {
    if ((desired.attrs & ZR_SGR_ATTRS[i].bit) == 0u) {
      continue;
    }
    if (!zr_sb_write_u8(sb, (uint8_t)';') || !zr_sb_write_u32_dec(sb, ZR_SGR_ATTRS[i].sgr)) {
      return false;
    }
  }

  if (!zr_sb_write_u8(sb, (uint8_t)';') || !zr_emit_sgr_color_param(sb, desired, caps, true) ||
      !zr_sb_write_u8(sb, (uint8_t)';') || !zr_emit_sgr_color_param(sb, desired, caps, false) ||
      !zr_sb_write_u8(sb, (uint8_t)'m')) {
    return false;
  }

  ts->style = desired;
  return true;
}

static bool zr_emit_sgr_delta(zr_sb_t* sb, zr_term_state_t* ts, zr_style_t desired, const plat_caps_t* caps) {
  if (!sb || !ts) {
    return false;
  }
  desired = zr_style_apply_caps(desired, caps);
  if (zr_style_eq(ts->style, desired)) {
    return true;
  }

  /*
    Delta-safe subset:
      - add attrs (1/2/3/4/7/9) without reset
      - clear intensity attrs (bold/dim) via 22 + desired intensity reapply
      - update fg/bg colors directly
    Attr clears require reset to avoid backend-specific off-code assumptions.
  */
  const uint32_t current_attrs = ts->style.attrs;
  const uint32_t desired_attrs = desired.attrs;
  const uint32_t removed_attrs = current_attrs & ~desired_attrs;
  if ((removed_attrs & ~ZR_STYLE_ATTR_INTENSITY_MASK) != 0u) {
    return zr_emit_sgr_absolute(sb, ts, desired, caps);
  }

  const uint32_t current_intensity = current_attrs & ZR_STYLE_ATTR_INTENSITY_MASK;
  const uint32_t desired_intensity = desired_attrs & ZR_STYLE_ATTR_INTENSITY_MASK;
  const bool intensity_changed = (current_intensity != desired_intensity);
  const bool intensity_needs_reset = intensity_changed && current_intensity != 0u;

  const bool fg_changed = (ts->style.fg_rgb != desired.fg_rgb);
  const bool bg_changed = (ts->style.bg_rgb != desired.bg_rgb);
  bool attrs_added = false;
  if (!intensity_needs_reset && (desired_intensity & ~current_intensity) != 0u) {
    attrs_added = true;
  }
  for (size_t i = 0u; i < (sizeof(ZR_SGR_ATTRS) / sizeof(ZR_SGR_ATTRS[0])); i++) {
    if ((ZR_SGR_ATTRS[i].bit & ZR_STYLE_ATTR_INTENSITY_MASK) != 0u) {
      continue;
    }
    if ((desired.attrs & ZR_SGR_ATTRS[i].bit) != 0u && (ts->style.attrs & ZR_SGR_ATTRS[i].bit) == 0u) {
      attrs_added = true;
      break;
    }
  }

  if (!attrs_added && !fg_changed && !bg_changed && !intensity_changed) {
    ts->style = desired;
    return true;
  }

  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[')) {
    return false;
  }

  bool wrote_any = false;
  if (intensity_needs_reset) {
    if (!zr_sb_write_u32_dec(sb, ZR_SGR_NORMAL_INTENSITY)) {
      return false;
    }
    wrote_any = true;
  }

  if (intensity_needs_reset) {
    if ((desired_intensity & ZR_STYLE_ATTR_BOLD) != 0u) {
      if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
        return false;
      }
      if (!zr_sb_write_u32_dec(sb, ZR_SGR_BOLD)) {
        return false;
      }
      wrote_any = true;
    }
    if ((desired_intensity & ZR_STYLE_ATTR_DIM) != 0u) {
      if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
        return false;
      }
      if (!zr_sb_write_u32_dec(sb, ZR_SGR_DIM)) {
        return false;
      }
      wrote_any = true;
    }
  } else {
    if ((desired_intensity & ZR_STYLE_ATTR_BOLD) != 0u && (current_intensity & ZR_STYLE_ATTR_BOLD) == 0u) {
      if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
        return false;
      }
      if (!zr_sb_write_u32_dec(sb, ZR_SGR_BOLD)) {
        return false;
      }
      wrote_any = true;
    }
    if ((desired_intensity & ZR_STYLE_ATTR_DIM) != 0u && (current_intensity & ZR_STYLE_ATTR_DIM) == 0u) {
      if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
        return false;
      }
      if (!zr_sb_write_u32_dec(sb, ZR_SGR_DIM)) {
        return false;
      }
      wrote_any = true;
    }
  }

  for (size_t i = 0u; i < (sizeof(ZR_SGR_ATTRS) / sizeof(ZR_SGR_ATTRS[0])); i++) {
    if ((ZR_SGR_ATTRS[i].bit & ZR_STYLE_ATTR_INTENSITY_MASK) != 0u) {
      continue;
    }
    if ((desired.attrs & ZR_SGR_ATTRS[i].bit) == 0u || (ts->style.attrs & ZR_SGR_ATTRS[i].bit) != 0u) {
      continue;
    }
    if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
      return false;
    }
    if (!zr_sb_write_u32_dec(sb, ZR_SGR_ATTRS[i].sgr)) {
      return false;
    }
    wrote_any = true;
  }

  if (fg_changed) {
    if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
      return false;
    }
    if (!zr_emit_sgr_color_param(sb, desired, caps, true)) {
      return false;
    }
    wrote_any = true;
  }
  if (bg_changed) {
    if (wrote_any && !zr_sb_write_u8(sb, (uint8_t)';')) {
      return false;
    }
    if (!zr_emit_sgr_color_param(sb, desired, caps, false)) {
      return false;
    }
    wrote_any = true;
  }

  if (!wrote_any) {
    ts->style = desired;
    return true;
  }

  if (!zr_sb_write_u8(sb, (uint8_t)'m')) {
    return false;
  }
  ts->style = desired;
  return true;
}

/* Check if cell at (x,y) differs between prev and next framebuffers.
 * Also returns true if wide-glyph continuation cell changed. */
static bool zr_line_dirty_at(const zr_fb_t* prev, const zr_fb_t* next, uint32_t x, uint32_t y) {
  const zr_cell_t* a = zr_fb_cell_const(prev, x, y);
  const zr_cell_t* b = zr_fb_cell_const(next, x, y);
  if (!a || !b) {
    return false;
  }
  if (!zr_cell_eq(a, b)) {
    return true;
  }
  /* Wide-glyph rule: a dirty continuation forces inclusion of its lead cell. */
  if (x + 1u < prev->cols) {
    const zr_cell_t* a1 = zr_fb_cell_const(prev, x + 1u, y);
    const zr_cell_t* b1 = zr_fb_cell_const(next, x + 1u, y);
    const bool cont = zr_cell_is_continuation(a1) || zr_cell_is_continuation(b1);
    if (cont && a1 && b1 && !zr_cell_eq(a1, b1)) {
      return true;
    }
  }
  return false;
}

typedef struct zr_diff_ctx_t {
  const zr_fb_t* prev;
  const zr_fb_t* next;
  const plat_caps_t* caps;
  uint64_t* prev_row_hashes;
  uint64_t* next_row_hashes;
  uint8_t* dirty_rows;
  uint32_t dirty_row_count;
  bool has_row_cache;
  zr_sb_t sb;
  zr_term_state_t ts;
  zr_diff_stats_t stats;
  zr_damage_t damage;
} zr_diff_ctx_t;

typedef struct zr_scroll_plan_t {
  bool active;
  bool up;
  uint32_t top;
  uint32_t bottom;
  uint32_t lines;
  uint32_t moved_lines;
} zr_scroll_plan_t;

static void zr_diff_zero_outputs(size_t* out_len, zr_term_state_t* out_final_term_state, zr_diff_stats_t* out_stats) {
  if (out_len) {
    *out_len = 0u;
  }
  if (out_final_term_state) {
    memset(out_final_term_state, 0, sizeof(*out_final_term_state));
  }
  if (out_stats) {
    memset(out_stats, 0, sizeof(*out_stats));
  }
}

static zr_result_t zr_diff_validate_args(const zr_fb_t* prev, const zr_fb_t* next, const plat_caps_t* caps,
                                         const zr_term_state_t* initial_term_state,
                                         const zr_cursor_state_t* desired_cursor_state, const zr_limits_t* lim,
                                         zr_damage_rect_t* scratch_damage_rects, uint32_t scratch_damage_rect_cap,
                                         zr_diff_scratch_t* scratch, uint8_t enable_scroll_optimizations,
                                         const uint8_t* out_buf, const size_t* out_len,
                                         const zr_term_state_t* out_final_term_state,
                                         const zr_diff_stats_t* out_stats) {
  (void)enable_scroll_optimizations;
  (void)desired_cursor_state;
  if (!prev || !next || !caps || !initial_term_state || !lim || !out_buf || !out_len || !out_final_term_state ||
      !out_stats) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (prev->cols != next->cols || prev->rows != next->rows) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!scratch_damage_rects || scratch_damage_rect_cap < lim->diff_max_damage_rects) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (scratch) {
    const bool any = (scratch->prev_row_hashes != NULL) || (scratch->next_row_hashes != NULL) ||
                     (scratch->dirty_rows != NULL) || (scratch->row_cap != 0u) || (scratch->prev_hashes_valid != 0u);
    if (any) {
      if (!scratch->prev_row_hashes || !scratch->next_row_hashes || !scratch->dirty_rows) {
        return ZR_ERR_INVALID_ARGUMENT;
      }
      if (scratch->row_cap < next->rows) {
        return ZR_ERR_INVALID_ARGUMENT;
      }
    }
  }
  return ZR_OK;
}

/*
  Populate optional per-line hash/dirty caches.

  Why: A single row prepass lets later stages skip known-clean lines and
  avoid repeated full-width comparisons in damage and scroll analysis.
*/
static void zr_diff_prepare_row_cache(zr_diff_ctx_t* ctx, zr_diff_scratch_t* scratch) {
  if (!ctx || !ctx->prev || !ctx->next || !scratch) {
    return;
  }
  if (!scratch->prev_row_hashes || !scratch->next_row_hashes || !scratch->dirty_rows ||
      scratch->row_cap < ctx->next->rows) {
    return;
  }

  ctx->prev_row_hashes = scratch->prev_row_hashes;
  ctx->next_row_hashes = scratch->next_row_hashes;
  ctx->dirty_rows = scratch->dirty_rows;
  ctx->dirty_row_count = 0u;
  ctx->has_row_cache = true;

  const bool reuse_prev_hashes = (scratch->prev_hashes_valid != 0u);

  for (uint32_t y = 0u; y < ctx->next->rows; y++) {
    uint64_t prev_hash = 0u;
    if (reuse_prev_hashes) {
      prev_hash = ctx->prev_row_hashes[y];
    } else {
      prev_hash = zr_row_hash64(ctx->prev, y);
      ctx->prev_row_hashes[y] = prev_hash;
    }
    const uint64_t next_hash = zr_row_hash64(ctx->next, y);
    ctx->next_row_hashes[y] = next_hash;

    uint8_t dirty = 0u;
    if (prev_hash != next_hash) {
      dirty = 1u;
    } else if (!zr_row_eq_exact(ctx->prev, y, ctx->next, y)) {
      /* Collision guard: equal hash must still pass exact row-byte compare. */
      dirty = 1u;
      ctx->stats.collision_guard_hits++;
    }

    ctx->dirty_rows[y] = dirty;
    if (dirty != 0u) {
      ctx->dirty_row_count++;
    }
  }
}

/* Compare full framebuffer rows for scroll-shift detection (full width). */
static bool zr_row_eq(const zr_fb_t* a, uint32_t ay, const zr_fb_t* b, uint32_t by) {
  return zr_row_eq_exact(a, ay, b, by);
}

/* Deterministic preference order for competing scroll candidates. */
static bool zr_scroll_plan_better(const zr_scroll_plan_t* best, const zr_scroll_plan_t* cand, uint32_t cols) {
  if (!cand || !cand->active) {
    return false;
  }
  if (!best || !best->active) {
    return true;
  }

  const uint64_t best_cells = (uint64_t)best->moved_lines * (uint64_t)cols;
  const uint64_t cand_cells = (uint64_t)cand->moved_lines * (uint64_t)cols;
  if (cand_cells != best_cells) {
    return cand_cells > best_cells;
  }
  if (cand->moved_lines != best->moved_lines) {
    return cand->moved_lines > best->moved_lines;
  }
  if (cand->lines != best->lines) {
    return cand->lines < best->lines;
  }
  if (cand->top != best->top) {
    return cand->top < best->top;
  }
  if (cand->bottom != best->bottom) {
    return cand->bottom < best->bottom;
  }
  if (cand->up != best->up) {
    return cand->up;
  }
  return false;
}

static bool zr_scroll_saved_enough(uint32_t moved_lines, uint32_t cols) {
  enum {
    ZR_SCROLL_MIN_MOVED_LINES = 4u,
    ZR_SCROLL_MIN_SAVED_CELLS = 256u,
  };

  if (moved_lines < ZR_SCROLL_MIN_MOVED_LINES) {
    return false;
  }
  const uint64_t saved_cells = (uint64_t)moved_lines * (uint64_t)cols;
  return saved_cells >= (uint64_t)ZR_SCROLL_MIN_SAVED_CELLS;
}

/* Evaluate a contiguous run of row matches as a scroll-region candidate. */
static void zr_scroll_plan_consider_run(zr_scroll_plan_t* best, uint32_t cols, uint32_t rows, bool up,
                                        uint32_t run_start, uint32_t run_len, uint32_t delta) {
  if (!best || run_len == 0u || delta == 0u) {
    return;
  }

  zr_scroll_plan_t cand;
  memset(&cand, 0, sizeof(cand));
  cand.active = true;
  cand.up = up;
  cand.top = run_start;
  cand.bottom = (run_start + run_len - 1u) + delta;
  cand.lines = delta;
  cand.moved_lines = run_len;

  if (cand.bottom >= rows) {
    return;
  }
  if (!zr_scroll_saved_enough(cand.moved_lines, cols)) {
    return;
  }

  if (zr_scroll_plan_better(best, &cand, cols)) {
    *best = cand;
  }
}

/* Scan for the longest run of shifted-equal rows for a given delta + direction. */
static void zr_scroll_scan_delta_dir(const zr_fb_t* prev, const zr_fb_t* next, const uint64_t* prev_hashes,
                                     const uint64_t* next_hashes, uint32_t delta, bool up,
                                     zr_scroll_plan_t* inout_best) {
  if (!prev || !next || !inout_best) {
    return;
  }
  if (delta == 0u || delta >= next->rows) {
    return;
  }

  const uint32_t rows = next->rows;
  const uint32_t cols = next->cols;
  const uint32_t y_end = rows - delta;

  uint32_t run_start = 0u;
  uint32_t run_len = 0u;

  for (uint32_t y = 0u; y < y_end; y++) {
    const uint32_t next_y = up ? y : (y + delta);
    const uint32_t prev_y = up ? (y + delta) : y;

    if (inout_best->active) {
      const uint32_t remaining = y_end - y;
      if ((run_len + remaining) <= inout_best->moved_lines) {
        break;
      }
    }

    bool hash_match = true;
    if (prev_hashes && next_hashes) {
      hash_match = (next_hashes[next_y] == prev_hashes[prev_y]);
    }

    const bool match = hash_match && zr_row_eq(next, next_y, prev, prev_y);
    if (match) {
      if (run_len == 0u) {
        run_start = y;
      }
      run_len++;
      continue;
    }

    zr_scroll_plan_consider_run(inout_best, cols, rows, up, run_start, run_len, delta);
    run_len = 0u;
  }

  zr_scroll_plan_consider_run(inout_best, cols, rows, up, run_start, run_len, delta);
}

/*
 * Detect a vertical scroll within a full-width region.
 *
 * Why: When a large block of rows is identical after a vertical shift, emitting
 * DECSTBM + SU/SD lets the terminal do the bulk move and keeps output bounded
 * to the newly exposed lines.
 */
static zr_scroll_plan_t zr_diff_detect_scroll_fullwidth(const zr_fb_t* prev, const zr_fb_t* next,
                                                        const uint64_t* prev_hashes, const uint64_t* next_hashes,
                                                        uint32_t dirty_row_count) {
  zr_scroll_plan_t best;
  memset(&best, 0, sizeof(best));

  if (!prev || !next || prev->cols != next->cols || prev->rows != next->rows) {
    return best;
  }
  if (next->rows < 2u || next->cols == 0u) {
    return best;
  }
  if (dirty_row_count != ZR_DIFF_DIRTY_ROW_COUNT_UNKNOWN) {
    if (dirty_row_count == 0u) {
      return best;
    }
    if (dirty_row_count < ZR_SCROLL_MIN_DIRTY_LINES) {
      return best;
    }
  }

  const uint32_t rows = next->rows;

  uint32_t max_delta = rows - 1u;
  if (max_delta > ZR_SCROLL_MAX_DELTA) {
    max_delta = ZR_SCROLL_MAX_DELTA;
  }

  for (uint32_t delta = 1u; delta <= max_delta; delta++) {
    if (best.active) {
      const uint32_t moved_cap = rows - delta;
      if (moved_cap <= best.moved_lines) {
        continue;
      }
    }
    zr_scroll_scan_delta_dir(prev, next, prev_hashes, next_hashes, delta, true, &best);
    zr_scroll_scan_delta_dir(prev, next, prev_hashes, next_hashes, delta, false, &best);
  }

  if (!best.active) {
    return best;
  }

  /* Require a valid region: (bottom-top+1) > delta. */
  if (best.bottom <= best.top) {
    memset(&best, 0, sizeof(best));
    return best;
  }
  if ((best.bottom - best.top + 1u) <= best.lines) {
    memset(&best, 0, sizeof(best));
    return best;
  }
  if (best.lines == 0u) {
    memset(&best, 0, sizeof(best));
    return best;
  }

  return best;
}

static bool zr_emit_decstbm(zr_sb_t* sb, zr_term_state_t* ts, uint32_t top, uint32_t bottom) {
  if (!sb || !ts) {
    return false;
  }
  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[')) {
    return false;
  }
  if (!zr_sb_write_u32_dec(sb, top + 1u) || !zr_sb_write_u8(sb, (uint8_t)';') ||
      !zr_sb_write_u32_dec(sb, bottom + 1u) || !zr_sb_write_u8(sb, (uint8_t)'r')) {
    return false;
  }
  /* xterm/VT behavior: setting scroll margins homes the cursor. */
  ts->cursor_x = 0u;
  ts->cursor_y = 0u;
  return true;
}

static bool zr_emit_scroll_op(zr_sb_t* sb, zr_term_state_t* ts, bool up, uint32_t lines) {
  if (!sb || !ts) {
    return false;
  }
  if (lines == 0u) {
    return true;
  }
  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[')) {
    return false;
  }
  if (!zr_sb_write_u32_dec(sb, lines) || !zr_sb_write_u8(sb, up ? (uint8_t)'S' : (uint8_t)'T')) {
    return false;
  }
  return true;
}

static bool zr_emit_decstbm_reset(zr_sb_t* sb, zr_term_state_t* ts) {
  if (!sb || !ts) {
    return false;
  }
  if (!zr_sb_write_u8(sb, 0x1Bu) || !zr_sb_write_u8(sb, (uint8_t)'[') || !zr_sb_write_u8(sb, (uint8_t)'r')) {
    return false;
  }
  ts->cursor_x = 0u;
  ts->cursor_y = 0u;
  return true;
}

/* Render a contiguous span of dirty cells [start, end] on row y. */
static zr_result_t zr_diff_render_span(zr_diff_ctx_t* ctx, uint32_t y, uint32_t start, uint32_t end) {
  if (!ctx || !ctx->prev || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_emit_cup(&ctx->sb, &ctx->ts, start, y)) {
    return ZR_ERR_LIMIT;
  }

  for (uint32_t xx = start; xx <= end; xx++) {
    const zr_cell_t* c = zr_fb_cell_const(ctx->next, xx, y);
    if (!c) {
      continue;
    }
    const uint8_t w = zr_cell_width_in_next(ctx->next, xx, y);
    if (w == 0u) {
      continue;
    }

    /* If the cursor drifted (e.g. due to skipped continuations), use CUP only. */
    if (!zr_emit_cup(&ctx->sb, &ctx->ts, xx, y)) {
      return ZR_ERR_LIMIT;
    }
    if (!zr_emit_sgr_delta(&ctx->sb, &ctx->ts, c->style, ctx->caps)) {
      return ZR_ERR_LIMIT;
    }
    if (c->glyph_len != 0u) {
      if (!zr_sb_write_bytes(&ctx->sb, c->glyph, (size_t)c->glyph_len)) {
        return ZR_ERR_LIMIT;
      }
    }

    ctx->ts.cursor_x += (uint32_t)w;
  }

  return zr_sb_truncated(&ctx->sb) ? ZR_ERR_LIMIT : ZR_OK;
}

static zr_result_t zr_diff_render_full_line(zr_diff_ctx_t* ctx, uint32_t y) {
  if (!ctx || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ctx->next->cols == 0u) {
    return ZR_OK;
  }
  return zr_diff_render_span(ctx, y, 0u, ctx->next->cols - 1u);
}

static void zr_diff_expand_span_for_wide(const zr_fb_t* next, uint32_t y, uint32_t* inout_start, uint32_t* inout_end) {
  if (!next || !inout_start || !inout_end) {
    return;
  }
  if (next->cols == 0u || y >= next->rows) {
    return;
  }

  uint32_t start = *inout_start;
  uint32_t end = *inout_end;
  if (start >= next->cols || end >= next->cols) {
    return;
  }

  if (start > 0u) {
    const zr_cell_t* c = zr_fb_cell_const(next, start, y);
    if (zr_cell_is_continuation(c)) {
      start--;
    }
  }

  if (end + 1u < next->cols) {
    const uint8_t w = zr_cell_width_in_next(next, end, y);
    if (w == 2u) {
      end++;
    }
  }

  *inout_start = start;
  *inout_end = end;
}

static uint32_t zr_u32_mul_clamp(uint32_t a, uint32_t b) {
  size_t prod = 0u;
  if (!zr_checked_mul_size((size_t)a, (size_t)b, &prod)) {
    return 0xFFFFFFFFu;
  }
  return (prod > (size_t)0xFFFFFFFFu) ? 0xFFFFFFFFu : (uint32_t)prod;
}

static bool zr_diff_row_known_clean(const zr_diff_ctx_t* ctx, uint32_t y) {
  if (!ctx || !ctx->dirty_rows) {
    return false;
  }
  if (y >= ctx->next->rows) {
    return false;
  }
  return ctx->dirty_rows[y] == 0u;
}

static uint32_t zr_diff_sweep_threshold_pct(const zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next || ctx->next->rows == 0u) {
    return ZR_DIFF_SWEEP_DIRTY_LINE_PCT_BASE;
  }

  uint32_t threshold_pct = ZR_DIFF_SWEEP_DIRTY_LINE_PCT_BASE;

  if (ctx->next->rows <= 12u) {
    threshold_pct = ZR_DIFF_SWEEP_DIRTY_LINE_PCT_SMALL_FRAME;
  } else if (ctx->next->cols >= 120u) {
    threshold_pct = ZR_DIFF_SWEEP_DIRTY_LINE_PCT_WIDE_FRAME;
  }

  const uint64_t dirty_scaled = (uint64_t)ctx->dirty_row_count * (uint64_t)ZR_DIFF_SWEEP_VERY_DIRTY_DEN;
  const uint64_t very_dirty_scaled = (uint64_t)ctx->next->rows * (uint64_t)ZR_DIFF_SWEEP_VERY_DIRTY_NUM;
  if (dirty_scaled >= very_dirty_scaled) {
    threshold_pct = ZR_DIFF_SWEEP_DIRTY_LINE_PCT_VERY_DIRTY;
  }

  return threshold_pct;
}

static bool zr_diff_should_use_sweep(const zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next || ctx->next->rows == 0u) {
    return false;
  }
  if (!ctx->has_row_cache) {
    return false;
  }

  const uint32_t threshold_pct = zr_diff_sweep_threshold_pct(ctx);
  const uint64_t dirty_scaled = (uint64_t)ctx->dirty_row_count * 100u;
  const uint64_t rows_scaled = (uint64_t)ctx->next->rows * (uint64_t)threshold_pct;
  return dirty_scaled >= rows_scaled;
}

static bool zr_diff_span_overlaps_or_touches(const zr_damage_rect_t* r, uint32_t span_start, uint32_t span_end) {
  if (!r) {
    return false;
  }
  return (r->x0 <= span_end + 1u) && (r->x1 + 1u >= span_start);
}

/*
  Merge one rectangle into the current row span, flushing first when disjoint.

  Why: Both scan and indexed paths must preserve identical span flush order.
*/
static zr_result_t zr_diff_span_merge_or_flush(zr_diff_ctx_t* ctx, uint32_t y, const zr_damage_rect_t* r,
                                               bool* inout_have_span, uint32_t* inout_span_start,
                                               uint32_t* inout_span_end) {
  if (!ctx || !ctx->next || !r || !inout_have_span || !inout_span_start || !inout_span_end) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (!*inout_have_span) {
    *inout_span_start = r->x0;
    *inout_span_end = r->x1;
    *inout_have_span = true;
    return ZR_OK;
  }

  if (zr_diff_span_overlaps_or_touches(r, *inout_span_start, *inout_span_end)) {
    if (r->x0 < *inout_span_start) {
      *inout_span_start = r->x0;
    }
    if (r->x1 > *inout_span_end) {
      *inout_span_end = r->x1;
    }
    return ZR_OK;
  }

  const zr_result_t rc = zr_diff_render_span(ctx, y, *inout_span_start, *inout_span_end);
  if (rc != ZR_OK) {
    return rc;
  }

  *inout_span_start = r->x0;
  *inout_span_end = r->x1;
  return ZR_OK;
}

static zr_result_t zr_diff_span_flush(zr_diff_ctx_t* ctx, uint32_t y, bool have_span, uint32_t span_start,
                                      uint32_t span_end) {
  if (!ctx || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!have_span) {
    return ZR_OK;
  }
  return zr_diff_render_span(ctx, y, span_start, span_end);
}

static zr_result_t zr_diff_render_damage_coalesced_scan(zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  for (uint32_t y = 0u; y < ctx->next->rows; y++) {
    uint32_t span_start = 0u;
    uint32_t span_end = 0u;
    bool have_span = false;

    for (uint32_t i = 0u; i < ctx->damage.rect_count; i++) {
      const zr_damage_rect_t* r = &ctx->damage.rects[i];
      if (y < r->y0 || y > r->y1) {
        continue;
      }

      const zr_result_t rc = zr_diff_span_merge_or_flush(ctx, y, r, &have_span, &span_start, &span_end);
      if (rc != ZR_OK) {
        return rc;
      }
    }

    const zr_result_t rc = zr_diff_span_flush(ctx, y, have_span, span_start, span_end);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  return ZR_OK;
}

static uint32_t zr_diff_row_head_get(const uint64_t* row_heads, uint32_t y) {
  if (!row_heads) {
    return ZR_DIFF_RECT_INDEX_NONE;
  }
  return (uint32_t)row_heads[y];
}

static void zr_diff_row_head_set(uint64_t* row_heads, uint32_t y, uint32_t value) {
  if (!row_heads) {
    return;
  }
  row_heads[y] = (uint64_t)value;
}

static void zr_diff_row_heads_reset(uint64_t* row_heads, uint32_t rows) {
  if (!row_heads) {
    return;
  }
  for (uint32_t y = 0u; y < rows; y++) {
    zr_diff_row_head_set(row_heads, y, ZR_DIFF_RECT_INDEX_NONE);
  }
}

/*
  Use rect.y0 as a temporary intrusive "next" index while coalescing.

  Why: Indexed coalescing must stay allocation-free in the present hot path.
  Damage rectangles are frame-local scratch, so temporary link reuse is safe.
*/
static uint32_t zr_diff_rect_link_get(const zr_damage_rect_t* r) {
  if (!r) {
    return ZR_DIFF_RECT_INDEX_NONE;
  }
  return r->y0;
}

static void zr_diff_rect_link_set(zr_damage_rect_t* r, uint32_t next_idx) {
  if (!r) {
    return;
  }
  r->y0 = next_idx;
}

typedef struct zr_diff_active_rects_t {
  uint32_t head;
  uint32_t tail;
} zr_diff_active_rects_t;

static void zr_diff_active_rects_init(zr_diff_active_rects_t* active) {
  if (!active) {
    return;
  }
  active->head = ZR_DIFF_RECT_INDEX_NONE;
  active->tail = ZR_DIFF_RECT_INDEX_NONE;
}

static void zr_diff_active_rects_append(zr_diff_ctx_t* ctx, zr_diff_active_rects_t* active, uint32_t idx) {
  if (!ctx || !active || idx == ZR_DIFF_RECT_INDEX_NONE) {
    return;
  }
  zr_diff_rect_link_set(&ctx->damage.rects[idx], ZR_DIFF_RECT_INDEX_NONE);
  if (active->tail == ZR_DIFF_RECT_INDEX_NONE) {
    active->head = idx;
    active->tail = idx;
    return;
  }
  zr_diff_rect_link_set(&ctx->damage.rects[active->tail], idx);
  active->tail = idx;
}

static void zr_diff_active_rects_remove(zr_diff_ctx_t* ctx, zr_diff_active_rects_t* active, uint32_t prev_idx,
                                        uint32_t idx, uint32_t next_idx) {
  if (!ctx || !active || idx == ZR_DIFF_RECT_INDEX_NONE) {
    return;
  }
  if (prev_idx == ZR_DIFF_RECT_INDEX_NONE) {
    active->head = next_idx;
  } else {
    zr_diff_rect_link_set(&ctx->damage.rects[prev_idx], next_idx);
  }
  if (active->tail == idx) {
    active->tail = prev_idx;
  }
  zr_diff_rect_link_set(&ctx->damage.rects[idx], ZR_DIFF_RECT_INDEX_NONE);
}

/* Index rectangle starts by y0 while preserving ascending rectangle order. */
static void zr_diff_indexed_build_row_heads(zr_diff_ctx_t* ctx, uint64_t* row_heads, uint32_t rows) {
  if (!ctx || !row_heads) {
    return;
  }

  for (uint32_t i = ctx->damage.rect_count; i > 0u; i--) {
    const uint32_t idx = i - 1u;
    zr_damage_rect_t* r = &ctx->damage.rects[idx];
    const uint32_t start_y = r->y0;
    if (start_y >= rows) {
      continue;
    }
    const uint32_t head = zr_diff_row_head_get(row_heads, start_y);
    zr_diff_rect_link_set(r, head);
    zr_diff_row_head_set(row_heads, start_y, idx);
  }
}

static void zr_diff_indexed_activate_row(zr_diff_ctx_t* ctx, const uint64_t* row_heads, uint32_t y,
                                         zr_diff_active_rects_t* active) {
  if (!ctx || !row_heads || !active) {
    return;
  }

  uint32_t start_idx = zr_diff_row_head_get(row_heads, y);
  while (start_idx != ZR_DIFF_RECT_INDEX_NONE) {
    zr_damage_rect_t* r = &ctx->damage.rects[start_idx];
    const uint32_t next_start = zr_diff_rect_link_get(r);
    zr_diff_active_rects_append(ctx, active, start_idx);
    start_idx = next_start;
  }
}

static zr_result_t zr_diff_indexed_render_row(zr_diff_ctx_t* ctx, uint32_t y, zr_diff_active_rects_t* active) {
  if (!ctx || !ctx->next || !active) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  uint32_t span_start = 0u;
  uint32_t span_end = 0u;
  bool have_span = false;

  uint32_t prev_idx = ZR_DIFF_RECT_INDEX_NONE;
  uint32_t idx = active->head;
  while (idx != ZR_DIFF_RECT_INDEX_NONE) {
    zr_damage_rect_t* r = &ctx->damage.rects[idx];
    const uint32_t next_idx = zr_diff_rect_link_get(r);

    const zr_result_t rc = zr_diff_span_merge_or_flush(ctx, y, r, &have_span, &span_start, &span_end);
    if (rc != ZR_OK) {
      return rc;
    }

    if (r->y1 == y) {
      zr_diff_active_rects_remove(ctx, active, prev_idx, idx, next_idx);
    } else {
      prev_idx = idx;
    }

    idx = next_idx;
  }

  return zr_diff_span_flush(ctx, y, have_span, span_start, span_end);
}

static zr_result_t zr_diff_render_damage_coalesced_indexed(zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next || !ctx->prev_row_hashes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  const uint32_t rows = ctx->next->rows;
  uint64_t* row_heads = ctx->prev_row_hashes;
  zr_diff_row_heads_reset(row_heads, rows);
  zr_diff_indexed_build_row_heads(ctx, row_heads, rows);

  zr_diff_active_rects_t active;
  zr_diff_active_rects_init(&active);

  for (uint32_t y = 0u; y < rows; y++) {
    zr_diff_indexed_activate_row(ctx, row_heads, y, &active);
    const zr_result_t rc = zr_diff_indexed_render_row(ctx, y, &active);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  return ZR_OK;
}

static zr_result_t zr_diff_render_damage_coalesced(zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!ctx->has_row_cache || !ctx->prev_row_hashes) {
    return zr_diff_render_damage_coalesced_scan(ctx);
  }
  return zr_diff_render_damage_coalesced_indexed(ctx);
}

static zr_result_t zr_diff_build_damage(zr_diff_ctx_t* ctx, const zr_limits_t* lim, zr_damage_rect_t* scratch,
                                        uint32_t scratch_cap) {
  if (!ctx || !ctx->prev || !ctx->next || !lim || !scratch) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (scratch_cap < lim->diff_max_damage_rects) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_damage_begin_frame(&ctx->damage, scratch, lim->diff_max_damage_rects, ctx->next->cols, ctx->next->rows);

  for (uint32_t y = 0u; y < ctx->next->rows; y++) {
    if (zr_diff_row_known_clean(ctx, y)) {
      continue;
    }

    bool line_dirty = false;

    uint32_t x = 0u;
    while (x < ctx->next->cols) {
      if (!zr_line_dirty_at(ctx->prev, ctx->next, x, y)) {
        x++;
        continue;
      }

      uint32_t start = x;
      while (x < ctx->next->cols && zr_line_dirty_at(ctx->prev, ctx->next, x, y)) {
        x++;
      }
      uint32_t end = (x == 0u) ? 0u : (x - 1u);

      zr_diff_expand_span_for_wide(ctx->next, y, &start, &end);
      zr_damage_add_span(&ctx->damage, y, start, end);

      line_dirty = true;
      ctx->stats.dirty_cells += (end - start + 1u);

      if (ctx->damage.full_frame != 0u) {
        break;
      }
    }

    if (line_dirty) {
      ctx->stats.dirty_lines++;
    }
    if (ctx->damage.full_frame != 0u) {
      break;
    }
  }

  ctx->stats.damage_rects = ctx->damage.rect_count;
  ctx->stats.damage_cells = zr_damage_cells(&ctx->damage);
  ctx->stats.damage_full_frame = ctx->damage.full_frame;
  ctx->stats._pad0 = 0u;

  return ZR_OK;
}
/* Scan row y for dirty spans and render each one. */
static zr_result_t zr_diff_render_line(zr_diff_ctx_t* ctx, uint32_t y) {
  if (!ctx || !ctx->prev || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (zr_diff_row_known_clean(ctx, y)) {
    return ZR_OK;
  }

  bool line_dirty = false;

  uint32_t x = 0u;
  while (x < ctx->next->cols) {
    if (!zr_line_dirty_at(ctx->prev, ctx->next, x, y)) {
      x++;
      continue;
    }

    const uint32_t start = x;
    while (x < ctx->next->cols && zr_line_dirty_at(ctx->prev, ctx->next, x, y)) {
      x++;
    }
    const uint32_t end = (x == 0u) ? 0u : (x - 1u);

    const zr_result_t rc = zr_diff_render_span(ctx, y, start, end);
    if (rc != ZR_OK) {
      return rc;
    }

    line_dirty = true;
    ctx->stats.dirty_cells += (end - start + 1u);

    if (zr_sb_truncated(&ctx->sb)) {
      return ZR_ERR_LIMIT;
    }
  }

  if (line_dirty) {
    ctx->stats.dirty_lines++;
  }
  return ZR_OK;
}

static void zr_diff_finalize_damage_stats_sweep(zr_diff_ctx_t* ctx) {
  if (!ctx || !ctx->next) {
    return;
  }
  ctx->stats.damage_rects = ctx->stats.dirty_lines;
  ctx->stats.damage_cells = ctx->stats.dirty_cells;
  ctx->stats.damage_full_frame = 0u;
  ctx->stats._pad0 = 0u;
}

static zr_result_t zr_diff_render_sweep_rows(zr_diff_ctx_t* ctx, uint32_t skip_top, uint32_t skip_bottom,
                                             bool has_skip) {
  if (!ctx || !ctx->next) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  for (uint32_t y = 0u; y < ctx->next->rows; y++) {
    if (has_skip && y >= skip_top && y <= skip_bottom) {
      continue;
    }
    const zr_result_t rc = zr_diff_render_line(ctx, y);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  zr_diff_finalize_damage_stats_sweep(ctx);
  return ZR_OK;
}

/*
 * Try to apply a scroll-region optimization and report a row range to skip.
 *
 * Why: After emitting a terminal scroll for the moved block and redrawing the
 * newly exposed lines, the scrolled region is already synchronized with `next`,
 * so the normal per-row diff can skip it entirely.
 */
static zr_result_t zr_diff_try_scroll_opt(zr_diff_ctx_t* ctx, bool* out_skip, uint32_t* out_skip_top,
                                          uint32_t* out_skip_bottom) {
  if (!ctx || !out_skip || !out_skip_top || !out_skip_bottom) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  ctx->stats.scroll_opt_attempted = 1u;
  *out_skip = false;
  *out_skip_top = 0u;
  *out_skip_bottom = 0u;

  const uint32_t dirty_row_count = ctx->has_row_cache ? ctx->dirty_row_count : ZR_DIFF_DIRTY_ROW_COUNT_UNKNOWN;
  const zr_scroll_plan_t plan = zr_diff_detect_scroll_fullwidth(ctx->prev, ctx->next, ctx->prev_row_hashes,
                                                                ctx->next_row_hashes, dirty_row_count);
  if (!plan.active) {
    return ZR_OK;
  }
  ctx->stats.scroll_opt_hit = 1u;

  if (!zr_emit_decstbm(&ctx->sb, &ctx->ts, plan.top, plan.bottom)) {
    return ZR_ERR_LIMIT;
  }
  if (!zr_emit_scroll_op(&ctx->sb, &ctx->ts, plan.up, plan.lines)) {
    return ZR_ERR_LIMIT;
  }
  if (!zr_emit_decstbm_reset(&ctx->sb, &ctx->ts)) {
    return ZR_ERR_LIMIT;
  }

  /*
    After the terminal scroll, only the newly exposed lines need redraw.
    Redraw the full width to avoid relying on terminal-inserted blank style.
  */
  if (plan.up) {
    const uint32_t first_new = plan.bottom - plan.lines + 1u;
    for (uint32_t y = first_new; y <= plan.bottom; y++) {
      const zr_result_t rc = zr_diff_render_full_line(ctx, y);
      if (rc != ZR_OK) {
        return rc;
      }
      ctx->stats.dirty_lines++;
      ctx->stats.dirty_cells += ctx->next->cols;
    }
  } else {
    const uint32_t last_new = plan.top + plan.lines - 1u;
    for (uint32_t y = plan.top; y <= last_new; y++) {
      const zr_result_t rc = zr_diff_render_full_line(ctx, y);
      if (rc != ZR_OK) {
        return rc;
      }
      ctx->stats.dirty_lines++;
      ctx->stats.dirty_cells += ctx->next->cols;
    }
  }

  *out_skip = true;
  *out_skip_top = plan.top;
  *out_skip_bottom = plan.bottom;
  return zr_sb_truncated(&ctx->sb) ? ZR_ERR_LIMIT : ZR_OK;
}

zr_result_t zr_diff_render_ex(const zr_fb_t* prev, const zr_fb_t* next, const plat_caps_t* caps,
                              const zr_term_state_t* initial_term_state, const zr_cursor_state_t* desired_cursor_state,
                              const zr_limits_t* lim, zr_damage_rect_t* scratch_damage_rects,
                              uint32_t scratch_damage_rect_cap, zr_diff_scratch_t* scratch,
                              uint8_t enable_scroll_optimizations, uint8_t* out_buf, size_t out_cap, size_t* out_len,
                              zr_term_state_t* out_final_term_state, zr_diff_stats_t* out_stats) {
  /*
   * Render the difference between two framebuffers as VT/ANSI escape sequences.
   *
   * Iterates row-by-row, emitting cursor positioning (CUP) and styling (SGR)
   * only for cells that changed between prev and next. Wide characters are
   * handled by checking continuation flags.
   *
   * On success: writes output to out_buf, updates out_len/out_final_term_state/out_stats.
   * On failure: zeros all outputs and returns error code (no partial writes).
   */
  zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);

  const zr_result_t arg_rc = zr_diff_validate_args(
      prev, next, caps, initial_term_state, desired_cursor_state, lim, scratch_damage_rects, scratch_damage_rect_cap,
      scratch, enable_scroll_optimizations, out_buf, out_len, out_final_term_state, out_stats);
  if (arg_rc != ZR_OK) {
    return arg_rc;
  }

  zr_diff_ctx_t ctx;
  memset(&ctx, 0, sizeof(ctx));
  ctx.prev = prev;
  ctx.next = next;
  ctx.caps = caps;
  zr_sb_init(&ctx.sb, out_buf, out_cap);
  ctx.ts = *initial_term_state;
  zr_diff_prepare_row_cache(&ctx, scratch);

  bool skip = false;
  uint32_t skip_top = 0u;
  uint32_t skip_bottom = 0u;
  if (enable_scroll_optimizations != 0u && caps->supports_scroll_region != 0u) {
    const zr_result_t rc = zr_diff_try_scroll_opt(&ctx, &skip, &skip_top, &skip_bottom);
    if (rc != ZR_OK) {
      zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
      return rc;
    }
  }

  if (skip) {
    /* Conservative: treat scroll-move frames as full-frame damage for metrics. */
    ctx.stats.damage_full_frame = 1u;
    ctx.stats.damage_rects = 1u;
    ctx.stats.damage_cells = zr_u32_mul_clamp(next->cols, next->rows);
    ctx.stats._pad0 = 0u;

    for (uint32_t y = 0u; y < next->rows; y++) {
      if (y >= skip_top && y <= skip_bottom) {
        continue;
      }
      const zr_result_t rc = zr_diff_render_line(&ctx, y);
      if (rc != ZR_OK) {
        zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
        return rc;
      }
    }
  } else {
    if (zr_diff_should_use_sweep(&ctx)) {
      ctx.stats.path_sweep_used = 1u;
      ctx.stats.path_damage_used = 0u;
      ctx.stats.dirty_lines = 0u;
      ctx.stats.dirty_cells = 0u;
      const zr_result_t rc = zr_diff_render_sweep_rows(&ctx, 0u, 0u, false);
      if (rc != ZR_OK) {
        zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
        return rc;
      }
    } else {
      ctx.stats.path_sweep_used = 0u;
      ctx.stats.path_damage_used = 1u;
      zr_result_t rc = zr_diff_build_damage(&ctx, lim, scratch_damage_rects, scratch_damage_rect_cap);
      if (rc != ZR_OK) {
        zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
        return rc;
      }

      if (ctx.damage.full_frame != 0u) {
        ctx.stats.dirty_lines = 0u;
        ctx.stats.dirty_cells = 0u;

        for (uint32_t y = 0u; y < next->rows; y++) {
          rc = zr_diff_render_line(&ctx, y);
          if (rc != ZR_OK) {
            zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
            return rc;
          }
        }
      } else {
        rc = zr_diff_render_damage_coalesced(&ctx);
        if (rc != ZR_OK) {
          zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
          return rc;
        }
      }
    }
  }

  if (!zr_emit_cursor_desired(&ctx.sb, &ctx.ts, desired_cursor_state, next, caps)) {
    zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
    return ZR_ERR_LIMIT;
  }

  if (zr_sb_truncated(&ctx.sb)) {
    zr_diff_zero_outputs(out_len, out_final_term_state, out_stats);
    return ZR_ERR_LIMIT;
  }

  *out_len = zr_sb_len(&ctx.sb);
  *out_final_term_state = ctx.ts;
  ctx.stats.bytes_emitted = *out_len;
  *out_stats = ctx.stats;
  return ZR_OK;
}

zr_result_t zr_diff_render(const zr_fb_t* prev, const zr_fb_t* next, const plat_caps_t* caps,
                           const zr_term_state_t* initial_term_state, const zr_cursor_state_t* desired_cursor_state,
                           const zr_limits_t* lim, zr_damage_rect_t* scratch_damage_rects,
                           uint32_t scratch_damage_rect_cap, uint8_t enable_scroll_optimizations, uint8_t* out_buf,
                           size_t out_cap, size_t* out_len, zr_term_state_t* out_final_term_state,
                           zr_diff_stats_t* out_stats) {
  return zr_diff_render_ex(prev, next, caps, initial_term_state, desired_cursor_state, lim, scratch_damage_rects,
                           scratch_damage_rect_cap, NULL, enable_scroll_optimizations, out_buf, out_cap, out_len,
                           out_final_term_state, out_stats);
}
