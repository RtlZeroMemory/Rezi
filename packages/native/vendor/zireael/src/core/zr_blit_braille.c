/*
  src/core/zr_blit_braille.c — Braille blitter (2x4 sub-cells).

  Why: Provides maximum sub-cell resolution with deterministic per-cell
  luminance thresholding and one-foreground-color braille glyph output.
*/

#include "core/zr_blit.h"

static const uint8_t ZR_BRAILLE_BIT_MAP[4][2] = {{0u, 3u}, {1u, 4u}, {2u, 5u}, {6u, 7u}};

enum {
  ZR_BRAILLE_BASE_SCALAR = 0x2800u,
  ZR_UTF8_3BYTE_LEAD = 0xE0u,
  ZR_UTF8_CONT_BYTE = 0x80u,
  ZR_UTF8_3BYTE_MASK = 0x0Fu,
  ZR_UTF8_CONT_MASK = 0x3Fu,
  ZR_UTF8_SHIFT_6 = 6u,
  ZR_UTF8_SHIFT_12 = 12u,
  ZR_RGB_BYTE_MASK = 0xFFu,
};

/* UTF-8 continuation bytes always have the 10xxxxxx shape. */
static uint8_t zr_utf8_make_cont_byte(uint8_t payload_bits) {
  return (uint8_t)(ZR_UTF8_CONT_BYTE | payload_bits);
}

/* Extract UTF-8 payload bits at a named shift position. */
static uint8_t zr_utf8_payload_bits(uint32_t scalar, uint8_t shift, uint8_t mask) {
  return (uint8_t)((scalar >> shift) & (uint32_t)mask);
}

static uint32_t zr_blit_braille_cell_bg(const zr_fb_painter_t* painter, int32_t x, int32_t y) {
  const zr_cell_t* c = zr_fb_cell_const(painter->fb, (uint32_t)x, (uint32_t)y);
  if (!c) {
    return 0u;
  }
  return c->style.bg_rgb;
}

static zr_blit_glyph_t zr_blit_braille_glyph(uint8_t pattern) {
  const uint32_t cp = ZR_BRAILLE_BASE_SCALAR + (uint32_t)pattern;
  const uint8_t top = zr_utf8_payload_bits(cp, ZR_UTF8_SHIFT_12, ZR_UTF8_3BYTE_MASK);
  const uint8_t mid = zr_utf8_payload_bits(cp, ZR_UTF8_SHIFT_6, ZR_UTF8_CONT_MASK);
  const uint8_t low = zr_utf8_payload_bits(cp, 0u, ZR_UTF8_CONT_MASK);
  zr_blit_glyph_t g;
  g.bytes[0] = (uint8_t)(ZR_UTF8_3BYTE_LEAD | top);
  g.bytes[1] = zr_utf8_make_cont_byte(mid);
  g.bytes[2] = zr_utf8_make_cont_byte(low);
  g.bytes[3] = 0u;
  g.len = 3u;
  g._pad0[0] = 0u;
  g._pad0[1] = 0u;
  g._pad0[2] = 0u;
  return g;
}

static void zr_blit_braille_style(zr_style_t* out_style, uint32_t fg, uint32_t bg) {
  out_style->fg_rgb = fg;
  out_style->bg_rgb = bg;
  out_style->attrs = 0u;
  out_style->reserved = 0u;
  out_style->underline_rgb = 0u;
  out_style->link_ref = 0u;
}

zr_result_t zr_blit_braille(zr_fb_painter_t* painter, zr_rect_t dst_rect, const zr_blit_input_t* input) {
  for (int32_t y = 0; y < dst_rect.h; y++) {
    for (int32_t x = 0; x < dst_rect.w; x++) {
      uint32_t rgb[8];
      uint32_t luma_sum = 0u;
      uint8_t opaque[8] = {0u};
      uint8_t opaque_count = 0u;
      const int32_t dst_x = dst_rect.x + x;
      const int32_t dst_y = dst_rect.y + y;
      const uint32_t under_bg = zr_blit_braille_cell_bg(painter, dst_x, dst_y);

      for (uint8_t row = 0u; row < 4u; row++) {
        for (uint8_t col = 0u; col < 2u; col++) {
          uint8_t rgba[4];
          const uint8_t i = (uint8_t)(row * 2u + col);
          const uint32_t sx = (uint32_t)x * 2u + (uint32_t)col;
          const uint32_t sy = (uint32_t)y * 4u + (uint32_t)row;
          const zr_result_t rc =
              zr_blit_sample_subpixel(input, sx, sy, (uint32_t)dst_rect.w, (uint32_t)dst_rect.h, 2u, 4u, rgba);
          if (rc != ZR_OK) {
            return rc;
          }
          if (zr_blit_alpha_is_opaque(rgba[3]) != 0u) {
            rgb[i] = zr_blit_pack_rgb(rgba[0], rgba[1], rgba[2]);
            opaque[i] = 1u;
            opaque_count++;
          } else {
            rgb[i] = under_bg;
          }
          luma_sum += zr_blit_luma_bt709(rgb[i]);
        }
      }

      if (opaque_count == 0u) {
        continue;
      }

      const uint32_t threshold = luma_sum / 8u;
      uint8_t pattern = 0u;
      uint32_t fg_acc_r = 0u;
      uint32_t fg_acc_g = 0u;
      uint32_t fg_acc_b = 0u;
      uint32_t bg_acc_r = 0u;
      uint32_t bg_acc_g = 0u;
      uint32_t bg_acc_b = 0u;
      uint8_t fg_count = 0u;
      uint8_t bg_count = 0u;

      for (uint8_t row = 0u; row < 4u; row++) {
        for (uint8_t col = 0u; col < 2u; col++) {
          const uint8_t i = (uint8_t)(row * 2u + col);
          const uint32_t c = rgb[i];
          const uint8_t on = (uint8_t)(opaque[i] != 0u && zr_blit_luma_bt709(c) >= threshold);
          if (on != 0u) {
            pattern = (uint8_t)(pattern | (uint8_t)(1u << ZR_BRAILLE_BIT_MAP[row][col]));
            fg_acc_r += (c >> 16u) & ZR_RGB_BYTE_MASK;
            fg_acc_g += (c >> 8u) & ZR_RGB_BYTE_MASK;
            fg_acc_b += c & ZR_RGB_BYTE_MASK;
            fg_count++;
          } else {
            bg_acc_r += (c >> 16u) & ZR_RGB_BYTE_MASK;
            bg_acc_g += (c >> 8u) & ZR_RGB_BYTE_MASK;
            bg_acc_b += c & ZR_RGB_BYTE_MASK;
            bg_count++;
          }
        }
      }

      uint32_t fg = under_bg;
      uint32_t bg = under_bg;
      if (fg_count != 0u) {
        fg = zr_blit_pack_rgb((uint8_t)(fg_acc_r / fg_count), (uint8_t)(fg_acc_g / fg_count),
                              (uint8_t)(fg_acc_b / fg_count));
      }
      if (bg_count != 0u) {
        bg = zr_blit_pack_rgb((uint8_t)(bg_acc_r / bg_count), (uint8_t)(bg_acc_g / bg_count),
                              (uint8_t)(bg_acc_b / bg_count));
      }

      zr_style_t style;
      const zr_blit_glyph_t glyph = zr_blit_braille_glyph(pattern);
      zr_blit_braille_style(&style, fg, bg);
      (void)zr_blit_put_glyph(painter, dst_x, dst_y, &glyph, &style);
    }
  }

  return ZR_OK;
}
