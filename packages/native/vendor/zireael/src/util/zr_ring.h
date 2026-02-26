/*
  src/util/zr_ring.h — Fixed-capacity FIFO ring buffer.

  Why: Provides deterministic FIFO push/pop with explicit "full" failure and
  no mutation on failed push.
*/

#ifndef ZR_UTIL_ZR_RING_H_INCLUDED
#define ZR_UTIL_ZR_RING_H_INCLUDED

#include "util/zr_result.h"

#include <stdbool.h>
#include <stddef.h>

typedef struct zr_ring_t {
  /* Caller-owned backing buffer (capacity is fixed at init). */
  unsigned char* data;
  size_t cap;
  size_t len;
  size_t head; /* next pop */
  size_t tail; /* next push */
  size_t elem_size;
} zr_ring_t;

zr_result_t zr_ring_init(zr_ring_t* r, void* backing_buf, size_t cap_elems, size_t elem_size);
void        zr_ring_reset(zr_ring_t* r);

size_t      zr_ring_len(const zr_ring_t* r);
size_t      zr_ring_cap(const zr_ring_t* r);
bool        zr_ring_is_empty(const zr_ring_t* r);
bool        zr_ring_is_full(const zr_ring_t* r);

zr_result_t zr_ring_push(zr_ring_t* r, const void* elem);
bool        zr_ring_pop(zr_ring_t* r, void* out_elem);

#endif /* ZR_UTIL_ZR_RING_H_INCLUDED */
