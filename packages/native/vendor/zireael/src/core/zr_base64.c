/*
  src/core/zr_base64.c — Deterministic RFC4648 base64 encoder helpers.

  Why: Provides a small bounded encoder for terminal image protocol payloads.
*/

#include "core/zr_base64.h"

#include "util/zr_checked.h"

#include <stddef.h>
#include <string.h>

enum {
  ZR_BASE64_INPUT_GROUP = 3u,
  ZR_BASE64_OUTPUT_GROUP = 4u,
  ZR_BASE64_INDEX0_SHIFT = 2u,
  ZR_BASE64_INDEX1_LEFT_SHIFT = 4u,
  ZR_BASE64_INDEX1_RIGHT_SHIFT = 4u,
  ZR_BASE64_INDEX2_LEFT_SHIFT = 2u,
  ZR_BASE64_INDEX2_RIGHT_SHIFT = 6u,
  ZR_BASE64_MASK_LOW_2 = 0x03u,
  ZR_BASE64_MASK_LOW_4 = 0x0Fu,
  ZR_BASE64_MASK_LOW_6 = 0x3Fu,
};

static const uint8_t ZR_BASE64_ALPHABET[64] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

size_t zr_base64_encoded_size(size_t in_len, uint8_t* out_overflow) {
  size_t groups = 0u;
  size_t out = 0u;

  if (out_overflow) {
    *out_overflow = 0u;
  }

  if (in_len == 0u) {
    return 0u;
  }
  if (!zr_checked_add_size(in_len, ZR_BASE64_INPUT_GROUP - 1u, &groups)) {
    if (out_overflow) {
      *out_overflow = 1u;
    }
    return 0u;
  }
  groups /= ZR_BASE64_INPUT_GROUP;
  if (!zr_checked_mul_size(groups, ZR_BASE64_OUTPUT_GROUP, &out)) {
    if (out_overflow) {
      *out_overflow = 1u;
    }
    return 0u;
  }
  return out;
}

static void zr_base64_encode_triplet(const uint8_t src[3], uint8_t out[4]) {
  /*
    RFC4648 24-bit group layout:
      src[0]: aaaaaabb
      src[1]: bbbbcccc
      src[2]: ccdddddd
    -> indices: aaaaaa | bbbbbb | cccccc | dddddd
  */
  const uint8_t idx0 = (uint8_t)(src[0] >> ZR_BASE64_INDEX0_SHIFT);
  const uint8_t idx1_hi = (uint8_t)((src[0] & ZR_BASE64_MASK_LOW_2) << ZR_BASE64_INDEX1_LEFT_SHIFT);
  const uint8_t idx1_lo = (uint8_t)(src[1] >> ZR_BASE64_INDEX1_RIGHT_SHIFT);
  const uint8_t idx2_hi = (uint8_t)((src[1] & ZR_BASE64_MASK_LOW_4) << ZR_BASE64_INDEX2_LEFT_SHIFT);
  const uint8_t idx2_lo = (uint8_t)(src[2] >> ZR_BASE64_INDEX2_RIGHT_SHIFT);
  const uint8_t idx3 = (uint8_t)(src[2] & ZR_BASE64_MASK_LOW_6);

  out[0] = ZR_BASE64_ALPHABET[idx0];
  out[1] = ZR_BASE64_ALPHABET[(uint8_t)(idx1_hi | idx1_lo)];
  out[2] = ZR_BASE64_ALPHABET[(uint8_t)(idx2_hi | idx2_lo)];
  out[3] = ZR_BASE64_ALPHABET[idx3];
}

/* Encode input bytes with deterministic padding behavior. */
zr_result_t zr_base64_encode(const uint8_t* in, size_t in_len, uint8_t* out, size_t out_cap, size_t* out_len) {
  uint8_t overflow = 0u;
  size_t need = 0u;
  size_t i = 0u;
  size_t j = 0u;

  if (!out_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_len = 0u;

  if (!out && out_cap != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!in && in_len != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  need = zr_base64_encoded_size(in_len, &overflow);
  if (overflow != 0u) {
    return ZR_ERR_LIMIT;
  }
  if (need > out_cap) {
    return ZR_ERR_LIMIT;
  }
  if (need == 0u) {
    return ZR_OK;
  }
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  while ((i + 3u) <= in_len) {
    zr_base64_encode_triplet(in + i, out + j);
    i += 3u;
    j += 4u;
  }

  if (i < in_len) {
    uint8_t tail[3];
    uint8_t enc[4];
    const size_t rem = in_len - i;

    memset(tail, 0, sizeof(tail));
    memcpy(tail, in + i, rem);
    zr_base64_encode_triplet(tail, enc);

    out[j + 0u] = enc[0u];
    out[j + 1u] = enc[1u];
    if (rem == 1u) {
      out[j + 2u] = (uint8_t)'=';
      out[j + 3u] = (uint8_t)'=';
    } else {
      out[j + 2u] = enc[2u];
      out[j + 3u] = (uint8_t)'=';
    }
    j += 4u;
  }

  *out_len = j;
  return ZR_OK;
}
