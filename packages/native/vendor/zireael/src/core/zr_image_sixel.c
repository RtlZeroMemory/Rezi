/*
  src/core/zr_image_sixel.c — Deterministic Sixel encoder for RGBA images.

  Why: Emits cursor-positioned DCS Sixel payloads when Kitty is unavailable.
*/

#include "core/zr_image.h"

#include <stddef.h>
#include <string.h>

typedef struct zr_sixel_color_t {
  uint8_t r;
  uint8_t g;
  uint8_t b;
} zr_sixel_color_t;

enum {
  ZR_SIXEL_Q_LEVELS = 6u,
  ZR_SIXEL_Q_KEYS = 216u,
  ZR_SIXEL_TRANSPARENT_INDEX = 255u,
  ZR_SIXEL_PALETTE_MAP_EMPTY = 0xFFFFu,
  ZR_SIXEL_BAND_ROWS = 6u,
  ZR_SIXEL_DATA_CHAR_BASE = 0x3Fu,
  ZR_SIXEL_RUN_MIN_RLE = 4u,
};

static zr_result_t zr_sixel_write_bytes(zr_sb_t* sb, const void* p, size_t n) {
  if (!sb || (!p && n != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_sb_write_bytes(sb, p, n)) {
    return ZR_ERR_LIMIT;
  }
  return ZR_OK;
}

static zr_result_t zr_sixel_write_u32(zr_sb_t* sb, uint32_t v) {
  uint8_t tmp[10];
  size_t n = 0u;
  size_t i = 0u;
  if (!sb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (v == 0u) {
    return zr_sixel_write_bytes(sb, "0", 1u);
  }
  while (v != 0u) {
    tmp[n++] = (uint8_t)('0' + (v % 10u));
    v /= 10u;
  }
  for (i = 0u; i < (n / 2u); i++) {
    uint8_t c = tmp[i];
    tmp[i] = tmp[n - 1u - i];
    tmp[n - 1u - i] = c;
  }
  return zr_sixel_write_bytes(sb, tmp, n);
}

static zr_result_t zr_sixel_emit_cup(zr_sb_t* sb, uint16_t col, uint16_t row) {
  zr_result_t rc = ZR_OK;
  rc = zr_sixel_write_bytes(sb, "\x1b[", 2u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_u32(sb, (uint32_t)row + 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_bytes(sb, ";", 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_u32(sb, (uint32_t)col + 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_sixel_write_bytes(sb, "H", 1u);
}

static uint8_t zr_sixel_quant_level(uint8_t c) {
  return (uint8_t)(((uint32_t)c * (ZR_SIXEL_Q_LEVELS - 1u) + 127u) / 255u);
}

static uint8_t zr_sixel_level_to_rgb(uint8_t q) {
  return (uint8_t)((q * 255u) / (ZR_SIXEL_Q_LEVELS - 1u));
}

static uint8_t zr_sixel_rgb_to_pct(uint8_t v) {
  return (uint8_t)((((uint32_t)v * 100u) + 127u) / 255u);
}

static uint32_t zr_sixel_quant_key(uint8_t r, uint8_t g, uint8_t b) {
  const uint32_t qr = (uint32_t)zr_sixel_quant_level(r);
  const uint32_t qg = (uint32_t)zr_sixel_quant_level(g);
  const uint32_t qb = (uint32_t)zr_sixel_quant_level(b);
  return (qr * 36u) + (qg * 6u) + qb;
}

static zr_result_t zr_sixel_quantize(zr_arena_t* arena, const uint8_t* rgba, uint16_t px_w, uint16_t px_h,
                                     uint8_t** out_indexed, zr_sixel_color_t palette[256], uint16_t* out_palette_len) {
  uint16_t map[ZR_SIXEL_Q_KEYS];
  size_t px_count = (size_t)px_w * (size_t)px_h;
  uint8_t* indexed = NULL;
  uint16_t palette_len = 0u;
  size_t i = 0u;

  if (!arena || !rgba || !out_indexed || !palette || !out_palette_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  indexed = (uint8_t*)zr_arena_alloc(arena, px_count, 16u);
  if (!indexed) {
    return ZR_ERR_OOM;
  }
  memset(map, 0xFF, sizeof(map));

  for (i = 0u; i < px_count; i++) {
    const uint8_t* p = rgba + (i * 4u);
    uint8_t a = p[3];
    if (a < ZR_IMAGE_ALPHA_THRESHOLD) {
      indexed[i] = ZR_SIXEL_TRANSPARENT_INDEX;
      continue;
    }
    {
      uint32_t key = zr_sixel_quant_key(p[0], p[1], p[2]);
      if (map[key] == ZR_SIXEL_PALETTE_MAP_EMPTY) {
        uint16_t idx = palette_len;
        uint8_t qr = (uint8_t)(key / 36u);
        uint8_t qg = (uint8_t)((key / 6u) % 6u);
        uint8_t qb = (uint8_t)(key % 6u);
        map[key] = idx;
        palette[idx].r = zr_sixel_level_to_rgb(qr);
        palette[idx].g = zr_sixel_level_to_rgb(qg);
        palette[idx].b = zr_sixel_level_to_rgb(qb);
        palette_len++;
      }
      indexed[i] = (uint8_t)map[key];
    }
  }

  *out_indexed = indexed;
  *out_palette_len = palette_len;
  return ZR_OK;
}

static zr_result_t zr_sixel_emit_palette(zr_sb_t* sb, const zr_sixel_color_t palette[256], uint16_t palette_len) {
  uint16_t i = 0u;
  for (i = 0u; i < palette_len; i++) {
    zr_result_t rc = zr_sixel_write_bytes(sb, "#", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, i);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_bytes(sb, ";2;", 3u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, zr_sixel_rgb_to_pct(palette[i].r));
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_bytes(sb, ";", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, zr_sixel_rgb_to_pct(palette[i].g));
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_bytes(sb, ";", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, zr_sixel_rgb_to_pct(palette[i].b));
    if (rc != ZR_OK) {
      return rc;
    }
  }
  return ZR_OK;
}

static zr_result_t zr_sixel_emit_run(zr_sb_t* sb, uint8_t ch, uint32_t run) {
  zr_result_t rc = ZR_OK;
  if (!sb || run == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (run >= ZR_SIXEL_RUN_MIN_RLE) {
    rc = zr_sixel_write_bytes(sb, "!", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, run);
    if (rc != ZR_OK) {
      return rc;
    }
    return zr_sixel_write_bytes(sb, &ch, 1u);
  }
  while (run != 0u) {
    rc = zr_sixel_write_bytes(sb, &ch, 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    run--;
  }
  return ZR_OK;
}

static uint8_t zr_sixel_band_char(const uint8_t* indexed, uint16_t px_w, uint16_t px_h, uint16_t band_y, uint16_t x,
                                  uint8_t color_idx) {
  /*
    Sixel packs one vertical 6-pixel slice into one byte:
      bit N (0..5) => pixel at (x, band_y + N)
    Data bytes are encoded as '?' + bits per DEC sixel format.
  */
  uint8_t bits = 0u;
  uint16_t bit = 0u;
  for (bit = 0u; bit < ZR_SIXEL_BAND_ROWS; bit++) {
    uint16_t y = (uint16_t)(band_y + bit);
    if (y >= px_h) {
      continue;
    }
    if (indexed[(size_t)y * (size_t)px_w + (size_t)x] == color_idx) {
      bits = (uint8_t)(bits | (uint8_t)(1u << bit));
    }
  }
  return (uint8_t)(ZR_SIXEL_DATA_CHAR_BASE + bits);
}

static void zr_sixel_mark_band_colors(const uint8_t* indexed, uint16_t px_w, uint16_t px_h, uint16_t band_y,
                                      uint8_t present[256]) {
  uint16_t y = 0u;
  memset(present, 0, 256u);
  for (y = 0u; y < ZR_SIXEL_BAND_ROWS; y++) {
    uint16_t yy = (uint16_t)(band_y + y);
    uint16_t x = 0u;
    if (yy >= px_h) {
      continue;
    }
    for (x = 0u; x < px_w; x++) {
      uint8_t idx = indexed[(size_t)yy * (size_t)px_w + (size_t)x];
      if (idx != ZR_SIXEL_TRANSPARENT_INDEX) {
        present[idx] = 1u;
      }
    }
  }
}

static zr_result_t zr_sixel_emit_band(zr_sb_t* sb, const uint8_t* indexed, uint16_t px_w, uint16_t px_h,
                                      uint16_t band_y, uint16_t palette_len) {
  uint8_t present[256];
  uint16_t color = 0u;
  zr_sixel_mark_band_colors(indexed, px_w, px_h, band_y, present);

  for (color = 0u; color < palette_len; color++) {
    uint16_t x = 0u;
    uint8_t prev = 0u;
    uint32_t run = 0u;
    zr_result_t rc = ZR_OK;

    if (present[color] == 0u) {
      continue;
    }

    rc = zr_sixel_write_bytes(sb, "#", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_sixel_write_u32(sb, color);
    if (rc != ZR_OK) {
      return rc;
    }

    for (x = 0u; x < px_w; x++) {
      uint8_t ch = zr_sixel_band_char(indexed, px_w, px_h, band_y, x, (uint8_t)color);
      if (x == 0u) {
        prev = ch;
        run = 1u;
        continue;
      }
      if (ch == prev) {
        run++;
      } else {
        rc = zr_sixel_emit_run(sb, prev, run);
        if (rc != ZR_OK) {
          return rc;
        }
        prev = ch;
        run = 1u;
      }
    }
    if (px_w != 0u) {
      rc = zr_sixel_emit_run(sb, prev, run);
      if (rc != ZR_OK) {
        return rc;
      }
    }
    rc = zr_sixel_write_bytes(sb, "$", 1u);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  return zr_sixel_write_bytes(sb, "-", 1u);
}

/* Emit CUP + DCS sixel sequence for an RGBA image (alpha<128 treated transparent). */
zr_result_t zr_image_sixel_emit_rgba(zr_sb_t* sb, zr_arena_t* arena, const uint8_t* rgba, uint16_t px_w, uint16_t px_h,
                                     uint16_t dst_col, uint16_t dst_row) {
  uint8_t* indexed = NULL;
  zr_sixel_color_t palette[256];
  uint16_t palette_len = 0u;
  uint16_t band_y = 0u;
  zr_result_t rc = ZR_OK;

  if (!sb || !arena || !rgba || px_w == 0u || px_h == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_sixel_quantize(arena, rgba, px_w, px_h, &indexed, palette, &palette_len);
  if (rc != ZR_OK) {
    return rc;
  }

  rc = zr_sixel_emit_cup(sb, dst_col, dst_row);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_bytes(sb, "\x1bP0;1;0q", 8u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_bytes(sb, "\"1;1;", 5u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_u32(sb, px_w);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_bytes(sb, ";", 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_sixel_write_u32(sb, px_h);
  if (rc != ZR_OK) {
    return rc;
  }

  rc = zr_sixel_emit_palette(sb, palette, palette_len);
  if (rc != ZR_OK) {
    return rc;
  }
  for (band_y = 0u; band_y < px_h; band_y = (uint16_t)(band_y + 6u)) {
    rc = zr_sixel_emit_band(sb, indexed, px_w, px_h, band_y, palette_len);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  return zr_sixel_write_bytes(sb, "\x1b\\", 2u);
}
