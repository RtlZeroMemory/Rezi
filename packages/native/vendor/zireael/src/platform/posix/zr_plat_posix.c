/*
  src/platform/posix/zr_plat_posix.c — POSIX platform backend (termios + self-pipe wake).

  Why: Implements the OS-facing platform boundary for POSIX terminals:
    - raw mode enter/leave (idempotent, best-effort restore on leave)
    - explicit non-TTY pipe mode (env-gated, deterministic, no termios on pipes)
    - non-blocking input reads
    - poll()-based wait that can be interrupted by a self-pipe wake (threads + signals)
*/

#if defined(__APPLE__) && !defined(_DARWIN_C_SOURCE)
#define _DARWIN_C_SOURCE 1
#endif

#if !defined(_POSIX_C_SOURCE) && !defined(__APPLE__)
#define _POSIX_C_SOURCE 200809L
#endif

#include "platform/zr_platform.h"
#include "platform/posix/zr_plat_posix_test.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

struct plat_t {
  plat_config_t cfg;
  plat_caps_t caps;

  int stdin_fd;
  int stdout_fd;
  int tty_fd_owned;

  int wake_read_fd;
  int wake_write_fd;
  int wake_slot_index;

  int stdin_flags_saved;
  bool stdin_flags_valid;
  struct termios termios_saved;
  bool termios_valid;

  bool raw_active;
  bool explicit_pipe_mode;

  bool sigwinch_registered;
};

enum {
  ZR_POSIX_SIGWINCH_MAX_WAKE_FDS = 32u,
  ZR_POSIX_PIPE_MODE_DEFAULT_COLS = 80u,
  ZR_POSIX_PIPE_MODE_DEFAULT_ROWS = 24u,
  ZR_STYLE_ATTR_BOLD = 1u << 0u,
  ZR_STYLE_ATTR_ITALIC = 1u << 1u,
  ZR_STYLE_ATTR_UNDERLINE = 1u << 2u,
  ZR_STYLE_ATTR_REVERSE = 1u << 3u,
  ZR_STYLE_ATTR_DIM = 1u << 4u,
  ZR_STYLE_ATTR_STRIKE = 1u << 5u,
  ZR_STYLE_ATTR_OVERLINE = 1u << 6u,
  ZR_STYLE_ATTR_BLINK = 1u << 7u,
  ZR_STYLE_ATTR_ALL_MASK = (1u << 8u) - 1u,
};

static _Atomic int g_posix_wake_fd_slots[ZR_POSIX_SIGWINCH_MAX_WAKE_FDS];
static _Atomic int g_posix_wake_overflow_slots[ZR_POSIX_SIGWINCH_MAX_WAKE_FDS];
static _Atomic int g_posix_test_force_sigwinch_overflow = 0;
static atomic_flag g_posix_sigwinch_ctl_lock = ATOMIC_FLAG_INIT;
static int g_posix_sigwinch_refcount = 0;
static struct sigaction g_posix_sigwinch_prev;
static bool g_posix_sigwinch_prev_valid = false;
typedef void (*zr_posix_sa_handler_fn)(int);
typedef void (*zr_posix_sa_sigaction_fn)(int, siginfo_t*, void*);

/*
  Signal-safe previous-handler state.

  Why: The SIGWINCH handler must only touch signal-safe state. Plain global
  function-pointer loads from a signal handler are undefined in strict C.
  We store handler pointers in lock-free atomic function-pointer slots and gate
  reads with a lock-free atomic kind field.

  g_posix_prev_handler_kind:
    0 = no previous handler (or SIG_IGN/SIG_DFL)
    1 = previous handler is sa_handler (traditional)
    2 = previous handler is sa_sigaction (SA_SIGINFO)
*/
#if (ATOMIC_INT_LOCK_FREE != 2) || (ATOMIC_POINTER_LOCK_FREE != 2)
#error "POSIX signal chaining requires lock-free int/pointer atomics."
#endif
static _Atomic int g_posix_prev_handler_kind = 0;
static _Atomic(zr_posix_sa_handler_fn) g_posix_prev_sa_handler = NULL;
static _Atomic(zr_posix_sa_sigaction_fn) g_posix_prev_sa_sigaction = NULL;

/*
  POSIX testing hook: force SIGWINCH overflow marker path.

  Why: Integration tests need deterministic coverage for self-pipe overflow
  handling without depending on kernel pipe-size behavior.
*/
void zr_posix_test_force_sigwinch_overflow(uint8_t enabled) {
  atomic_store_explicit(&g_posix_test_force_sigwinch_overflow, enabled ? 1 : 0, memory_order_release);
}

static void zr_posix_sigwinch_handler(int signo, siginfo_t* info, void* ucontext);

static void zr_posix_sigwinch_ctl_lock_acquire(void) {
  while (atomic_flag_test_and_set_explicit(&g_posix_sigwinch_ctl_lock, memory_order_acquire)) {
    /* spin */
  }
}

static void zr_posix_sigwinch_ctl_lock_release(void) {
  atomic_flag_clear_explicit(&g_posix_sigwinch_ctl_lock, memory_order_release);
}

static int zr_posix_wake_fd_encode(int fd) {
  if (fd < 0 || fd >= INT_MAX) {
    return 0;
  }
  return fd + 1;
}

static bool zr_posix_wake_slot_register_fd(int wake_fd, int* out_slot_index) {
  const int encoded = zr_posix_wake_fd_encode(wake_fd);
  if (encoded == 0) {
    return false;
  }
  if (out_slot_index) {
    *out_slot_index = -1;
  }

  for (uint32_t i = 0u; i < ZR_POSIX_SIGWINCH_MAX_WAKE_FDS; i++) {
    int expected = 0;
    if (atomic_compare_exchange_strong_explicit(&g_posix_wake_fd_slots[i], &expected, encoded, memory_order_acq_rel,
                                                memory_order_acquire)) {
      atomic_store_explicit(&g_posix_wake_overflow_slots[i], 0, memory_order_release);
      if (out_slot_index) {
        *out_slot_index = (int)i;
      }
      return true;
    }
    if (expected == encoded) {
      atomic_store_explicit(&g_posix_wake_overflow_slots[i], 0, memory_order_release);
      if (out_slot_index) {
        *out_slot_index = (int)i;
      }
      return true;
    }
  }
  return false;
}

static void zr_posix_wake_slot_unregister_fd(int wake_fd, int wake_slot_index) {
  const int encoded = zr_posix_wake_fd_encode(wake_fd);
  if (encoded == 0) {
    return;
  }

  if (wake_slot_index >= 0 && (uint32_t)wake_slot_index < ZR_POSIX_SIGWINCH_MAX_WAKE_FDS) {
    const int current = atomic_load_explicit(&g_posix_wake_fd_slots[wake_slot_index], memory_order_acquire);
    if (current == encoded) {
      atomic_store_explicit(&g_posix_wake_fd_slots[wake_slot_index], 0, memory_order_release);
      atomic_store_explicit(&g_posix_wake_overflow_slots[wake_slot_index], 0, memory_order_release);
      return;
    }
  }

  for (uint32_t i = 0u; i < ZR_POSIX_SIGWINCH_MAX_WAKE_FDS; i++) {
    int expected = encoded;
    if (atomic_compare_exchange_strong_explicit(&g_posix_wake_fd_slots[i], &expected, 0, memory_order_acq_rel,
                                                memory_order_acquire)) {
      atomic_store_explicit(&g_posix_wake_overflow_slots[i], 0, memory_order_release);
      return;
    }
  }
}

static bool zr_posix_wake_slot_consume_overflow(const plat_t* plat) {
  if (!plat) {
    return false;
  }
  if (plat->wake_slot_index < 0 || (uint32_t)plat->wake_slot_index >= ZR_POSIX_SIGWINCH_MAX_WAKE_FDS) {
    return false;
  }
  return atomic_exchange_explicit(&g_posix_wake_overflow_slots[plat->wake_slot_index], 0, memory_order_acq_rel) != 0;
}

static const char* zr_posix_getenv_nonempty(const char* key) {
  if (!key) {
    return NULL;
  }
  const char* v = getenv(key);
  if (!v || v[0] == '\0') {
    return NULL;
  }
  return v;
}

static bool zr_posix_term_is_dumb(void) {
  const char* term = zr_posix_getenv_nonempty("TERM");
  if (!term) {
    return true;
  }
  return strcmp(term, "dumb") == 0;
}

static bool zr_posix_str_has_any(const char* s, const char* const* needles, size_t count) {
  if (!s || !needles) {
    return false;
  }
  for (size_t i = 0u; i < count; i++) {
    if (needles[i] && strstr(s, needles[i])) {
      return true;
    }
  }
  return false;
}

static uint8_t zr_posix_ascii_tolower(uint8_t c) {
  if (c >= (uint8_t)'A' && c <= (uint8_t)'Z') {
    return (uint8_t)(c + ((uint8_t)'a' - (uint8_t)'A'));
  }
  return c;
}

static bool zr_posix_str_contains_ci(const char* s, const char* needle) {
  if (!s || !needle || needle[0] == '\0') {
    return false;
  }

  for (size_t i = 0u; s[i] != '\0'; i++) {
    size_t j = 0u;
    while (needle[j] != '\0' && s[i + j] != '\0' &&
           zr_posix_ascii_tolower((uint8_t)s[i + j]) == zr_posix_ascii_tolower((uint8_t)needle[j])) {
      j++;
    }
    if (needle[j] == '\0') {
      return true;
    }
  }
  return false;
}

static bool zr_posix_str_has_any_ci(const char* s, const char* const* needles, size_t count) {
  if (!s || !needles) {
    return false;
  }
  for (size_t i = 0u; i < count; i++) {
    if (needles[i] && zr_posix_str_contains_ci(s, needles[i])) {
      return true;
    }
  }
  return false;
}

static bool zr_posix_env_bool_override(const char* key, uint8_t* out_value) {
  if (!key || !out_value) {
    return false;
  }

  const char* v = zr_posix_getenv_nonempty(key);
  if (!v) {
    return false;
  }
  if (strcmp(v, "1") == 0 || strcmp(v, "true") == 0 || strcmp(v, "TRUE") == 0 || strcmp(v, "yes") == 0 ||
      strcmp(v, "YES") == 0 || strcmp(v, "on") == 0 || strcmp(v, "ON") == 0) {
    *out_value = 1u;
    return true;
  }
  if (strcmp(v, "0") == 0 || strcmp(v, "false") == 0 || strcmp(v, "FALSE") == 0 || strcmp(v, "no") == 0 ||
      strcmp(v, "NO") == 0 || strcmp(v, "off") == 0 || strcmp(v, "OFF") == 0) {
    *out_value = 0u;
    return true;
  }
  return false;
}

static bool zr_posix_pipe_mode_enabled(void) {
  uint8_t enabled = 0u;
  if (!zr_posix_env_bool_override("ZIREAEL_POSIX_PIPE_MODE", &enabled)) {
    return false;
  }
  return enabled != 0u;
}

static void zr_posix_cap_override(const char* key, uint8_t* inout_cap) {
  uint8_t override_value = 0u;
  if (zr_posix_env_bool_override(key, &override_value)) {
    *inout_cap = override_value;
  }
}

static bool zr_posix_env_u32_override(const char* key, uint32_t* out_value) {
  if (!key || !out_value) {
    return false;
  }

  const char* v = zr_posix_getenv_nonempty(key);
  if (!v) {
    return false;
  }
  if (v[0] == '-' || v[0] == '+') {
    return false;
  }

  errno = 0;
  char* end = NULL;
  unsigned long parsed = strtoul(v, &end, 0);
  if (errno != 0 || !end || *end != '\0' || parsed > UINT32_MAX) {
    return false;
  }

  *out_value = (uint32_t)parsed;
  return true;
}

static void zr_posix_cap_u32_override(const char* key, uint32_t* inout_cap) {
  uint32_t override_value = 0u;
  if (zr_posix_env_u32_override(key, &override_value)) {
    *inout_cap = override_value;
  }
}

static bool zr_posix_term_supports_vt_common(void) {
  if (zr_posix_term_is_dumb()) {
    return false;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  static const char* kVtTerms[] = {"xterm",     "screen", "tmux",    "rxvt", "vt", "linux",
                                   "alacritty", "kitty",  "wezterm", "foot", "st", "rio"};
  return zr_posix_str_has_any(term, kVtTerms, sizeof(kVtTerms) / sizeof(kVtTerms[0]));
}

static bool zr_posix_term_program_indicates_truecolor(const char* term_program) {
  static const char* kPrograms[] = {"iTerm.app", "WezTerm", "Rio", "WarpTerminal", "vscode"};
  return zr_posix_str_has_any_ci(term_program, kPrograms, sizeof(kPrograms) / sizeof(kPrograms[0]));
}

static bool zr_posix_term_indicates_truecolor(const char* term) {
  static const char* kTruecolorTerms[] = {"-direct",   "truecolor", "24bit",   "kitty", "wezterm",
                                          "alacritty", "foot",      "ghostty", "rio"};
  return zr_posix_str_has_any_ci(term, kTruecolorTerms, sizeof(kTruecolorTerms) / sizeof(kTruecolorTerms[0]));
}

static bool zr_posix_detect_truecolor_env(void) {
  const char* colorterm = zr_posix_getenv_nonempty("COLORTERM");
  if (zr_posix_str_contains_ci(colorterm, "truecolor") || zr_posix_str_contains_ci(colorterm, "24bit") ||
      zr_posix_str_contains_ci(colorterm, "24-bit") || zr_posix_str_contains_ci(colorterm, "rgb")) {
    return true;
  }

  if (zr_posix_getenv_nonempty("KITTY_WINDOW_ID") || zr_posix_getenv_nonempty("WEZTERM_PANE") ||
      zr_posix_getenv_nonempty("WEZTERM_EXECUTABLE") || zr_posix_getenv_nonempty("GHOSTTY_RESOURCES_DIR") ||
      zr_posix_getenv_nonempty("VTE_VERSION") || zr_posix_getenv_nonempty("KONSOLE_VERSION") ||
      zr_posix_getenv_nonempty("WT_SESSION")) {
    return true;
  }

  const char* term_program = zr_posix_getenv_nonempty("TERM_PROGRAM");
  if (zr_posix_term_program_indicates_truecolor(term_program)) {
    return true;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  return zr_posix_term_indicates_truecolor(term);
}

static plat_color_mode_t zr_posix_color_mode_clamp(plat_color_mode_t requested, plat_color_mode_t detected) {
  /*
    requested_color_mode is a wrapper request. The backend must not report or
    emit a higher mode than it believes is supported, but wrappers may request
    a lower mode for determinism or compatibility.
  */
  if (detected == PLAT_COLOR_MODE_UNKNOWN) {
    detected = PLAT_COLOR_MODE_16;
  }
  if (requested == PLAT_COLOR_MODE_UNKNOWN) {
    return detected;
  }
  return (requested < detected) ? requested : detected;
}

static plat_color_mode_t zr_posix_detect_color_mode(void) {
  /*
    Color detection must be conservative and deterministic.

    Why: The engine uses caps.color_mode to decide which SGR forms are safe to
    emit. Over-reporting can corrupt output in low-color terminals/CI.
  */
  if (zr_posix_term_is_dumb()) {
    return PLAT_COLOR_MODE_16;
  }

  if (zr_posix_detect_truecolor_env()) {
    return PLAT_COLOR_MODE_RGB;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  if (zr_posix_str_contains_ci(term, "256color")) {
    return PLAT_COLOR_MODE_256;
  }
  return PLAT_COLOR_MODE_16;
}

static uint8_t zr_posix_detect_scroll_region(void) {
  return zr_posix_term_supports_vt_common() ? 1u : 0u;
}

static uint8_t zr_posix_detect_mouse_tracking(void) {
  return zr_posix_term_supports_vt_common() ? 1u : 0u;
}

static uint8_t zr_posix_detect_bracketed_paste(void) {
  return zr_posix_term_supports_vt_common() ? 1u : 0u;
}

static uint8_t zr_posix_detect_focus_events(void) {
  if (zr_posix_term_is_dumb()) {
    return 0u;
  }

  if (zr_posix_getenv_nonempty("KITTY_WINDOW_ID") || zr_posix_getenv_nonempty("WEZTERM_PANE") ||
      zr_posix_getenv_nonempty("WEZTERM_EXECUTABLE") || zr_posix_getenv_nonempty("GHOSTTY_RESOURCES_DIR") ||
      zr_posix_getenv_nonempty("VTE_VERSION") || zr_posix_getenv_nonempty("WT_SESSION")) {
    return 1u;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  static const char* kFocusTerms[] = {"xterm",   "screen", "tmux", "rxvt", "alacritty", "kitty",
                                      "wezterm", "foot",   "st",   "rio",  "ghostty"};
  return zr_posix_str_has_any_ci(term, kFocusTerms, sizeof(kFocusTerms) / sizeof(kFocusTerms[0])) ? 1u : 0u;
}

static uint8_t zr_posix_detect_cursor_shape(void) {
  if (zr_posix_term_is_dumb()) {
    return 0u;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  static const char* kCursorTerms[] = {"xterm", "screen",  "tmux", "rxvt", "alacritty",
                                       "kitty", "wezterm", "foot", "st",   "rio"};
  return zr_posix_str_has_any(term, kCursorTerms, sizeof(kCursorTerms) / sizeof(kCursorTerms[0])) ? 1u : 0u;
}

static uint32_t zr_posix_detect_sgr_attrs_supported(void) {
  if (zr_posix_term_is_dumb()) {
    return 0u;
  }

  uint32_t attrs = ZR_STYLE_ATTR_BOLD | ZR_STYLE_ATTR_UNDERLINE | ZR_STYLE_ATTR_REVERSE | ZR_STYLE_ATTR_DIM;
  if (zr_posix_detect_truecolor_env()) {
    attrs |= ZR_STYLE_ATTR_ITALIC | ZR_STYLE_ATTR_STRIKE | ZR_STYLE_ATTR_OVERLINE | ZR_STYLE_ATTR_BLINK;
    return attrs;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  static const char* kRichAttrTerms[] = {"xterm",   "screen", "tmux", "rxvt", "alacritty", "kitty",
                                         "wezterm", "foot",   "st",   "rio",  "ghostty"};
  if (zr_posix_str_has_any_ci(term, kRichAttrTerms, sizeof(kRichAttrTerms) / sizeof(kRichAttrTerms[0]))) {
    attrs |= ZR_STYLE_ATTR_ITALIC | ZR_STYLE_ATTR_STRIKE | ZR_STYLE_ATTR_OVERLINE | ZR_STYLE_ATTR_BLINK;
  }
  return attrs;
}

static uint8_t zr_posix_detect_osc52(void) {
  if (zr_posix_term_is_dumb()) {
    return 0u;
  }

  if (zr_posix_getenv_nonempty("KITTY_WINDOW_ID")) {
    return 1u;
  }
  if (zr_posix_getenv_nonempty("WEZTERM_PANE") || zr_posix_getenv_nonempty("WEZTERM_EXECUTABLE")) {
    return 1u;
  }
  const char* term_program = zr_posix_getenv_nonempty("TERM_PROGRAM");
  if (term_program && strcmp(term_program, "iTerm.app") == 0) {
    return 1u;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  static const char* kOsc52Terms[] = {"xterm", "screen", "tmux", "rxvt", "kitty", "wezterm"};
  return zr_posix_str_has_any(term, kOsc52Terms, sizeof(kOsc52Terms) / sizeof(kOsc52Terms[0])) ? 1u : 0u;
}

static uint8_t zr_posix_detect_sync_update(void) {
  /*
    Synchronized output (DEC private mode ?2026) is not universally supported.
    Use a conservative allowlist based on well-known environment markers.
  */
  if (zr_posix_term_is_dumb()) {
    return 0u;
  }

  if (zr_posix_getenv_nonempty("KITTY_WINDOW_ID")) {
    return 1u;
  }
  if (zr_posix_getenv_nonempty("WEZTERM_PANE") || zr_posix_getenv_nonempty("WEZTERM_EXECUTABLE")) {
    return 1u;
  }

  const char* term_program = zr_posix_getenv_nonempty("TERM_PROGRAM");
  if (term_program && strcmp(term_program, "iTerm.app") == 0) {
    return 1u;
  }
  if (term_program && (strcmp(term_program, "Rio") == 0 || strcmp(term_program, "rio") == 0)) {
    return 1u;
  }

  const char* term = zr_posix_getenv_nonempty("TERM");
  if (term && (strstr(term, "kitty") || strstr(term, "wezterm") || strstr(term, "rio"))) {
    return 1u;
  }

  return 0u;
}

/*
  Chain to any prior SIGWINCH handler we replaced during plat_create().

  Why: Host runtimes may rely on their own SIGWINCH hooks. Chaining preserves
  process behavior while still waking the engine's self-pipe.

  Signal-safety: reads only lock-free atomics from signal context.
*/
static void zr_posix_sigwinch_chain_previous(int signo, siginfo_t* info, void* ucontext) {
  const int kind = atomic_load_explicit(&g_posix_prev_handler_kind, memory_order_acquire);
  if (kind == 2) {
    zr_posix_sa_sigaction_fn prev = atomic_load_explicit(&g_posix_prev_sa_sigaction, memory_order_relaxed);
    if (prev) {
      prev(signo, info, ucontext);
    }
    return;
  }
  if (kind == 1) {
    zr_posix_sa_handler_fn prev = atomic_load_explicit(&g_posix_prev_sa_handler, memory_order_relaxed);
    if (prev) {
      prev(signo);
    }
  }
}

/*
  Snapshot previous-handler state into lock-free atomics for signal-context reads.

  Why: The SIGWINCH handler may need to chain to a prior handler without touching
  non-atomic process state.
*/
static void zr_posix_sigwinch_publish_previous(const struct sigaction* prev) {
  if (!prev) {
    return;
  }

  atomic_store_explicit(&g_posix_prev_sa_handler, NULL, memory_order_relaxed);
  atomic_store_explicit(&g_posix_prev_sa_sigaction, NULL, memory_order_relaxed);
  atomic_store_explicit(&g_posix_prev_handler_kind, 0, memory_order_relaxed);

  if ((prev->sa_flags & SA_SIGINFO) != 0) {
    if (prev->sa_handler != SIG_IGN && prev->sa_handler != SIG_DFL) {
      void (*fn)(int, siginfo_t*, void*) = prev->sa_sigaction;
      if (fn && fn != zr_posix_sigwinch_handler) {
        atomic_store_explicit(&g_posix_prev_sa_sigaction, fn, memory_order_relaxed);
        atomic_store_explicit(&g_posix_prev_handler_kind, 2, memory_order_release);
      }
    }
    return;
  }

  void (*fn)(int) = prev->sa_handler;
  if (fn && fn != SIG_IGN && fn != SIG_DFL) {
    atomic_store_explicit(&g_posix_prev_sa_handler, fn, memory_order_relaxed);
    atomic_store_explicit(&g_posix_prev_handler_kind, 1, memory_order_release);
  }
}

static void zr_posix_sigwinch_clear_previous(void) {
  atomic_store_explicit(&g_posix_prev_handler_kind, 0, memory_order_release);
  atomic_store_explicit(&g_posix_prev_sa_handler, NULL, memory_order_relaxed);
  atomic_store_explicit(&g_posix_prev_sa_sigaction, NULL, memory_order_relaxed);
}

static void zr_posix_sigwinch_handler(int signo, siginfo_t* info, void* ucontext) {
  int saved_errno = errno;
  const uint8_t b = 0u;
  const bool force_overflow = atomic_load_explicit(&g_posix_test_force_sigwinch_overflow, memory_order_acquire) != 0;
  for (uint32_t i = 0u; i < ZR_POSIX_SIGWINCH_MAX_WAKE_FDS; i++) {
    const int encoded = atomic_load_explicit(&g_posix_wake_fd_slots[i], memory_order_acquire);
    if (encoded == 0) {
      continue;
    }
    if (force_overflow) {
      atomic_store_explicit(&g_posix_wake_overflow_slots[i], 1, memory_order_release);
      continue;
    }
    const int wake_fd = encoded - 1;
    for (;;) {
      ssize_t n = write(wake_fd, &b, 1u);
      if (n == 1) {
        break;
      }
      if (n < 0 && errno == EINTR) {
        continue;
      }
      if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
        /*
          Preserve one wake when the self-pipe is saturated.

          Why: A resize signal can race with a full wake pipe. Without this
          overflow marker, draining the pipe could drop the wake edge and allow
          a later wait to block indefinitely.
        */
        atomic_store_explicit(&g_posix_wake_overflow_slots[i], 1, memory_order_release);
      }
      break;
    }
  }
  zr_posix_sigwinch_chain_previous(signo, info, ucontext);
  errno = saved_errno;
}

static zr_result_t zr_posix_sigwinch_global_acquire(void) {
  zr_result_t result = ZR_OK;
  zr_posix_sigwinch_ctl_lock_acquire();

  if (g_posix_sigwinch_refcount == 0) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = zr_posix_sigwinch_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_SIGINFO;

    struct sigaction prev;
    memset(&prev, 0, sizeof(prev));
    if (sigaction(SIGWINCH, &sa, &prev) != 0) {
      result = ZR_ERR_PLATFORM;
      goto done;
    }

    g_posix_sigwinch_prev = prev;
    g_posix_sigwinch_prev_valid = true;
    zr_posix_sigwinch_publish_previous(&prev);
  }

  g_posix_sigwinch_refcount++;

done:
  zr_posix_sigwinch_ctl_lock_release();
  return result;
}

static void zr_posix_sigwinch_global_release(void) {
  zr_posix_sigwinch_ctl_lock_acquire();

  if (g_posix_sigwinch_refcount > 0) {
    g_posix_sigwinch_refcount--;
  }
  if (g_posix_sigwinch_refcount == 0 && g_posix_sigwinch_prev_valid) {
    (void)sigaction(SIGWINCH, &g_posix_sigwinch_prev, NULL);
    g_posix_sigwinch_prev_valid = false;
    zr_posix_sigwinch_clear_previous();
  }

  zr_posix_sigwinch_ctl_lock_release();
}

static zr_result_t zr_posix_set_fd_flag(int fd, int flag, bool enabled) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags < 0) {
    return ZR_ERR_PLATFORM;
  }
  int desired = enabled ? (flags | flag) : (flags & ~flag);
  if (desired == flags) {
    return ZR_OK;
  }
  if (fcntl(fd, F_SETFL, desired) != 0) {
    return ZR_ERR_PLATFORM;
  }
  return ZR_OK;
}

static zr_result_t zr_posix_set_fd_cloexec(int fd) {
  int flags = fcntl(fd, F_GETFD, 0);
  if (flags < 0) {
    return ZR_ERR_PLATFORM;
  }
  if ((flags & FD_CLOEXEC) != 0) {
    return ZR_OK;
  }
  if (fcntl(fd, F_SETFD, flags | FD_CLOEXEC) != 0) {
    return ZR_ERR_PLATFORM;
  }
  return ZR_OK;
}

/* Create a non-blocking self-pipe pair for cross-thread wake signaling. */
static zr_result_t zr_posix_make_self_pipe(int* out_read_fd, int* out_write_fd) {
  if (!out_read_fd || !out_write_fd) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_read_fd = -1;
  *out_write_fd = -1;

  int fds[2] = {-1, -1};
  if (pipe(fds) != 0) {
    return ZR_ERR_PLATFORM;
  }
  if (zr_posix_set_fd_cloexec(fds[0]) != ZR_OK || zr_posix_set_fd_cloexec(fds[1]) != ZR_OK) {
    (void)close(fds[0]);
    (void)close(fds[1]);
    return ZR_ERR_PLATFORM;
  }
  if (zr_posix_set_fd_flag(fds[0], O_NONBLOCK, true) != ZR_OK ||
      zr_posix_set_fd_flag(fds[1], O_NONBLOCK, true) != ZR_OK) {
    (void)close(fds[0]);
    (void)close(fds[1]);
    return ZR_ERR_PLATFORM;
  }

  *out_read_fd = fds[0];
  *out_write_fd = fds[1];
  return ZR_OK;
}

static void zr_posix_drain_fd_best_effort(int fd) {
  uint8_t buf[256];
  for (;;) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n > 0) {
      continue;
    }
    if (n == 0) {
      return;
    }
    if (errno == EINTR) {
      continue;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      return;
    }
    return;
  }
}

static zr_result_t zr_posix_wait_writable(int fd) {
  struct pollfd pfd;
  pfd.fd = fd;
  pfd.events = POLLOUT;
  pfd.revents = 0;

  for (;;) {
    int rc = poll(&pfd, 1u, -1);
    if (rc > 0) {
      if ((pfd.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
        return ZR_ERR_PLATFORM;
      }
      return ZR_OK;
    }
    if (rc == 0) {
      continue;
    }
    if (errno == EINTR) {
      continue;
    }
    return ZR_ERR_PLATFORM;
  }
}

static uint64_t zr_posix_now_ms_monotonic_best_effort(void) {
  struct timespec ts;
  memset(&ts, 0, sizeof(ts));
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
    return 0u;
  }
  const uint64_t s = (uint64_t)ts.tv_sec;
  const uint64_t ns = (uint64_t)ts.tv_nsec;
  return (s * 1000u) + (ns / 1000000u);
}

static zr_result_t zr_posix_wait_writable_timeout(int fd, int32_t timeout_ms) {
  if (timeout_ms < 0) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  struct pollfd pfd;
  pfd.fd = fd;
  pfd.events = POLLOUT;
  pfd.revents = 0;

  const uint64_t start_ms = zr_posix_now_ms_monotonic_best_effort();
  int32_t remaining = timeout_ms;

  for (;;) {
    int rc = poll(&pfd, 1u, remaining);
    if (rc > 0) {
      if ((pfd.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
        return ZR_ERR_PLATFORM;
      }
      return ((pfd.revents & POLLOUT) != 0) ? ZR_OK : ZR_ERR_PLATFORM;
    }
    if (rc == 0) {
      return ZR_ERR_LIMIT;
    }
    if (errno == EINTR) {
      if (timeout_ms == 0) {
        return ZR_ERR_LIMIT;
      }
      const uint64_t now_ms = zr_posix_now_ms_monotonic_best_effort();
      if (start_ms != 0u && now_ms >= start_ms) {
        const uint64_t elapsed = now_ms - start_ms;
        if (elapsed >= (uint64_t)timeout_ms) {
          return ZR_ERR_LIMIT;
        }
        remaining = (int32_t)((uint64_t)timeout_ms - elapsed);
      }
      continue;
    }
    return ZR_ERR_PLATFORM;
  }
}

static zr_result_t zr_posix_sigpipe_pending(bool* out_pending) {
  if (!out_pending) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  sigset_t pending;
  if (sigpending(&pending) != 0) {
    return ZR_ERR_PLATFORM;
  }
  const int member = sigismember(&pending, SIGPIPE);
  if (member < 0) {
    return ZR_ERR_PLATFORM;
  }
  *out_pending = (member == 1);
  return ZR_OK;
}

static zr_result_t zr_posix_sigpipe_consume_if_pending(const sigset_t* sigpipe_set) {
  if (!sigpipe_set) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  bool pending = false;
  zr_result_t pending_rc = zr_posix_sigpipe_pending(&pending);
  if (pending_rc != ZR_OK) {
    return pending_rc;
  }
  if (!pending) {
    return ZR_OK;
  }

  sigset_t wait_set = *sigpipe_set;
  int caught_signal = 0;
  if (sigwait(&wait_set, &caught_signal) != 0 || caught_signal != SIGPIPE) {
    return ZR_ERR_PLATFORM;
  }
  return ZR_OK;
}

/*
  Perform one write() while suppressing thread-delivered SIGPIPE.

  Why: Writing to a closed pipe/socket may raise SIGPIPE with default process
  termination. The platform contract requires deterministic error returns
  (ZR_ERR_PLATFORM) instead of process termination.
*/
static zr_result_t zr_posix_write_once_no_sigpipe(int fd, const uint8_t* bytes, size_t len, ssize_t* out_n,
                                                  int* out_errno) {
  if (!bytes || !out_n || !out_errno) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  *out_n = -1;
  *out_errno = 0;

  sigset_t sigpipe_set;
  sigset_t old_mask;
  if (sigemptyset(&sigpipe_set) != 0 || sigaddset(&sigpipe_set, SIGPIPE) != 0) {
    return ZR_ERR_PLATFORM;
  }
  if (sigprocmask(SIG_BLOCK, &sigpipe_set, &old_mask) != 0) {
    return ZR_ERR_PLATFORM;
  }

  zr_result_t result = ZR_OK;
  int saved_errno = errno;
  bool sigpipe_pending_before = false;

  zr_result_t pending_rc = zr_posix_sigpipe_pending(&sigpipe_pending_before);
  if (pending_rc != ZR_OK) {
    result = pending_rc;
    goto done;
  }

  *out_n = write(fd, bytes, len);
  if (*out_n < 0) {
    *out_errno = errno;
    saved_errno = *out_errno;
  }
  if (*out_n < 0 && *out_errno == EPIPE && !sigpipe_pending_before) {
    zr_result_t consume_rc = zr_posix_sigpipe_consume_if_pending(&sigpipe_set);
    if (consume_rc != ZR_OK) {
      result = consume_rc;
      goto done;
    }
  }

done:
  if (sigprocmask(SIG_SETMASK, &old_mask, NULL) != 0) {
    result = ZR_ERR_PLATFORM;
  }
  errno = saved_errno;
  return result;
}

/* Write all bytes to fd, retrying on EINTR; returns error on partial write failure. */
static zr_result_t zr_posix_write_all(int fd, const uint8_t* bytes, int32_t len) {
  if (len < 0) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (len == 0) {
    return ZR_OK;
  }
  if (!bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  int32_t written = 0;
  while (written < len) {
    ssize_t n = -1;
    int write_errno = 0;
    zr_result_t write_rc =
        zr_posix_write_once_no_sigpipe(fd, bytes + (size_t)written, (size_t)(len - written), &n, &write_errno);
    if (write_rc != ZR_OK) {
      return ZR_ERR_PLATFORM;
    }

    if (n > 0) {
      written += (int32_t)n;
      continue;
    }
    if (n < 0 && (write_errno == EAGAIN || write_errno == EWOULDBLOCK)) {
      /*
        Terminals are typically blocking, but stdout may be configured as
        non-blocking by a parent process or wrapper. Treat EAGAIN as a
        transient backpressure signal and wait until the fd is writable.
      */
      zr_result_t rc = zr_posix_wait_writable(fd);
      if (rc != ZR_OK) {
        return rc;
      }
      continue;
    }
    if (n < 0 && write_errno == EINTR) {
      continue;
    }
    return ZR_ERR_PLATFORM;
  }

  return ZR_OK;
}

zr_result_t plat_wait_output_writable(plat_t* plat, int32_t timeout_ms) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_posix_wait_writable_timeout(plat->stdout_fd, timeout_ms);
}

static zr_result_t zr_posix_write_cstr(int fd, const char* s) {
  if (!s) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  size_t n = strlen(s);
  if (n > (size_t)INT32_MAX) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_posix_write_all(fd, (const uint8_t*)s, (int32_t)n);
}

static void zr_posix_emit_enter_sequences(plat_t* plat) {
  /*
    Locked ordering for enter:
      ?1049h, ?25l, ?7h, ?2004h, ?1004h, ?1000h?1002h?1003h?1006h (when enabled by config/caps)
  */
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1049h");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?25l");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?7h");

  if (plat->cfg.enable_bracketed_paste && plat->caps.supports_bracketed_paste) {
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?2004h");
  }
  if (plat->cfg.enable_focus_events && plat->caps.supports_focus_events) {
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1004h");
  }
  if (plat->cfg.enable_mouse && plat->caps.supports_mouse) {
    /*
      Mouse tracking:
        - ?1000h: report button press/release
        - ?1002h: report drag motion
        - ?1003h: report any motion (hover)
        - ?1006h: SGR encoding (needed for >223 coords and modern terminals)
    */
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h");
  }
}

static void zr_posix_emit_leave_sequences(plat_t* plat) {
  /*
    Best-effort restore on leave:
      - disable mouse / focus / bracketed paste
      - reset scroll region + SGR state
      - show cursor
      - leave alt screen
      - wrap policy: leave wrap enabled
  */
  if (plat->cfg.enable_mouse && plat->caps.supports_mouse) {
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l");
  }
  if (plat->cfg.enable_focus_events && plat->caps.supports_focus_events) {
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1004l");
  }
  if (plat->cfg.enable_bracketed_paste && plat->caps.supports_bracketed_paste) {
    (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?2004l");
  }

  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[r");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[0m");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?7h");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?25h");
  (void)zr_posix_write_cstr(plat->stdout_fd, "\x1b[?1049l");
}

static void zr_posix_set_caps_from_cfg(plat_t* plat, const plat_config_t* cfg) {
  if (!plat || !cfg) {
    return;
  }
  const plat_color_mode_t detected_color = zr_posix_detect_color_mode();
  plat->caps.color_mode = zr_posix_color_mode_clamp(cfg->requested_color_mode, detected_color);
  plat->caps.supports_mouse = zr_posix_detect_mouse_tracking();
  plat->caps.supports_bracketed_paste = zr_posix_detect_bracketed_paste();
  plat->caps.supports_focus_events = zr_posix_detect_focus_events();
  plat->caps.supports_osc52 = zr_posix_detect_osc52();
  plat->caps.supports_sync_update = zr_posix_detect_sync_update();
  plat->caps.supports_scroll_region = zr_posix_detect_scroll_region();
  plat->caps.supports_cursor_shape = zr_posix_detect_cursor_shape();
  plat->caps.supports_output_wait_writable = 1u;
  plat->caps.sgr_attrs_supported = zr_posix_detect_sgr_attrs_supported();

  /*
    Manual boolean capability overrides for non-standard terminals and CI harnesses.

    Values: 1/0, true/false, yes/no, on/off.
  */
  zr_posix_cap_override("ZIREAEL_CAP_MOUSE", &plat->caps.supports_mouse);
  zr_posix_cap_override("ZIREAEL_CAP_BRACKETED_PASTE", &plat->caps.supports_bracketed_paste);
  zr_posix_cap_override("ZIREAEL_CAP_OSC52", &plat->caps.supports_osc52);
  zr_posix_cap_override("ZIREAEL_CAP_SYNC_UPDATE", &plat->caps.supports_sync_update);
  zr_posix_cap_override("ZIREAEL_CAP_SCROLL_REGION", &plat->caps.supports_scroll_region);
  zr_posix_cap_override("ZIREAEL_CAP_CURSOR_SHAPE", &plat->caps.supports_cursor_shape);
  zr_posix_cap_override("ZIREAEL_CAP_FOCUS_EVENTS", &plat->caps.supports_focus_events);

  /* Optional attr-mask override (decimal or 0x... hex). */
  zr_posix_cap_u32_override("ZIREAEL_CAP_SGR_ATTRS", &plat->caps.sgr_attrs_supported);
  zr_posix_cap_u32_override("ZIREAEL_CAP_SGR_ATTRS_MASK", &plat->caps.sgr_attrs_supported);
  plat->caps.sgr_attrs_supported &= ZR_STYLE_ATTR_ALL_MASK;

  plat->caps._pad0[0] = 0u;
  plat->caps._pad0[1] = 0u;
  plat->caps._pad0[2] = 0u;
}

static void zr_posix_create_cleanup(plat_t* plat) {
  if (!plat) {
    return;
  }

  if (plat->wake_read_fd >= 0) {
    (void)close(plat->wake_read_fd);
    plat->wake_read_fd = -1;
  }
  if (plat->wake_write_fd >= 0) {
    (void)close(plat->wake_write_fd);
    plat->wake_write_fd = -1;
  }
  if (plat->tty_fd_owned >= 0) {
    (void)close(plat->tty_fd_owned);
    plat->tty_fd_owned = -1;
  }
}

static zr_result_t zr_posix_create_bind_stdio_or_tty(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (isatty(plat->stdin_fd) != 0 && isatty(plat->stdout_fd) != 0) {
    plat->explicit_pipe_mode = false;
    return ZR_OK;
  }

  if (zr_posix_pipe_mode_enabled()) {
    /*
      Explicit non-TTY mode: keep stdio as-is and avoid /dev/tty fallback.

      Why: Some wrappers intentionally run through pipes/redirected stdio and
      still need deterministic engine creation and polling behavior.
    */
    plat->explicit_pipe_mode = true;
    return ZR_OK;
  }

  /*
    Some launchers start with stdio detached from the controlling terminal.
    Fall back to /dev/tty so termios/ioctl still target the active tty.
  */
  int fd = open("/dev/tty", O_RDWR | O_NOCTTY);
  if (fd < 0) {
    return ZR_ERR_PLATFORM;
  }
  (void)zr_posix_set_fd_cloexec(fd);
  plat->explicit_pipe_mode = false;
  plat->tty_fd_owned = fd;
  plat->stdin_fd = fd;
  plat->stdout_fd = fd;
  return ZR_OK;
}

static zr_result_t zr_posix_install_sigwinch(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  int slot_index = -1;
  if (!zr_posix_wake_slot_register_fd(plat->wake_write_fd, &slot_index)) {
    return ZR_ERR_PLATFORM;
  }
  plat->wake_slot_index = slot_index;

  zr_result_t r = zr_posix_sigwinch_global_acquire();
  if (r != ZR_OK) {
    zr_posix_wake_slot_unregister_fd(plat->wake_write_fd, plat->wake_slot_index);
    plat->wake_slot_index = -1;
    return r;
  }

  plat->sigwinch_registered = true;
  return ZR_OK;
}

/* Create POSIX platform handle with self-pipe wake and SIGWINCH handler. */
zr_result_t zr_plat_posix_create(plat_t** out_plat, const plat_config_t* cfg) {
  if (!out_plat || !cfg) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_plat = NULL;

  plat_t* plat = (plat_t*)calloc(1u, sizeof(*plat));
  if (!plat) {
    return ZR_ERR_OOM;
  }

  plat->cfg = *cfg;
  plat->stdin_fd = STDIN_FILENO;
  plat->stdout_fd = STDOUT_FILENO;
  plat->tty_fd_owned = -1;
  plat->wake_read_fd = -1;
  plat->wake_write_fd = -1;
  plat->wake_slot_index = -1;
  plat->explicit_pipe_mode = false;

  zr_result_t r = zr_posix_create_bind_stdio_or_tty(plat);
  if (r != ZR_OK) {
    zr_posix_create_cleanup(plat);
    free(plat);
    return r;
  }

  zr_posix_set_caps_from_cfg(plat, cfg);

  r = zr_posix_make_self_pipe(&plat->wake_read_fd, &plat->wake_write_fd);
  if (r != ZR_OK) {
    zr_posix_create_cleanup(plat);
    free(plat);
    return r;
  }
  r = zr_posix_install_sigwinch(plat);
  if (r != ZR_OK) {
    zr_posix_create_cleanup(plat);
    free(plat);
    return r;
  }

  *out_plat = plat;
  return ZR_OK;
}

void plat_destroy(plat_t* plat) {
  if (!plat) {
    return;
  }

  (void)plat_leave_raw(plat);

  if (plat->sigwinch_registered) {
    zr_posix_wake_slot_unregister_fd(plat->wake_write_fd, plat->wake_slot_index);
    plat->wake_slot_index = -1;
    zr_posix_sigwinch_global_release();
    plat->sigwinch_registered = false;
  }

  if (plat->wake_read_fd >= 0) {
    (void)close(plat->wake_read_fd);
    plat->wake_read_fd = -1;
  }
  if (plat->wake_write_fd >= 0) {
    (void)close(plat->wake_write_fd);
    plat->wake_write_fd = -1;
  }

  if (plat->tty_fd_owned >= 0) {
    (void)close(plat->tty_fd_owned);
    plat->tty_fd_owned = -1;
  }

  free(plat);
}

/* Enter raw terminal mode: disable echo/canonical, enable alt screen and mouse. */
zr_result_t plat_enter_raw(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (plat->raw_active) {
    return ZR_OK;
  }
  if (plat->explicit_pipe_mode) {
    plat->raw_active = true;
    return ZR_OK;
  }

  if (!plat->termios_valid) {
    if (tcgetattr(plat->stdin_fd, &plat->termios_saved) != 0) {
      return ZR_ERR_PLATFORM;
    }
    plat->termios_valid = true;
  }
  if (!plat->stdin_flags_valid) {
    int flags = fcntl(plat->stdin_fd, F_GETFL, 0);
    if (flags < 0) {
      return ZR_ERR_PLATFORM;
    }
    plat->stdin_flags_saved = flags;
    plat->stdin_flags_valid = true;
  }

  struct termios raw = plat->termios_saved;
  raw.c_iflag &= (tcflag_t) ~(BRKINT | ICRNL | INPCK | ISTRIP | IXON);
  raw.c_oflag &= (tcflag_t) ~(OPOST);
  raw.c_cflag |= (tcflag_t)(CS8);
  raw.c_lflag &= (tcflag_t) ~(ECHO | ICANON | IEXTEN | ISIG);
  raw.c_cc[VMIN] = 0;
  raw.c_cc[VTIME] = 0;

  if (tcsetattr(plat->stdin_fd, TCSANOW, &raw) != 0) {
    return ZR_ERR_PLATFORM;
  }

  if (zr_posix_set_fd_flag(plat->stdin_fd, O_NONBLOCK, true) != ZR_OK) {
    (void)tcsetattr(plat->stdin_fd, TCSANOW, &plat->termios_saved);
    return ZR_ERR_PLATFORM;
  }

  zr_posix_emit_enter_sequences(plat);
  plat->raw_active = true;
  return ZR_OK;
}

/* Leave raw mode: restore saved termios, leave alt screen, show cursor. Idempotent. */
zr_result_t plat_leave_raw(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (plat->explicit_pipe_mode) {
    plat->raw_active = false;
    return ZR_OK;
  }

  /*
    Idempotent + best-effort:
      - Attempt to restore the terminal even if we were never marked active.
      - Never block indefinitely.
  */
  if (plat->raw_active) {
    zr_posix_emit_leave_sequences(plat);
  }

  if (plat->termios_valid) {
    (void)tcsetattr(plat->stdin_fd, TCSANOW, &plat->termios_saved);
  }
  if (plat->stdin_flags_valid) {
    (void)fcntl(plat->stdin_fd, F_SETFL, plat->stdin_flags_saved);
  }

  plat->raw_active = false;
  return ZR_OK;
}

zr_result_t plat_get_size(plat_t* plat, plat_size_t* out_size) {
  if (!plat || !out_size) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (plat->explicit_pipe_mode) {
    out_size->cols = ZR_POSIX_PIPE_MODE_DEFAULT_COLS;
    out_size->rows = ZR_POSIX_PIPE_MODE_DEFAULT_ROWS;
    return ZR_OK;
  }

  struct winsize ws;
  memset(&ws, 0, sizeof(ws));
  if (ioctl(plat->stdout_fd, TIOCGWINSZ, &ws) != 0) {
    out_size->cols = 0u;
    out_size->rows = 0u;
    return ZR_ERR_PLATFORM;
  }

  out_size->cols = (uint32_t)ws.ws_col;
  out_size->rows = (uint32_t)ws.ws_row;
  return ZR_OK;
}

zr_result_t plat_get_caps(plat_t* plat, plat_caps_t* out_caps) {
  if (!plat || !out_caps) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_caps = plat->caps;
  return ZR_OK;
}

/* Non-blocking read from stdin; returns bytes read, 0 if nothing available, or error. */
int32_t plat_read_input(plat_t* plat, uint8_t* out_buf, int32_t out_cap) {
  if (!plat) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_cap < 0) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_cap == 0) {
    return 0;
  }
  if (!out_buf) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }

  for (;;) {
    ssize_t n = read(plat->stdin_fd, out_buf, (size_t)out_cap);
    if (n > 0) {
      if (n > (ssize_t)INT32_MAX) {
        return (int32_t)ZR_ERR_PLATFORM;
      }
      return (int32_t)n;
    }
    if (n == 0) {
      return 0;
    }
    if (errno == EINTR) {
      continue;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      return 0;
    }
    return (int32_t)ZR_ERR_PLATFORM;
  }
}

zr_result_t plat_write_output(plat_t* plat, const uint8_t* bytes, int32_t len) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_posix_write_all(plat->stdout_fd, bytes, len);
}

/* Wait for input or wake signal; returns 1 if ready, 0 on timeout, or error code. */
int32_t plat_wait(plat_t* plat, int32_t timeout_ms) {
  if (!plat) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }
  if (timeout_ms < 0) {
    timeout_ms = -1;
  }

  uint64_t deadline_ms = 0ull;
  if (timeout_ms >= 0) {
    deadline_ms = plat_now_ms() + (uint64_t)timeout_ms;
  }

  struct pollfd fds[2];
  fds[0].fd = plat->stdin_fd;
  fds[0].events = POLLIN;
  fds[0].revents = 0;
  fds[1].fd = plat->wake_read_fd;
  fds[1].events = POLLIN;
  fds[1].revents = 0;

  for (;;) {
    if (timeout_ms != 0 && zr_posix_wake_slot_consume_overflow(plat)) {
      return 1;
    }

    int poll_timeout = -1;
    if (timeout_ms >= 0) {
      uint64_t now_ms = plat_now_ms();
      uint64_t remaining = (now_ms >= deadline_ms) ? 0ull : (deadline_ms - now_ms);
      poll_timeout = remaining > (uint64_t)INT_MAX ? INT_MAX : (int)remaining;
    }

    fds[0].revents = 0;
    fds[1].revents = 0;
    int rc = poll(fds, 2u, poll_timeout);
    if (rc == 0) {
      if (zr_posix_wake_slot_consume_overflow(plat)) {
        return 1;
      }
      return 0;
    }
    if (rc < 0) {
      if (errno == EINTR) {
        continue;
      }
      return (int32_t)ZR_ERR_PLATFORM;
    }

    if ((fds[1].revents & POLLIN) != 0) {
      zr_posix_drain_fd_best_effort(plat->wake_read_fd);
      return 1;
    }
    if ((fds[0].revents & POLLIN) != 0) {
      return 1;
    }

    if ((fds[0].revents & (POLLERR | POLLHUP | POLLNVAL)) != 0 ||
        (fds[1].revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
      return (int32_t)ZR_ERR_PLATFORM;
    }
  }
}

/* Wake a blocked plat_wait call from another thread by writing to the self-pipe. */
zr_result_t plat_wake(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  const uint8_t b = 0u;
  for (;;) {
    ssize_t n = write(plat->wake_write_fd, &b, 1u);
    if (n == 1) {
      return ZR_OK;
    }
    if (n < 0 && errno == EINTR) {
      continue;
    }
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      /* Pipe already contains a wake byte; that's sufficient. */
      return ZR_OK;
    }
    return ZR_ERR_PLATFORM;
  }
}

uint64_t plat_now_ms(void) {
#if defined(CLOCK_MONOTONIC)
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
    return 0ull;
  }
  uint64_t ms = (uint64_t)ts.tv_sec * 1000ull;
  ms += (uint64_t)ts.tv_nsec / 1000000ull;
  return ms;
#else
  return 0ull;
#endif
}
