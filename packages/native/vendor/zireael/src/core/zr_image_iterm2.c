/*
  src/core/zr_image_iterm2.c — iTerm2 inline image and minimal PNG encoder.

  Why: OSC 1337 expects base64 PNG payload; this module emits deterministic
  cursor-positioned sequences without external dependencies.
*/

#include "core/zr_image.h"

#include "util/zr_checked.h"

#include <stddef.h>
#include <stdint.h>
#include <string.h>

enum {
  ZR_PNG_SIG_LEN = 8u,
  ZR_PNG_IHDR_DATA_LEN = 13u,
  ZR_PNG_CHUNK_OVERHEAD = 12u,
  ZR_DEFLATE_STORED_MAX = 65535u,
};

static const uint8_t ZR_PNG_SIG[ZR_PNG_SIG_LEN] = {0x89u, 0x50u, 0x4Eu, 0x47u, 0x0Du, 0x0Au, 0x1Au, 0x0Au};

typedef struct zr_png_buf_t {
  uint8_t* bytes;
  size_t len;
  size_t cap;
} zr_png_buf_t;

static zr_result_t zr_img2_write_bytes(zr_sb_t* sb, const void* p, size_t n) {
  if (!sb || (!p && n != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_sb_write_bytes(sb, p, n)) {
    return ZR_ERR_LIMIT;
  }
  return ZR_OK;
}

static zr_result_t zr_img2_write_u32(zr_sb_t* sb, uint32_t v) {
  uint8_t tmp[10];
  size_t n = 0u;
  size_t i = 0u;
  if (!sb) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (v == 0u) {
    return zr_img2_write_bytes(sb, "0", 1u);
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
  return zr_img2_write_bytes(sb, tmp, n);
}

static zr_result_t zr_img2_emit_cup(zr_sb_t* sb, uint16_t col, uint16_t row) {
  zr_result_t rc = ZR_OK;
  rc = zr_img2_write_bytes(sb, "\x1b[", 2u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_u32(sb, (uint32_t)row + 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_bytes(sb, ";", 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_u32(sb, (uint32_t)col + 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_img2_write_bytes(sb, "H", 1u);
}

static uint32_t zr_png_crc32_update(uint32_t crc, const uint8_t* p, size_t n) {
  size_t i = 0u;
  if (!p && n != 0u) {
    return crc;
  }
  for (i = 0u; i < n; i++) {
    uint32_t c = (crc ^ (uint32_t)p[i]) & 0xFFu;
    uint32_t bit = 0u;
    for (bit = 0u; bit < 8u; bit++) {
      if ((c & 1u) != 0u) {
        c = 0xEDB88320u ^ (c >> 1u);
      } else {
        c >>= 1u;
      }
    }
    crc = (crc >> 8u) ^ c;
  }
  return crc;
}

static uint32_t zr_png_crc32(const uint8_t* p, size_t n) {
  return zr_png_crc32_update(0xFFFFFFFFu, p, n) ^ 0xFFFFFFFFu;
}

static uint32_t zr_png_adler32(const uint8_t* p, size_t n) {
  uint32_t s1 = 1u;
  uint32_t s2 = 0u;
  size_t i = 0u;
  for (i = 0u; i < n; i++) {
    s1 = (s1 + p[i]) % 65521u;
    s2 = (s2 + s1) % 65521u;
  }
  const uint32_t upper = (s2 << 16u);
  const uint32_t lower = s1;
  return upper | lower;
}

static void zr_store_u32be(uint8_t out[4], uint32_t v) {
  out[0] = (uint8_t)((v >> 24u) & 0xFFu);
  out[1] = (uint8_t)((v >> 16u) & 0xFFu);
  out[2] = (uint8_t)((v >> 8u) & 0xFFu);
  out[3] = (uint8_t)(v & 0xFFu);
}

static zr_result_t zr_png_append(zr_png_buf_t* b, const void* p, size_t n) {
  if (!b || (!p && n != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (n > (b->cap - b->len)) {
    return ZR_ERR_LIMIT;
  }
  if (n != 0u) {
    memcpy(b->bytes + b->len, p, n);
  }
  b->len += n;
  return ZR_OK;
}

static zr_result_t zr_png_append_chunk(zr_png_buf_t* b, const uint8_t type[4], const uint8_t* data, uint32_t data_len) {
  uint8_t len_be[4];
  uint8_t crc_be[4];
  uint32_t crc = 0u;
  zr_result_t rc = ZR_OK;
  if (!b || !type || (!data && data_len != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  zr_store_u32be(len_be, data_len);
  rc = zr_png_append(b, len_be, sizeof(len_be));
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_append(b, type, 4u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_append(b, data, (size_t)data_len);
  if (rc != ZR_OK) {
    return rc;
  }
  crc = zr_png_crc32(type, 4u);
  crc = zr_png_crc32_update(crc ^ 0xFFFFFFFFu, data, (size_t)data_len) ^ 0xFFFFFFFFu;
  zr_store_u32be(crc_be, crc);
  return zr_png_append(b, crc_be, sizeof(crc_be));
}

static zr_result_t zr_png_build_raw_scanlines(zr_arena_t* arena, const uint8_t* rgba, uint16_t w, uint16_t h,
                                              uint8_t** out_raw, size_t* out_raw_len) {
  size_t row_bytes = 0u;
  size_t raw_len = 0u;
  uint8_t* raw = NULL;
  uint16_t y = 0u;
  if (!arena || !rgba || !out_raw || !out_raw_len || w == 0u || h == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_mul_size((size_t)w, (size_t)ZR_IMAGE_RGBA_BYTES_PER_PIXEL, &row_bytes) ||
      !zr_checked_add_size(row_bytes, 1u, &row_bytes) || !zr_checked_mul_size(row_bytes, (size_t)h, &raw_len)) {
    return ZR_ERR_LIMIT;
  }
  raw = (uint8_t*)zr_arena_alloc(arena, raw_len, 16u);
  if (!raw) {
    return ZR_ERR_OOM;
  }
  for (y = 0u; y < h; y++) {
    size_t dst_off = (size_t)y * row_bytes;
    size_t src_off = (size_t)y * (size_t)w * (size_t)ZR_IMAGE_RGBA_BYTES_PER_PIXEL;
    raw[dst_off] = 0u;
    memcpy(raw + dst_off + 1u, rgba + src_off, row_bytes - 1u);
  }
  *out_raw = raw;
  *out_raw_len = raw_len;
  return ZR_OK;
}

static zr_result_t zr_png_deflate_stored(zr_arena_t* arena, const uint8_t* raw, size_t raw_len, uint8_t** out_zlib,
                                         size_t* out_zlib_len) {
  size_t blocks = 0u;
  size_t overhead = 0u;
  size_t z_len = 0u;
  size_t in_off = 0u;
  size_t out_off = 0u;
  uint8_t* z = NULL;
  uint32_t adler = 0u;

  if (!arena || !raw || !out_zlib || !out_zlib_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  blocks = (raw_len + (size_t)ZR_DEFLATE_STORED_MAX - 1u) / (size_t)ZR_DEFLATE_STORED_MAX;
  if (!zr_checked_mul_size(blocks, 5u, &overhead) || !zr_checked_add_size(overhead, 2u, &overhead) ||
      !zr_checked_add_size(overhead, 4u, &overhead) || !zr_checked_add_size(overhead, raw_len, &z_len)) {
    return ZR_ERR_LIMIT;
  }

  z = (uint8_t*)zr_arena_alloc(arena, z_len, 16u);
  if (!z) {
    return ZR_ERR_OOM;
  }

  z[out_off++] = 0x78u;
  z[out_off++] = 0x01u;

  while (in_off < raw_len) {
    size_t rem = raw_len - in_off;
    uint16_t len16 = 0u;
    uint16_t nlen16 = 0u;
    uint8_t final = 0u;
    if (rem > (size_t)ZR_DEFLATE_STORED_MAX) {
      rem = (size_t)ZR_DEFLATE_STORED_MAX;
    }
    final = ((in_off + rem) == raw_len) ? 1u : 0u;
    len16 = (uint16_t)rem;
    nlen16 = (uint16_t)~len16;

    z[out_off++] = final;
    z[out_off++] = (uint8_t)(len16 & 0xFFu);
    z[out_off++] = (uint8_t)((len16 >> 8u) & 0xFFu);
    z[out_off++] = (uint8_t)(nlen16 & 0xFFu);
    z[out_off++] = (uint8_t)((nlen16 >> 8u) & 0xFFu);
    memcpy(z + out_off, raw + in_off, rem);
    out_off += rem;
    in_off += rem;
  }

  adler = zr_png_adler32(raw, raw_len);
  z[out_off++] = (uint8_t)((adler >> 24u) & 0xFFu);
  z[out_off++] = (uint8_t)((adler >> 16u) & 0xFFu);
  z[out_off++] = (uint8_t)((adler >> 8u) & 0xFFu);
  z[out_off++] = (uint8_t)(adler & 0xFFu);

  *out_zlib = z;
  *out_zlib_len = out_off;
  return ZR_OK;
}

static zr_result_t zr_png_encode_rgba(zr_arena_t* arena, const uint8_t* rgba, uint16_t w, uint16_t h, uint8_t** out_png,
                                      size_t* out_png_len) {
  uint8_t* raw = NULL;
  size_t raw_len = 0u;
  uint8_t* zlib = NULL;
  size_t zlib_len = 0u;
  uint8_t* png = NULL;
  size_t png_cap = 0u;
  zr_png_buf_t b;
  uint8_t ihdr[ZR_PNG_IHDR_DATA_LEN];
  zr_result_t rc = ZR_OK;

  if (!arena || !rgba || !out_png || !out_png_len || w == 0u || h == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_png_build_raw_scanlines(arena, rgba, w, h, &raw, &raw_len);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_deflate_stored(arena, raw, raw_len, &zlib, &zlib_len);
  if (rc != ZR_OK) {
    return rc;
  }

  if (!zr_checked_add_size((size_t)ZR_PNG_SIG_LEN, (size_t)ZR_PNG_CHUNK_OVERHEAD + (size_t)ZR_PNG_IHDR_DATA_LEN,
                           &png_cap) ||
      !zr_checked_add_size(png_cap, (size_t)ZR_PNG_CHUNK_OVERHEAD + zlib_len, &png_cap) ||
      !zr_checked_add_size(png_cap, (size_t)ZR_PNG_CHUNK_OVERHEAD, &png_cap)) {
    return ZR_ERR_LIMIT;
  }

  png = (uint8_t*)zr_arena_alloc(arena, png_cap, 16u);
  if (!png) {
    return ZR_ERR_OOM;
  }
  b.bytes = png;
  b.len = 0u;
  b.cap = png_cap;

  zr_store_u32be(ihdr + 0u, (uint32_t)w);
  zr_store_u32be(ihdr + 4u, (uint32_t)h);
  ihdr[8] = 8u;
  ihdr[9] = 6u;
  ihdr[10] = 0u;
  ihdr[11] = 0u;
  ihdr[12] = 0u;

  rc = zr_png_append(&b, ZR_PNG_SIG, ZR_PNG_SIG_LEN);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_append_chunk(&b, (const uint8_t*)"IHDR", ihdr, ZR_PNG_IHDR_DATA_LEN);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_append_chunk(&b, (const uint8_t*)"IDAT", zlib, (uint32_t)zlib_len);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_png_append_chunk(&b, (const uint8_t*)"IEND", NULL, 0u);
  if (rc != ZR_OK) {
    return rc;
  }

  *out_png = png;
  *out_png_len = b.len;
  return ZR_OK;
}

/* Emit OSC 1337 inline-image bytes using pre-encoded PNG payload. */
zr_result_t zr_image_iterm2_emit_png(zr_sb_t* sb, const uint8_t* png_bytes, size_t png_len, uint16_t dst_col,
                                     uint16_t dst_row, uint16_t dst_cols, uint16_t dst_rows) {
  size_t b64_len = 0u;
  uint8_t overflow = 0u;
  uint8_t* b64 = NULL;
  size_t payload_cap = 0u;
  zr_result_t rc = ZR_OK;

  if (!sb || !png_bytes || png_len == 0u || dst_cols == 0u || dst_rows == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  b64_len = zr_base64_encoded_size(png_len, &overflow);
  if (overflow != 0u) {
    return ZR_ERR_LIMIT;
  }

  rc = zr_img2_emit_cup(sb, dst_col, dst_row);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_bytes(sb, "\x1b]1337;File=inline=1;width=", 27u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_u32(sb, (uint32_t)dst_cols);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_bytes(sb, ";height=", 8u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_u32(sb, (uint32_t)dst_rows);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_bytes(sb, ";preserveAspectRatio=1;size=", 28u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_u32(sb, (uint32_t)png_len);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_img2_write_bytes(sb, ":", 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  if (sb->cap < sb->len) {
    return ZR_ERR_LIMIT;
  }
  payload_cap = (size_t)(sb->cap - sb->len);
  if (b64_len + 1u > payload_cap) {
    return ZR_ERR_LIMIT;
  }
  b64 = sb->buf + sb->len;
  rc = zr_base64_encode(png_bytes, png_len, b64, payload_cap - 1u, &b64_len);
  if (rc != ZR_OK) {
    return rc;
  }
  sb->len += b64_len;
  return zr_img2_write_bytes(sb, "\x07", 1u);
}

/* Encode RGBA to PNG (stored-deflate) then emit iTerm2 OSC 1337 bytes. */
zr_result_t zr_image_iterm2_emit_rgba(zr_sb_t* sb, zr_arena_t* arena, const uint8_t* rgba, uint16_t px_w, uint16_t px_h,
                                      uint16_t dst_col, uint16_t dst_row, uint16_t dst_cols, uint16_t dst_rows) {
  uint8_t* png = NULL;
  size_t png_len = 0u;
  zr_result_t rc = ZR_OK;
  if (!sb || !arena || !rgba || px_w == 0u || px_h == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_png_encode_rgba(arena, rgba, px_w, px_h, &png, &png_len);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_image_iterm2_emit_png(sb, png, png_len, dst_col, dst_row, dst_cols, dst_rows);
}
