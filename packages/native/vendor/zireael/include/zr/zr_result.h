/*
  include/zr/zr_result.h - Public result type and error constants.

  Why: Defines Zireael's cross-module contract: 0 means success, negative
  values mean failure.
*/

#ifndef ZR_ZR_RESULT_H_INCLUDED
#define ZR_ZR_RESULT_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

typedef int zr_result_t;

/* Success. */
#define ZR_OK ((zr_result_t)0)

/*
  Failures (negative).

  Numeric values are pinned and aligned with docs/ERROR_CODES_CATALOG.md.
*/
#define ZR_ERR_INVALID_ARGUMENT ((zr_result_t) - 1)
#define ZR_ERR_OOM ((zr_result_t) - 2)
#define ZR_ERR_LIMIT ((zr_result_t) - 3)
#define ZR_ERR_UNSUPPORTED ((zr_result_t) - 4)
#define ZR_ERR_FORMAT ((zr_result_t) - 5)
#define ZR_ERR_PLATFORM ((zr_result_t) - 6)

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_RESULT_H_INCLUDED */
