/*
  src/util/zr_macros.h — Small shared macro helpers for engine internals.

  Why: Centralizes simple, side-effect-free utility macros used across
  modules, reducing repeated ad-hoc patterns while keeping behavior explicit.
*/

#ifndef ZR_UTIL_ZR_MACROS_H_INCLUDED
#define ZR_UTIL_ZR_MACROS_H_INCLUDED

/*
  Number of elements in a fixed-size array.

  On compilers with GNU builtins, reject pointer arguments at compile time.
  MSVC lacks __builtin_types_compatible_p/__typeof__, so fall back to the
  size-based form to keep callsites readable and portable.
*/
#if defined(_MSC_VER) && !defined(__clang__)
#define ZR_ARRAYLEN(arr) (sizeof(arr) / sizeof((arr)[0]))
#else
#define ZR_ARRAYLEN(arr)                                                                                               \
  ((sizeof(arr) / sizeof((arr)[0])) +                                                                                  \
   0u * sizeof(char[1 - 2 * !!__builtin_types_compatible_p(__typeof__(arr), __typeof__(&(arr)[0]))]))
#endif

/*
  Generic min/max helpers.

  Callers must pass side-effect-free arguments to avoid double evaluation.
*/
#define ZR_MIN(a, b) (((a) < (b)) ? (a) : (b))
#define ZR_MAX(a, b) (((a) > (b)) ? (a) : (b))

#endif /* ZR_UTIL_ZR_MACROS_H_INCLUDED */
