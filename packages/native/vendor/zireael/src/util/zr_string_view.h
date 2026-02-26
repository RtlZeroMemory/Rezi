/*
  src/util/zr_string_view.h — Non-owning string view.

  Why: Allows passing string slices without heap allocation or relying on
  NUL-termination.
*/

#ifndef ZR_UTIL_ZR_STRING_VIEW_H_INCLUDED
#define ZR_UTIL_ZR_STRING_VIEW_H_INCLUDED

#include <stdbool.h>
#include <stddef.h>

typedef struct zr_string_view_t {
  const char* ptr;
  size_t len;
} zr_string_view_t;

static inline zr_string_view_t zr_sv(const char* ptr, size_t len) {
  zr_string_view_t v;
  v.ptr = ptr;
  v.len = len;
  return v;
}

static inline bool zr_sv_eq(zr_string_view_t a, zr_string_view_t b) {
  if (a.len != b.len) {
    return false;
  }
  if (a.len == 0u) {
    return true;
  }
  if (!a.ptr || !b.ptr) {
    return false;
  }
  for (size_t i = 0; i < a.len; i++) {
    if (a.ptr[i] != b.ptr[i]) {
      return false;
    }
  }
  return true;
}

#endif /* ZR_UTIL_ZR_STRING_VIEW_H_INCLUDED */

