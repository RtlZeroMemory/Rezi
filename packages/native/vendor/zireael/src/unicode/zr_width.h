/*
  src/unicode/zr_width.h — Deterministic terminal column width policy.

  Why: Provides a pinned width model (including emoji policy) for measurement
  and wrapping that is independent of locale and platform APIs.
*/

#ifndef ZR_UNICODE_ZR_WIDTH_H_INCLUDED
#define ZR_UNICODE_ZR_WIDTH_H_INCLUDED

#include "unicode/zr_unicode_pins.h"

#include <stddef.h>
#include <stdint.h>

typedef enum zr_width_policy_t {
  ZR_WIDTH_EMOJI_NARROW = 0,
  ZR_WIDTH_EMOJI_WIDE = 1
} zr_width_policy_t;

static inline zr_width_policy_t zr_width_policy_default(void) {
  return (zr_width_policy_t)ZR_WIDTH_POLICY_DEFAULT;
}

/*
  zr_width_codepoint:
    - returns the width of a single Unicode scalar in terminal columns
    - output is always 0, 1, or 2
    - pinned, deterministic subset (expanded as module vectors grow)
*/
uint8_t zr_width_codepoint(uint32_t scalar);

/*
  zr_width_grapheme_utf8:
    - returns the width of a single grapheme cluster (UTF-8 bytes) in columns
    - emoji width is policy-dependent
*/
uint8_t zr_width_grapheme_utf8(const uint8_t* bytes, size_t len, zr_width_policy_t policy);

#endif /* ZR_UNICODE_ZR_WIDTH_H_INCLUDED */

