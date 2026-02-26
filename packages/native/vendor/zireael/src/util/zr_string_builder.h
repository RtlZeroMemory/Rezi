/*
  src/util/zr_string_builder.h — Bounded byte writer (string builder).

  Why: Writes structured output into caller-provided buffers without partial
  writes on overflow; truncation is tracked explicitly.
*/

#ifndef ZR_UTIL_ZR_STRING_BUILDER_H_INCLUDED
#define ZR_UTIL_ZR_STRING_BUILDER_H_INCLUDED

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct zr_sb_t {
  uint8_t* buf;
  size_t cap;
  size_t len;
  bool truncated;
} zr_sb_t;

void   zr_sb_init(zr_sb_t* sb, uint8_t* buf, size_t cap);
void   zr_sb_reset(zr_sb_t* sb);
size_t zr_sb_len(const zr_sb_t* sb);
bool   zr_sb_truncated(const zr_sb_t* sb);

bool zr_sb_write_bytes(zr_sb_t* sb, const void* bytes, size_t len);
bool zr_sb_write_u8(zr_sb_t* sb, uint8_t v);
bool zr_sb_write_u16le(zr_sb_t* sb, uint16_t v);
bool zr_sb_write_u32le(zr_sb_t* sb, uint32_t v);
bool zr_sb_write_u64le(zr_sb_t* sb, uint64_t v);

#endif /* ZR_UTIL_ZR_STRING_BUILDER_H_INCLUDED */

