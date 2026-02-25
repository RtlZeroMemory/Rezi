/*
  src/util/zr_bytes.h — Byte helpers and bounded reader.

  Why: Provides unaligned-safe little-endian load/store helpers and a small
  byte reader that never advances on failed reads/skips.
*/

#ifndef ZR_UTIL_ZR_BYTES_H_INCLUDED
#define ZR_UTIL_ZR_BYTES_H_INCLUDED

/*
 * Byte-level helpers for portable, unaligned-safe I/O.
 *
 * These functions use explicit byte access instead of pointer casts to avoid:
 *   - Undefined behavior on misaligned access
 *   - Endianness assumptions
 *   - Strict aliasing violations
 *
 * All multi-byte operations use little-endian byte order (matching x86/ARM
 * and Zireael's binary format specifications).
 */

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

static inline uint16_t zr_load_u16le(const void* p) {
  const uint8_t* b = (const uint8_t*)p;
  const uint16_t p0 = (uint16_t)b[0];
  const uint16_t p1 = (uint16_t)((uint16_t)b[1] << 8u);
  return (uint16_t)(p0 | p1);
}

static inline uint32_t zr_load_u32le(const void* p) {
  const uint8_t* b = (const uint8_t*)p;
  const uint32_t p0 = (uint32_t)b[0];
  const uint32_t p1 = ((uint32_t)b[1] << 8u);
  const uint32_t p2 = ((uint32_t)b[2] << 16u);
  const uint32_t p3 = ((uint32_t)b[3] << 24u);
  return p0 | p1 | p2 | p3;
}

static inline uint64_t zr_load_u64le(const void* p) {
  const uint8_t* b = (const uint8_t*)p;
  const uint64_t p0 = (uint64_t)b[0];
  const uint64_t p1 = ((uint64_t)b[1] << 8u);
  const uint64_t p2 = ((uint64_t)b[2] << 16u);
  const uint64_t p3 = ((uint64_t)b[3] << 24u);
  const uint64_t p4 = ((uint64_t)b[4] << 32u);
  const uint64_t p5 = ((uint64_t)b[5] << 40u);
  const uint64_t p6 = ((uint64_t)b[6] << 48u);
  const uint64_t p7 = ((uint64_t)b[7] << 56u);
  return p0 | p1 | p2 | p3 | p4 | p5 | p6 | p7;
}

static inline void zr_store_u16le(void* p, uint16_t v) {
  uint8_t* b = (uint8_t*)p;
  b[0] = (uint8_t)(v & 0xFFu);
  b[1] = (uint8_t)((v >> 8u) & 0xFFu);
}

static inline void zr_store_u32le(void* p, uint32_t v) {
  uint8_t* b = (uint8_t*)p;
  b[0] = (uint8_t)(v & 0xFFu);
  b[1] = (uint8_t)((v >> 8u) & 0xFFu);
  b[2] = (uint8_t)((v >> 16u) & 0xFFu);
  b[3] = (uint8_t)((v >> 24u) & 0xFFu);
}

static inline void zr_store_u64le(void* p, uint64_t v) {
  uint8_t* b = (uint8_t*)p;
  b[0] = (uint8_t)(v & 0xFFu);
  b[1] = (uint8_t)((v >> 8u) & 0xFFu);
  b[2] = (uint8_t)((v >> 16u) & 0xFFu);
  b[3] = (uint8_t)((v >> 24u) & 0xFFu);
  b[4] = (uint8_t)((v >> 32u) & 0xFFu);
  b[5] = (uint8_t)((v >> 40u) & 0xFFu);
  b[6] = (uint8_t)((v >> 48u) & 0xFFu);
  b[7] = (uint8_t)((v >> 56u) & 0xFFu);
}

typedef struct zr_byte_reader_t {
  const uint8_t* bytes;
  size_t len;
  size_t off;
} zr_byte_reader_t;

static inline void zr_byte_reader_init(zr_byte_reader_t* r, const uint8_t* bytes, size_t len) {
  if (!r) {
    return;
  }
  r->bytes = bytes;
  r->len = len;
  r->off = 0u;
}

static inline size_t zr_byte_reader_remaining(const zr_byte_reader_t* r) {
  if (!r) {
    return 0u;
  }
  if (!r->bytes) {
    return 0u;
  }
  if (r->off > r->len) {
    return 0u;
  }
  return r->len - r->off;
}

static inline bool zr_byte_reader_skip(zr_byte_reader_t* r, size_t n) {
  if (!r) {
    return false;
  }
  if (zr_byte_reader_remaining(r) < n) {
    return false;
  }
  r->off += n;
  return true;
}

static inline bool zr_byte_reader_read_bytes(zr_byte_reader_t* r, void* out, size_t n) {
  if (!r || (!out && n != 0u)) {
    return false;
  }
  if (!r->bytes && n != 0u) {
    return false;
  }
  if (zr_byte_reader_remaining(r) < n) {
    return false;
  }
  if (n != 0u) {
    memcpy(out, r->bytes + r->off, n);
  }
  r->off += n;
  return true;
}

static inline bool zr_byte_reader_read_u8(zr_byte_reader_t* r, uint8_t* out) {
  if (!out) {
    return false;
  }
  return zr_byte_reader_read_bytes(r, out, 1u);
}

static inline bool zr_byte_reader_read_u16le(zr_byte_reader_t* r, uint16_t* out) {
  uint8_t tmp[2];
  if (!out) {
    return false;
  }
  if (!zr_byte_reader_read_bytes(r, tmp, sizeof(tmp))) {
    return false;
  }
  *out = zr_load_u16le(tmp);
  return true;
}

static inline bool zr_byte_reader_read_u32le(zr_byte_reader_t* r, uint32_t* out) {
  uint8_t tmp[4];
  if (!out) {
    return false;
  }
  if (!zr_byte_reader_read_bytes(r, tmp, sizeof(tmp))) {
    return false;
  }
  *out = zr_load_u32le(tmp);
  return true;
}

static inline bool zr_byte_reader_read_u64le(zr_byte_reader_t* r, uint64_t* out) {
  uint8_t tmp[8];
  if (!out) {
    return false;
  }
  if (!zr_byte_reader_read_bytes(r, tmp, sizeof(tmp))) {
    return false;
  }
  *out = zr_load_u64le(tmp);
  return true;
}

#endif /* ZR_UTIL_ZR_BYTES_H_INCLUDED */
