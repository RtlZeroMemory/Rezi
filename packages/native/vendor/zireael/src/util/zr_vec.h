/*
  src/util/zr_vec.h — Fixed-capacity vector (no auto-grow).

  Why: Provides deterministic, cap-bounded push/pop for core structures without
  per-operation heap allocation.
*/

#ifndef ZR_UTIL_ZR_VEC_H_INCLUDED
#define ZR_UTIL_ZR_VEC_H_INCLUDED

#include "util/zr_result.h"

#include <stddef.h>

typedef struct zr_vec_t {
  /* Caller-owned backing buffer (capacity is fixed at init). */
  unsigned char* data;
  size_t len;
  size_t cap;
  size_t elem_size;
} zr_vec_t;

zr_result_t zr_vec_init(zr_vec_t* v, void* backing_buf, size_t cap_elems, size_t elem_size);
void        zr_vec_reset(zr_vec_t* v);

size_t      zr_vec_len(const zr_vec_t* v);
size_t      zr_vec_cap(const zr_vec_t* v);

void*       zr_vec_at(zr_vec_t* v, size_t idx);
const void* zr_vec_at_const(const zr_vec_t* v, size_t idx);

zr_result_t zr_vec_push(zr_vec_t* v, const void* elem);
zr_result_t zr_vec_pop(zr_vec_t* v, void* out_elem);

#endif /* ZR_UTIL_ZR_VEC_H_INCLUDED */
