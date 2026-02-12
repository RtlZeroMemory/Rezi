/*
  src/util/zr_assert.c — Debug assert failure handling and cleanup hook wiring.

  Why: Centralizes abort-path behavior so fatal asserts can run a best-effort
  cleanup callback (for terminal restore) before terminating the process.
*/

#include "util/zr_assert.h"

#include <stdatomic.h>
#include <stdlib.h>

static _Atomic(zr_assert_cleanup_hook_t) g_zr_assert_cleanup_hook = NULL;
static atomic_flag g_zr_assert_fail_guard = ATOMIC_FLAG_INIT;

void zr_assert_set_cleanup_hook(zr_assert_cleanup_hook_t hook) {
  atomic_store_explicit(&g_zr_assert_cleanup_hook, hook, memory_order_release);
}

void zr_assert_clear_cleanup_hook(zr_assert_cleanup_hook_t hook) {
  if (!hook) {
    return;
  }

  zr_assert_cleanup_hook_t expected = hook;
  (void)atomic_compare_exchange_strong_explicit(&g_zr_assert_cleanup_hook, &expected, NULL, memory_order_acq_rel,
                                                memory_order_acquire);
}

void zr_assert_invoke_cleanup_hook_for_test(void) {
  const zr_assert_cleanup_hook_t hook = atomic_load_explicit(&g_zr_assert_cleanup_hook, memory_order_acquire);
  if (!hook) {
    return;
  }
  hook();
}

void zr_assert_fail(const char* file, int line, const char* expr) {
  (void)file;
  (void)line;
  (void)expr;

  /*
    Prevent recursive assert-failure loops from repeatedly invoking cleanup.
    If cleanup itself asserts, abort() still terminates immediately.
  */
  if (!atomic_flag_test_and_set_explicit(&g_zr_assert_fail_guard, memory_order_acq_rel)) {
    zr_assert_invoke_cleanup_hook_for_test();
  }

  abort();
}
