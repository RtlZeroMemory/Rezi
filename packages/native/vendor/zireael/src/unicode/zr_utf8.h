/*
  src/unicode/zr_utf8.h — Deterministic UTF-8 decoding primitives.

  Why: Provides a bounds-safe decoder with a pinned invalid-sequence policy so
  higher-level Unicode routines can be fuzzed and tested deterministically.
*/

#ifndef ZR_UNICODE_ZR_UTF8_H_INCLUDED
#define ZR_UNICODE_ZR_UTF8_H_INCLUDED

#include <stddef.h>
#include <stdint.h>

typedef struct zr_utf8_decode_result_t {
  /*
    scalar:
      - decoded Unicode scalar value on success
      - U+FFFD replacement on failure (locked policy)
  */
  uint32_t scalar;
  /*
    size:
      - bytes consumed from input
      - if len>0, always >=1 (locked progress guarantee)
      - if len==0, size==0
  */
  uint8_t size;
  /* 1 if valid UTF-8 sequence, 0 otherwise. */
  uint8_t valid;
  uint16_t _pad0;
} zr_utf8_decode_result_t;

/*
  zr_utf8_decode_one:
    - never reads past len
    - always makes progress when len>0
    - rejects overlongs, surrogates, and scalars > U+10FFFF
    - invalid policy (locked):
        if len>0 and invalid sequence => {U+FFFD, valid=0, size=1}
*/
zr_utf8_decode_result_t zr_utf8_decode_one(const uint8_t* s, size_t len);

#endif /* ZR_UNICODE_ZR_UTF8_H_INCLUDED */

