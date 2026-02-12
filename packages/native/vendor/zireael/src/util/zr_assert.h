/*
  src/util/zr_assert.h — Debug-only invariant assertions and abort cleanup hook.

  Why: Provides inexpensive internal invariants that compile out in release
  builds. Also provides a process-local cleanup hook so fatal assert paths can
  attempt terminal restore before aborting.
*/

#ifndef ZR_UTIL_ZR_ASSERT_H_INCLUDED
#define ZR_UTIL_ZR_ASSERT_H_INCLUDED

typedef void (*zr_assert_cleanup_hook_t)(void);

void zr_assert_set_cleanup_hook(zr_assert_cleanup_hook_t hook);
void zr_assert_clear_cleanup_hook(zr_assert_cleanup_hook_t hook);

/*
  Execute the currently registered cleanup hook without aborting.

  Why: Unit tests use this to validate crash/abort restore wiring
  deterministically.
*/
void zr_assert_invoke_cleanup_hook_for_test(void);

void zr_assert_fail(const char* file, int line, const char* expr);

#if defined(NDEBUG)
#define ZR_ASSERT(expr) ((void)0)
#else
#define ZR_ASSERT(expr)                                                                                                \
  do {                                                                                                                 \
    if (!(expr)) {                                                                                                     \
      zr_assert_fail(__FILE__, __LINE__, #expr);                                                                       \
    }                                                                                                                  \
  } while (0)
#endif

#endif /* ZR_UTIL_ZR_ASSERT_H_INCLUDED */
