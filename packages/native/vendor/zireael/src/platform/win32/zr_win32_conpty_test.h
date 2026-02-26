/*
  src/platform/win32/zr_win32_conpty_test.h — ConPTY harness helpers for integration tests.

  Why: Provides a small ConPTY runner API so Windows integration tests can run headless
  under a pseudo-console and capture output bytes deterministically.
*/

#ifndef ZR_PLATFORM_WIN32_ZR_WIN32_CONPTY_TEST_H_INCLUDED
#define ZR_PLATFORM_WIN32_ZR_WIN32_CONPTY_TEST_H_INCLUDED

#include "util/zr_result.h"

#include <stddef.h>
#include <stdint.h>

/*
  zr_win32_conpty_run_self_capture:
    - Runs the current executable under ConPTY with additional args.
    - Captures ConPTY output bytes into caller-provided buffer.
    - On unsupported environments, returns ZR_ERR_UNSUPPORTED and writes a stable
      skip reason string.
*/
zr_result_t zr_win32_conpty_run_self_capture(const char* child_args,
                                             uint8_t* out_bytes,
                                             size_t out_cap,
                                             size_t* out_len,
                                             uint32_t* out_exit_code,
                                             char* out_skip_reason,
                                             size_t out_skip_reason_cap);

#endif /* ZR_PLATFORM_WIN32_ZR_WIN32_CONPTY_TEST_H_INCLUDED */
