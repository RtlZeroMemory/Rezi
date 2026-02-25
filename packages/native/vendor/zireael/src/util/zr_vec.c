/*
  src/util/zr_vec.c — Fixed-capacity vector implementation.

  Why: Keeps container behavior deterministic with explicit failure codes and
  no mutation on failure.
*/

#include "util/zr_vec.h"

#include "util/zr_checked.h"

#include <string.h>

static bool zr__vec_get_offset(const zr_vec_t* v, size_t idx, size_t* out_off) {
  if (!v || !out_off || idx >= v->len || !v->data || v->elem_size == 0u) {
    return false;
  }
  return zr_checked_mul_size(idx, v->elem_size, out_off);
}

/* Initialize a fixed-capacity vector with caller-provided backing storage. */
zr_result_t zr_vec_init(zr_vec_t* v, void* backing_buf, size_t cap_elems, size_t elem_size) {
  if (!v || elem_size == 0u || (cap_elems != 0u && !backing_buf)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  v->data = (cap_elems != 0u) ? (unsigned char*)backing_buf : NULL;
  v->len = 0u;
  v->cap = cap_elems;
  v->elem_size = elem_size;
  return ZR_OK;
}

void zr_vec_reset(zr_vec_t* v) {
  if (!v) {
    return;
  }
  v->len = 0u;
}

size_t zr_vec_len(const zr_vec_t* v) {
  return v ? v->len : 0u;
}

size_t zr_vec_cap(const zr_vec_t* v) {
  return v ? v->cap : 0u;
}

/* Get mutable pointer to element at index; returns NULL if out of bounds. */
void* zr_vec_at(zr_vec_t* v, size_t idx) {
  size_t off = 0u;
  if (!zr__vec_get_offset(v, idx, &off)) {
    return NULL;
  }
  return (void*)(v->data + off);
}

const void* zr_vec_at_const(const zr_vec_t* v, size_t idx) {
  size_t off = 0u;
  if (!zr__vec_get_offset(v, idx, &off)) {
    return NULL;
  }
  return (const void*)(v->data + off);
}

/* Append element to end; returns ZR_ERR_LIMIT if vector is full. */
zr_result_t zr_vec_push(zr_vec_t* v, const void* elem) {
  if (!v || !elem) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (v->len >= v->cap) {
    return ZR_ERR_LIMIT;
  }
  size_t off = 0u;
  if (!zr_checked_mul_size(v->len, v->elem_size, &off)) {
    return ZR_ERR_LIMIT;
  }
  memcpy(v->data + off, elem, v->elem_size);
  v->len++;
  return ZR_OK;
}

/* Remove and copy last element to out_elem; returns ZR_ERR_LIMIT if empty. */
zr_result_t zr_vec_pop(zr_vec_t* v, void* out_elem) {
  if (!v || !out_elem) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (v->len == 0u) {
    return ZR_ERR_LIMIT;
  }
  const size_t idx = v->len - 1u;
  size_t off = 0u;
  if (!zr_checked_mul_size(idx, v->elem_size, &off)) {
    return ZR_ERR_LIMIT;
  }
  memcpy(out_elem, v->data + off, v->elem_size);
  v->len = idx;
  return ZR_OK;
}
