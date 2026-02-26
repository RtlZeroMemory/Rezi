/*
  src/core/zr_cursor.h — Engine-internal cursor state representation.

  Why: Cursor control spans drawlist protocol (desired cursor state) and output
  emission (VT sequences + terminal state tracking). This header centralizes
  the engine-internal POD representation without pulling OS headers into core.
*/

#ifndef ZR_CORE_ZR_CURSOR_H_INCLUDED
#define ZR_CORE_ZR_CURSOR_H_INCLUDED

#include <stdint.h>

typedef uint8_t zr_cursor_shape_t;
#define ZR_CURSOR_SHAPE_BLOCK     ((zr_cursor_shape_t)0u)
#define ZR_CURSOR_SHAPE_UNDERLINE ((zr_cursor_shape_t)1u)
#define ZR_CURSOR_SHAPE_BAR       ((zr_cursor_shape_t)2u)

/*
  zr_cursor_state_t:
    - x/y are 0-based cell coordinates.
    - -1 is a sentinel meaning "do not change that coordinate".
    - boolean-like fields must be encoded as 0/1.
*/
typedef struct zr_cursor_state_t {
  int32_t x;
  int32_t y;
  uint8_t shape;
  uint8_t visible;
  uint8_t blink;
  uint8_t reserved0;
} zr_cursor_state_t;

#endif /* ZR_CORE_ZR_CURSOR_H_INCLUDED */

