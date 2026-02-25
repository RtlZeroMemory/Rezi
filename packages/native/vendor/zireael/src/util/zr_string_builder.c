/*
  src/util/zr_string_builder.c — Bounded byte writer implementation.

  Why: Ensures deterministic truncation: writes either all bytes or none.
*/

#include "util/zr_string_builder.h"

#include "util/zr_bytes.h"

#include <string.h>

void zr_sb_init(zr_sb_t* sb, uint8_t* buf, size_t cap) {
  if (!sb) {
    return;
  }
  sb->buf = buf;
  sb->cap = cap;
  sb->len = 0u;
  sb->truncated = false;
}

void zr_sb_reset(zr_sb_t* sb) {
  if (!sb) {
    return;
  }
  sb->len = 0u;
  sb->truncated = false;
}

size_t zr_sb_len(const zr_sb_t* sb) {
  return sb ? sb->len : 0u;
}

bool zr_sb_truncated(const zr_sb_t* sb) {
  return sb ? sb->truncated : true;
}

/* Remaining writable bytes; returns 0 for invalid/corrupted builder states. */
static size_t zr_sb_remaining(const zr_sb_t* sb) {
  if (!sb || sb->len > sb->cap) {
    return 0u;
  }
  return sb->cap - sb->len;
}

static bool zr_sb__can_write(const zr_sb_t* sb, size_t n) {
  if (!sb || (!sb->buf && sb->cap != 0u)) {
    return false;
  }
  /* len > cap indicates corrupted state; refuse further writes deterministically. */
  if (sb->len > sb->cap) {
    return false;
  }
  /* No partial writes: caller must have full remaining capacity for n bytes. */
  if (n > zr_sb_remaining(sb)) {
    return false;
  }
  return true;
}

/* Write bytes to builder; sets truncated flag and returns false if no space. */
bool zr_sb_write_bytes(zr_sb_t* sb, const void* bytes, size_t len) {
  if (!sb || (!bytes && len != 0u)) {
    return false;
  }
  if (!zr_sb__can_write(sb, len)) {
    if (sb) {
      sb->truncated = true;
    }
    return false;
  }
  if (len != 0u) {
    /* Some emitters append from an earlier range of the same output buffer. */
    memmove(sb->buf + sb->len, bytes, len);
  }
  sb->len += len;
  return true;
}

bool zr_sb_write_u8(zr_sb_t* sb, uint8_t v) {
  return zr_sb_write_bytes(sb, &v, 1u);
}

bool zr_sb_write_u16le(zr_sb_t* sb, uint16_t v) {
  uint8_t tmp[2];
  zr_store_u16le(tmp, v);
  return zr_sb_write_bytes(sb, tmp, sizeof(tmp));
}

bool zr_sb_write_u32le(zr_sb_t* sb, uint32_t v) {
  uint8_t tmp[4];
  zr_store_u32le(tmp, v);
  return zr_sb_write_bytes(sb, tmp, sizeof(tmp));
}

bool zr_sb_write_u64le(zr_sb_t* sb, uint64_t v) {
  uint8_t tmp[8];
  zr_store_u64le(tmp, v);
  return zr_sb_write_bytes(sb, tmp, sizeof(tmp));
}
