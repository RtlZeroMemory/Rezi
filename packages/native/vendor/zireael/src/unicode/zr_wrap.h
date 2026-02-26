/*
  src/unicode/zr_wrap.h — Deterministic UTF-8 measurement and wrapping.

  Why: Provides grapheme-safe measurement and greedy wrapping using pinned
  width policy and deterministic tab expansion, without heap allocation.
*/

#ifndef ZR_UNICODE_ZR_WRAP_H_INCLUDED
#define ZR_UNICODE_ZR_WRAP_H_INCLUDED

#include "unicode/zr_width.h"

#include "util/zr_result.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct zr_measure_utf8_t {
  /* Number of visual lines (>=1). */
  uint32_t lines;
  /* Maximum column width of any line. */
  uint32_t max_cols;
} zr_measure_utf8_t;

/*
  zr_measure_utf8:
    - measures UTF-8 bytes using grapheme boundaries
    - treats LF, CR, and CRLF as hard line breaks
    - expands TAB to the next tab stop (tab_stop must be >0)
*/
zr_result_t zr_measure_utf8(const uint8_t* bytes, size_t len, zr_width_policy_t policy, uint32_t tab_stop,
                            zr_measure_utf8_t* out);

/*
  zr_wrap_greedy_utf8:
    - produces line-start offsets (byte indices) at grapheme boundaries
    - treats LF, CR, and CRLF as hard line breaks
    - prefers breaking after whitespace (SPACE/TAB) when a line would overflow
    - if out_offsets_cap is too small, writes as many as fit, sets truncated,
      and returns ZR_OK
*/
zr_result_t zr_wrap_greedy_utf8(const uint8_t* bytes, size_t len, uint32_t max_cols, zr_width_policy_t policy,
                                uint32_t tab_stop, size_t* out_offsets, size_t out_offsets_cap,
                                size_t* out_count, bool* out_truncated);

#endif /* ZR_UNICODE_ZR_WRAP_H_INCLUDED */

