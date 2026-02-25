/*
  src/core/zr_damage.c — Engine-internal damage rectangle tracking.

  Why: Tracks changed framebuffer regions in bounded storage so diff rendering
  can skip unchanged cells without violating no-partial-effects guarantees.
*/

#include "core/zr_damage.h"

#include "util/zr_checked.h"

#include <string.h>

/* Saturation sentinel for APIs that return uint32_t cell counts. */
static const uint32_t ZR_DAMAGE_CELLS_SATURATED = 0xFFFFFFFFu;

void zr_damage_begin_frame(zr_damage_t* d, zr_damage_rect_t* storage, uint32_t storage_cap, uint32_t cols,
                           uint32_t rows) {
  if (!d) {
    return;
  }
  memset(d, 0, sizeof(*d));
  d->rects = storage;
  d->rect_cap = storage_cap;
  d->rect_count = 0u;
  d->cols = cols;
  d->rows = rows;
  d->full_frame = 0u;
  d->_pad0[0] = 0u;
  d->_pad0[1] = 0u;
  d->_pad0[2] = 0u;
}

static void zr_damage_mark_full(zr_damage_t* d) {
  if (!d) {
    return;
  }
  d->full_frame = 1u;

  if (!d->rects || d->rect_cap == 0u || d->cols == 0u || d->rows == 0u) {
    d->rect_count = 0u;
    return;
  }

  d->rects[0].x0 = 0u;
  d->rects[0].y0 = 0u;
  d->rects[0].x1 = d->cols - 1u;
  d->rects[0].y1 = d->rows - 1u;
  d->rect_count = 1u;
}

void zr_damage_add_span(zr_damage_t* d, uint32_t y, uint32_t x0, uint32_t x1) {
  if (!d) {
    return;
  }
  if (d->full_frame != 0u) {
    return;
  }
  if (!d->rects || d->rect_cap == 0u) {
    zr_damage_mark_full(d);
    return;
  }
  if (d->cols == 0u || d->rows == 0u) {
    zr_damage_mark_full(d);
    return;
  }
  if (y >= d->rows) {
    zr_damage_mark_full(d);
    return;
  }
  if (x1 < x0 || x0 >= d->cols) {
    return;
  }
  if (x1 >= d->cols) {
    x1 = d->cols - 1u;
  }

  for (uint32_t i = 0u; i < d->rect_count; i++) {
    zr_damage_rect_t* r = &d->rects[i];
    if (r->x0 != x0 || r->x1 != x1) {
      continue;
    }
    if (r->y1 + 1u != y) {
      continue;
    }
    r->y1 = y;
    return;
  }

  if (d->rect_count >= d->rect_cap) {
    zr_damage_mark_full(d);
    return;
  }

  zr_damage_rect_t* r = &d->rects[d->rect_count++];
  r->x0 = x0;
  r->y0 = y;
  r->x1 = x1;
  r->y1 = y;
}

uint32_t zr_damage_cells(const zr_damage_t* d) {
  if (!d) {
    return 0u;
  }
  if (d->full_frame != 0u) {
    size_t cells = 0u;
    if (!zr_checked_mul_size((size_t)d->cols, (size_t)d->rows, &cells)) {
      return ZR_DAMAGE_CELLS_SATURATED;
    }
    return (cells > (size_t)ZR_DAMAGE_CELLS_SATURATED) ? ZR_DAMAGE_CELLS_SATURATED : (uint32_t)cells;
  }
  uint64_t sum = 0u;
  for (uint32_t i = 0u; i < d->rect_count; i++) {
    const zr_damage_rect_t* r = &d->rects[i];
    if (r->x1 < r->x0 || r->y1 < r->y0) {
      continue;
    }
    const uint64_t w = (uint64_t)(r->x1 - r->x0 + 1u);
    const uint64_t h = (uint64_t)(r->y1 - r->y0 + 1u);
    sum += w * h;
    if (sum > ZR_DAMAGE_CELLS_SATURATED) {
      return ZR_DAMAGE_CELLS_SATURATED;
    }
  }
  return (uint32_t)sum;
}
