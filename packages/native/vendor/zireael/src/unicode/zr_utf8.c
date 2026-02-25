/*
  src/unicode/zr_utf8.c — Deterministic UTF-8 decoding primitives.

  Why: Centralizes the project's locked invalid UTF-8 policy so all Unicode
  operations (graphemes/width/wrap) can share a single fuzzable decoder.
*/

#include "unicode/zr_utf8.h"

#include <stdbool.h>

enum {
  ZR_UTF8_ASCII_MAX = 0x7Fu,
  ZR_UTF8_LEAD_2_MIN = 0xC2u,
  ZR_UTF8_LEAD_2_MAX = 0xDFu,
  ZR_UTF8_LEAD_3_MIN = 0xE0u,
  ZR_UTF8_LEAD_3_MAX = 0xEFu,
  ZR_UTF8_LEAD_4_MIN = 0xF0u,
  ZR_UTF8_LEAD_4_MAX = 0xF4u,
  ZR_UTF8_CONT_MASK = 0xC0u,
  ZR_UTF8_CONT_VALUE = 0x80u,
  ZR_UTF8_PAYLOAD_2BYTE_MASK = 0x1Fu,
  ZR_UTF8_PAYLOAD_3BYTE_MASK = 0x0Fu,
  ZR_UTF8_PAYLOAD_4BYTE_MASK = 0x07u,
  ZR_UTF8_PAYLOAD_CONT_MASK = 0x3Fu,
  ZR_UTF8_LEAD_3_SURROGATE = 0xEDu,
  ZR_UTF8_LEAD_4_MAX_BOUNDARY = 0xF4u,
  ZR_UTF8_3BYTE_MIN_SECOND = 0xA0u,
  ZR_UTF8_3BYTE_SURROGATE_MAX_SECOND = 0x9Fu,
  ZR_UTF8_4BYTE_MIN_SECOND = 0x90u,
  ZR_UTF8_4BYTE_MAX_SECOND = 0x8Fu,
  ZR_UTF8_REPLACEMENT = 0xFFFDu,
  ZR_UTF8_MIN_3BYTE = 0x800u,
  ZR_UTF8_MIN_4BYTE = 0x10000u,
  ZR_UTF8_MAX_SCALAR = 0x10FFFFu,
  ZR_UTF8_SURROGATE_MIN = 0xD800u,
  ZR_UTF8_SURROGATE_MAX = 0xDFFFu,
};

static zr_utf8_decode_result_t zr_utf8_make_result(uint32_t scalar, uint8_t size, uint8_t valid) {
  zr_utf8_decode_result_t r;
  r.scalar = scalar;
  r.valid = valid;
  r._pad0 = 0u;
  r.size = size;
  return r;
}

static zr_utf8_decode_result_t zr_utf8_invalid(size_t len) {
  return zr_utf8_make_result(ZR_UTF8_REPLACEMENT, (uint8_t)((len > 0u) ? 1u : 0u), 0u);
}

static bool zr_utf8_is_cont(uint8_t b) {
  return (uint8_t)(b & ZR_UTF8_CONT_MASK) == ZR_UTF8_CONT_VALUE;
}

static zr_utf8_decode_result_t zr_utf8_decode_ascii(uint8_t b0) {
  return zr_utf8_make_result((uint32_t)b0, 1u, 1u);
}

/* Decode a 2-byte UTF-8 scalar (C2..DF 80..BF). */
static zr_utf8_decode_result_t zr_utf8_decode_two_bytes(const uint8_t* s, size_t len) {
  if (len < 2u) {
    return zr_utf8_invalid(len);
  }

  const uint8_t b1 = s[1];
  if (!zr_utf8_is_cont(b1)) {
    return zr_utf8_invalid(len);
  }

  const uint32_t top = (uint32_t)(s[0] & ZR_UTF8_PAYLOAD_2BYTE_MASK);
  const uint32_t low = (uint32_t)(b1 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t cp = (top << 6u) | low;
  return zr_utf8_make_result(cp, 2u, 1u);
}

/* Decode a 3-byte UTF-8 scalar with overlong/surrogate exclusions. */
static zr_utf8_decode_result_t zr_utf8_decode_three_bytes(const uint8_t* s, size_t len) {
  if (len < 3u) {
    return zr_utf8_invalid(len);
  }

  const uint8_t b0 = s[0];
  const uint8_t b1 = s[1];
  const uint8_t b2 = s[2];
  if (!zr_utf8_is_cont(b1) || !zr_utf8_is_cont(b2)) {
    return zr_utf8_invalid(len);
  }

  if (b0 == ZR_UTF8_LEAD_3_MIN && b1 < ZR_UTF8_3BYTE_MIN_SECOND) {
    return zr_utf8_invalid(len);
  }
  if (b0 == ZR_UTF8_LEAD_3_SURROGATE && b1 > ZR_UTF8_3BYTE_SURROGATE_MAX_SECOND) {
    return zr_utf8_invalid(len);
  }

  const uint32_t top = (uint32_t)(b0 & ZR_UTF8_PAYLOAD_3BYTE_MASK);
  const uint32_t mid = (uint32_t)(b1 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t low = (uint32_t)(b2 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t cp = (top << 12u) | (mid << 6u) | low;
  if (cp >= ZR_UTF8_SURROGATE_MIN && cp <= ZR_UTF8_SURROGATE_MAX) {
    return zr_utf8_invalid(len);
  }
  if (cp < ZR_UTF8_MIN_3BYTE) {
    return zr_utf8_invalid(len);
  }
  return zr_utf8_make_result(cp, 3u, 1u);
}

/* Decode a 4-byte UTF-8 scalar with overlong/max-scalar exclusions. */
static zr_utf8_decode_result_t zr_utf8_decode_four_bytes(const uint8_t* s, size_t len) {
  if (len < 4u) {
    return zr_utf8_invalid(len);
  }

  const uint8_t b0 = s[0];
  const uint8_t b1 = s[1];
  const uint8_t b2 = s[2];
  const uint8_t b3 = s[3];
  if (!zr_utf8_is_cont(b1) || !zr_utf8_is_cont(b2) || !zr_utf8_is_cont(b3)) {
    return zr_utf8_invalid(len);
  }

  if (b0 == ZR_UTF8_LEAD_4_MIN && b1 < ZR_UTF8_4BYTE_MIN_SECOND) {
    return zr_utf8_invalid(len);
  }
  if (b0 == ZR_UTF8_LEAD_4_MAX_BOUNDARY && b1 > ZR_UTF8_4BYTE_MAX_SECOND) {
    return zr_utf8_invalid(len);
  }

  const uint32_t top = (uint32_t)(b0 & ZR_UTF8_PAYLOAD_4BYTE_MASK);
  const uint32_t high = (uint32_t)(b1 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t mid = (uint32_t)(b2 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t low = (uint32_t)(b3 & ZR_UTF8_PAYLOAD_CONT_MASK);
  const uint32_t cp = (top << 18u) | (high << 12u) | (mid << 6u) | low;
  if (cp > ZR_UTF8_MAX_SCALAR) {
    return zr_utf8_invalid(len);
  }
  if (cp < ZR_UTF8_MIN_4BYTE) {
    return zr_utf8_invalid(len);
  }
  return zr_utf8_make_result(cp, 4u, 1u);
}

/* Decode one UTF-8 codepoint; returns U+FFFD with valid=0 for invalid sequences. */
zr_utf8_decode_result_t zr_utf8_decode_one(const uint8_t* s, size_t len) {
  if (len == 0u || !s) {
    return zr_utf8_invalid(len);
  }

  const uint8_t b0 = s[0];

  if (b0 <= ZR_UTF8_ASCII_MAX) {
    return zr_utf8_decode_ascii(b0);
  }
  if (b0 >= ZR_UTF8_LEAD_2_MIN && b0 <= ZR_UTF8_LEAD_2_MAX) {
    return zr_utf8_decode_two_bytes(s, len);
  }
  if (b0 >= ZR_UTF8_LEAD_3_MIN && b0 <= ZR_UTF8_LEAD_3_MAX) {
    return zr_utf8_decode_three_bytes(s, len);
  }
  if (b0 >= ZR_UTF8_LEAD_4_MIN && b0 <= ZR_UTF8_LEAD_4_MAX) {
    return zr_utf8_decode_four_bytes(s, len);
  }

  return zr_utf8_invalid(len);
}
