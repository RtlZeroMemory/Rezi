/*
  src/util/zr_log.c — Log sink indirection implementation.

  Why: Provides a tiny, deterministic logging hook without any stdio dependency.
*/

#include "util/zr_log.h"
#include "util/zr_thread_yield.h"

#include <stdatomic.h>
#include <stdint.h>

enum {
  /*
    Yield every 64 failed lock spins.

    Why: Keeps uncontended lock/unlock fast while still giving the scheduler
    regular opportunities under sustained contention.
  */
  ZR_LOG_LOCK_YIELD_MASK = 63u,
};

static zr_log_sink_fn_t g_sink = 0;
static void* g_sink_user = 0;
static atomic_flag g_sink_lock = ATOMIC_FLAG_INIT;

static void zr_log_lock(void) {
  uint32_t spins = 0u;
  while (atomic_flag_test_and_set_explicit(&g_sink_lock, memory_order_acquire)) {
    spins++;
    if ((spins & ZR_LOG_LOCK_YIELD_MASK) == 0u) {
      zr_thread_yield();
    }
  }
}

static void zr_log_unlock(void) {
  atomic_flag_clear_explicit(&g_sink_lock, memory_order_release);
}

void zr_log_set_sink(zr_log_sink_fn_t sink, void* user) {
  zr_log_lock();
  g_sink = sink;
  g_sink_user = user;
  zr_log_unlock();
}

void zr_log_write(zr_string_view_t msg) {
  zr_log_sink_fn_t sink = 0;
  void* user = 0;

  zr_log_lock();
  sink = g_sink;
  user = g_sink_user;
  zr_log_unlock();

  if (sink) {
    sink(user, msg);
  }
}
