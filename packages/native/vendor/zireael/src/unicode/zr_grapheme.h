/*
  src/unicode/zr_grapheme.h — Deterministic grapheme cluster iteration (UAX #29 subset).

  Why: Provides grapheme-safe iteration for wrapping and measurement without
  heap allocation and without splitting valid UTF-8 sequences.
*/

#ifndef ZR_UNICODE_ZR_GRAPHEME_H_INCLUDED
#define ZR_UNICODE_ZR_GRAPHEME_H_INCLUDED

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct zr_grapheme_t {
  /* Byte offset into the original UTF-8 buffer. */
  size_t offset;
  /* Byte length of the grapheme cluster (always >=1 for non-empty input). */
  size_t size;
} zr_grapheme_t;

typedef struct zr_grapheme_iter_t {
  const uint8_t* bytes;
  size_t         len;
  size_t         off;
} zr_grapheme_iter_t;

/*
  zr_grapheme_iter_init:
    - bytes must remain valid for the lifetime of the iterator
    - bytes may be NULL only when len==0
*/
void zr_grapheme_iter_init(zr_grapheme_iter_t* it, const uint8_t* bytes, size_t len);

/*
  zr_grapheme_next:
    - returns false when iteration is complete
    - always makes progress when it->off < it->len
    - never reads past the provided buffer length
*/
bool zr_grapheme_next(zr_grapheme_iter_t* it, zr_grapheme_t* out);

#endif /* ZR_UNICODE_ZR_GRAPHEME_H_INCLUDED */

