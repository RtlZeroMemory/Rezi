/*
  src/core/zr_damage.h — Engine-internal damage rectangle tracking.

  Why: Provides a deterministic, bounded representation of framebuffer changes
  as coalesced cell-space rectangles. This is used to drive diff emission
  without scanning/emitting for the full frame when changes are sparse.
*/

#ifndef ZR_CORE_ZR_DAMAGE_H_INCLUDED
#define ZR_CORE_ZR_DAMAGE_H_INCLUDED

#include <stdint.h>

typedef struct zr_damage_rect_t {
  uint32_t x0;
  uint32_t y0;
  uint32_t x1;
  uint32_t y1;
} zr_damage_rect_t;

typedef struct zr_damage_t {
  zr_damage_rect_t* rects;
  uint32_t          rect_cap;
  uint32_t          rect_count;
  uint32_t          cols;
  uint32_t          rows;
  uint8_t           full_frame;
  uint8_t           _pad0[3];
} zr_damage_t;

void     zr_damage_begin_frame(zr_damage_t* d, zr_damage_rect_t* storage, uint32_t storage_cap, uint32_t cols,
                               uint32_t rows);
void     zr_damage_add_span(zr_damage_t* d, uint32_t y, uint32_t x0, uint32_t x1);
uint32_t zr_damage_cells(const zr_damage_t* d);

#endif /* ZR_CORE_ZR_DAMAGE_H_INCLUDED */

