/*
  src/core/zr_blit.c — Sub-cell blitter selector and shared deterministic helpers.

  Why: Keeps blitter selection/sampling/color math centralized so concrete
  blitters remain small and consistent across drawlist execution paths.
*/

#include "core/zr_blit.h"

#include "util/zr_checked.h"

#include <string.h>

/* --- BT.709 integer luminance weights (sum=10000) --- */
#define ZR_BLIT_LUMA_R_WEIGHT 2126u
#define ZR_BLIT_LUMA_G_WEIGHT 7152u
#define ZR_BLIT_LUMA_B_WEIGHT 722u
#define ZR_BLIT_LUMA_WEIGHT_SUM 10000u

static uint8_t zr_blit_is_valid_mode(zr_blitter_t mode) {
  return (mode >= ZR_BLIT_AUTO && mode <= ZR_BLIT_ASCII) ? 1u : 0u;
}

static uint8_t zr_blit_terminal_known_sextant(zr_terminal_id_t id) {
  switch (id) {
  case ZR_TERM_KITTY:
  case ZR_TERM_GHOSTTY:
  case ZR_TERM_WEZTERM:
  case ZR_TERM_FOOT:
  case ZR_TERM_CONTOUR:
    return 1u;
  default:
    return 0u;
  }
}

/* Build conservative blitter caps from the extended terminal profile snapshot. */
void zr_blit_caps_from_profile(const zr_terminal_profile_t* profile, zr_blit_caps_t* out_caps) {
  if (!out_caps) {
    return;
  }

  memset(out_caps, 0, sizeof(*out_caps));
  out_caps->supports_unicode = 1u;
  out_caps->supports_halfblock = 1u;
  out_caps->supports_quadrant = 1u;
  out_caps->supports_braille = 1u;

  if (!profile) {
    return;
  }

  out_caps->terminal_id = profile->id;
  if (profile->supports_grapheme_clusters == 0u) {
    out_caps->supports_unicode = 0u;
    out_caps->supports_halfblock = 0u;
    out_caps->supports_quadrant = 0u;
    out_caps->supports_braille = 0u;
    out_caps->supports_sextant = 0u;
    return;
  }

  out_caps->supports_sextant = zr_blit_terminal_known_sextant(profile->id);
}

/* Resolve requested blitter mode to an effective mode using deterministic policy. */
zr_result_t zr_blit_select(zr_blitter_t requested, const zr_blit_caps_t* caps, zr_blitter_t* out_effective) {
  if (!caps || !out_effective) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (zr_blit_is_valid_mode(requested) == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (requested == ZR_BLIT_PIXEL) {
    return ZR_ERR_UNSUPPORTED;
  }

  if (requested != ZR_BLIT_AUTO) {
    *out_effective = requested;
    return ZR_OK;
  }

  if (caps->is_dumb_terminal != 0u || caps->is_pipe_mode != 0u) {
    *out_effective = ZR_BLIT_ASCII;
    return ZR_OK;
  }

  if (caps->supports_unicode == 0u) {
    *out_effective = ZR_BLIT_ASCII;
    return ZR_OK;
  }

  if (caps->include_braille_in_auto != 0u && caps->supports_braille != 0u) {
    *out_effective = ZR_BLIT_BRAILLE;
    return ZR_OK;
  }

  if (caps->supports_sextant != 0u) {
    *out_effective = ZR_BLIT_SEXTANT;
    return ZR_OK;
  }

  if (caps->supports_quadrant != 0u) {
    *out_effective = ZR_BLIT_QUADRANT;
    return ZR_OK;
  }

  *out_effective = (caps->supports_halfblock != 0u) ? ZR_BLIT_HALFBLOCK : ZR_BLIT_ASCII;
  return ZR_OK;
}

uint8_t zr_blit_alpha_is_opaque(uint8_t alpha) {
  return (alpha >= ZR_BLIT_ALPHA_THRESHOLD) ? 1u : 0u;
}

uint32_t zr_blit_pack_rgb(uint8_t r, uint8_t g, uint8_t b) {
  const uint32_t rr = ((uint32_t)r << 16u);
  const uint32_t gg = ((uint32_t)g << 8u);
  const uint32_t bb = (uint32_t)b;
  return rr | gg | bb;
}

static uint8_t zr_blit_rgb_r(uint32_t rgb) {
  return (uint8_t)((rgb >> 16u) & 0xFFu);
}

static uint8_t zr_blit_rgb_g(uint32_t rgb) {
  return (uint8_t)((rgb >> 8u) & 0xFFu);
}

static uint8_t zr_blit_rgb_b(uint32_t rgb) {
  return (uint8_t)(rgb & 0xFFu);
}

uint32_t zr_blit_rgb_distance_sq(uint32_t rgb_a, uint32_t rgb_b) {
  const int32_t dr = (int32_t)zr_blit_rgb_r(rgb_a) - (int32_t)zr_blit_rgb_r(rgb_b);
  const int32_t dg = (int32_t)zr_blit_rgb_g(rgb_a) - (int32_t)zr_blit_rgb_g(rgb_b);
  const int32_t db = (int32_t)zr_blit_rgb_b(rgb_a) - (int32_t)zr_blit_rgb_b(rgb_b);
  return (uint32_t)((dr * dr) + (dg * dg) + (db * db));
}

uint32_t zr_blit_luma_bt709(uint32_t rgb) {
  const uint32_t r = (uint32_t)zr_blit_rgb_r(rgb);
  const uint32_t g = (uint32_t)zr_blit_rgb_g(rgb);
  const uint32_t b = (uint32_t)zr_blit_rgb_b(rgb);
  return (r * ZR_BLIT_LUMA_R_WEIGHT + g * ZR_BLIT_LUMA_G_WEIGHT + b * ZR_BLIT_LUMA_B_WEIGHT) / ZR_BLIT_LUMA_WEIGHT_SUM;
}

/* Map a destination sub-coordinate to a source axis index using floor division. */
uint32_t zr_blit_sample_axis(uint32_t sub_coord, uint32_t src_len, uint32_t dst_cells, uint32_t sub_per_cell) {
  uint64_t numer = 0u;
  uint64_t denom = 0u;
  uint32_t idx = 0u;

  if (src_len == 0u || dst_cells == 0u || sub_per_cell == 0u) {
    return 0u;
  }

  numer = (uint64_t)sub_coord * (uint64_t)src_len;
  denom = (uint64_t)dst_cells * (uint64_t)sub_per_cell;
  if (denom == 0u) {
    return 0u;
  }

  idx = (uint32_t)(numer / denom);
  if (idx >= src_len) {
    idx = src_len - 1u;
  }
  return idx;
}

/* Resolve one RGBA source sample from destination sub-cell coordinates. */
zr_result_t zr_blit_sample_subpixel(const zr_blit_input_t* input, uint32_t sub_x, uint32_t sub_y, uint32_t dst_cells_w,
                                    uint32_t dst_cells_h, uint32_t sub_w, uint32_t sub_h, uint8_t out_rgba[4]) {
  uint32_t sx = 0u;
  uint32_t sy = 0u;
  size_t row_off = 0u;
  size_t px_off = 0u;

  if (!input || !input->pixels || !out_rgba) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  sx = zr_blit_sample_axis(sub_x, input->px_width, dst_cells_w, sub_w);
  sy = zr_blit_sample_axis(sub_y, input->px_height, dst_cells_h, sub_h);

  if (!zr_checked_mul_size((size_t)sy, (size_t)input->stride, &row_off) ||
      !zr_checked_mul_size((size_t)sx, (size_t)ZR_BLIT_RGBA_BYTES_PER_PIXEL, &px_off)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  memcpy(out_rgba, input->pixels + row_off + px_off, ZR_BLIT_RGBA_BYTES_PER_PIXEL);
  return ZR_OK;
}

/* Write a single-width UTF-8 glyph into one framebuffer cell using clip-aware painter path. */
zr_result_t zr_blit_put_glyph(zr_fb_painter_t* painter, int32_t x, int32_t y, const zr_blit_glyph_t* glyph,
                              const zr_style_t* style) {
  if (!painter || !glyph || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (glyph->len == 0u || glyph->len > 4u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_fb_put_grapheme(painter, x, y, glyph->bytes, glyph->len, 1u, style);
}

const zr_blit_glyph_t zr_blit_halfblock_glyphs[4] = {
    {{0x20u, 0x00u, 0x00u, 0x00u}, 1u, {0u, 0u, 0u}}, /* space */
    {{0xE2u, 0x96u, 0x80u, 0x00u}, 3u, {0u, 0u, 0u}}, /* U+2580 upper half */
    {{0xE2u, 0x96u, 0x84u, 0x00u}, 3u, {0u, 0u, 0u}}, /* U+2584 lower half */
    {{0xE2u, 0x96u, 0x88u, 0x00u}, 3u, {0u, 0u, 0u}}  /* U+2588 full block */
};

/* Validate dispatch inputs shared across all concrete blitters. */
static zr_result_t zr_blit_validate_dispatch(zr_fb_painter_t* painter, zr_rect_t dst_rect, const zr_blit_input_t* input,
                                             const zr_blit_caps_t* caps, zr_blitter_t* out_effective,
                                             zr_blitter_t requested) {
  uint32_t min_stride = 0u;
  if (!painter || !painter->fb || !input || !input->pixels || !caps || !out_effective) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (dst_rect.w < 0 || dst_rect.h < 0) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (input->px_width == 0u || input->px_height == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_mul_u32((uint32_t)input->px_width, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &min_stride) ||
      (uint32_t)input->stride < min_stride) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_blit_select(requested, caps, out_effective);
}

/* Resolve effective mode and route to the concrete blitter implementation. */
zr_result_t zr_blit_dispatch(zr_fb_painter_t* painter, zr_rect_t dst_rect, const zr_blit_input_t* input,
                             zr_blitter_t requested, const zr_blit_caps_t* caps, zr_blitter_t* out_effective) {
  zr_result_t rc = zr_blit_validate_dispatch(painter, dst_rect, input, caps, out_effective, requested);
  if (rc != ZR_OK) {
    return rc;
  }
  if (dst_rect.w == 0 || dst_rect.h == 0) {
    return ZR_OK;
  }

  switch (*out_effective) {
  case ZR_BLIT_BRAILLE:
    return zr_blit_braille(painter, dst_rect, input);
  case ZR_BLIT_SEXTANT:
    return zr_blit_sextant(painter, dst_rect, input);
  case ZR_BLIT_QUADRANT:
    return zr_blit_quadrant(painter, dst_rect, input);
  case ZR_BLIT_HALFBLOCK:
    return zr_blit_halfblock(painter, dst_rect, input);
  case ZR_BLIT_ASCII:
    return zr_blit_ascii(painter, dst_rect, input);
  case ZR_BLIT_AUTO:
  case ZR_BLIT_PIXEL:
    return ZR_ERR_UNSUPPORTED;
  default:
    return ZR_ERR_INVALID_ARGUMENT;
  }
}
