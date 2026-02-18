/*
  src/platform/win32/zr_plat_win32.c — Win32 platform backend (console modes + VT + wake event).

  Why: Implements the OS-facing platform boundary on Windows:
    - VT output enable (required) and VT input enable (required, v1)
    - raw-mode enter/leave VT sequences (byte-for-byte locked ordering)
    - wakeable wait (STDIN handle + backend-owned wake event)
    - monotonic time via QPC
*/

#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

#include "platform/zr_platform.h"

#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* --- VT sequences (locked) --- */
static const uint8_t ZR_WIN32_SEQ_ALT_SCREEN_ENTER[] = "\x1b[?1049h";
static const uint8_t ZR_WIN32_SEQ_ALT_SCREEN_LEAVE[] = "\x1b[?1049l";
static const uint8_t ZR_WIN32_SEQ_CURSOR_HIDE[] = "\x1b[?25l";
static const uint8_t ZR_WIN32_SEQ_CURSOR_SHOW[] = "\x1b[?25h";
static const uint8_t ZR_WIN32_SEQ_WRAP_ENABLE[] = "\x1b[?7h";
static const uint8_t ZR_WIN32_SEQ_SCROLL_REGION_RESET[] = "\x1b[r";
static const uint8_t ZR_WIN32_SEQ_SGR_RESET[] = "\x1b[0m";
static const uint8_t ZR_WIN32_SEQ_BRACKETED_PASTE_ENABLE[] = "\x1b[?2004h";
static const uint8_t ZR_WIN32_SEQ_BRACKETED_PASTE_DISABLE[] = "\x1b[?2004l";
static const uint8_t ZR_WIN32_SEQ_FOCUS_ENABLE[] = "\x1b[?1004h";
static const uint8_t ZR_WIN32_SEQ_FOCUS_DISABLE[] = "\x1b[?1004l";
/*
  Mouse tracking sequences (locked, parity with POSIX backend):
    - ?1000h: report button press/release
    - ?1002h: report drag motion
    - ?1003h: report any motion (hover)
    - ?1006h: SGR encoding (needed for >223 coords and modern terminals)
*/
static const uint8_t ZR_WIN32_SEQ_MOUSE_ENABLE[] = "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h";
static const uint8_t ZR_WIN32_SEQ_MOUSE_DISABLE[] = "\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l";
static const uint32_t ZR_WIN32_UTF16_HIGH_SURROGATE_MIN = 0xD800u;
static const uint32_t ZR_WIN32_UTF16_HIGH_SURROGATE_MAX = 0xDBFFu;
static const uint32_t ZR_WIN32_UTF16_LOW_SURROGATE_MIN = 0xDC00u;
static const uint32_t ZR_WIN32_UTF16_LOW_SURROGATE_MAX = 0xDFFFu;

enum {
  ZR_WIN32_MOD_SHIFT_BIT = 1u << 0u,
  ZR_WIN32_MOD_ALT_BIT = 1u << 1u,
  ZR_WIN32_MOD_CTRL_BIT = 1u << 2u,
  ZR_WIN32_MOD_META_BIT = 1u << 3u,
  ZR_STYLE_ATTR_BOLD = 1u << 0u,
  ZR_STYLE_ATTR_ITALIC = 1u << 1u,
  ZR_STYLE_ATTR_UNDERLINE = 1u << 2u,
  ZR_STYLE_ATTR_REVERSE = 1u << 3u,
  ZR_STYLE_ATTR_DIM = 1u << 4u,
  ZR_STYLE_ATTR_STRIKE = 1u << 5u,
  ZR_STYLE_ATTR_OVERLINE = 1u << 6u,
  ZR_STYLE_ATTR_BLINK = 1u << 7u,
  ZR_STYLE_ATTR_ALL_MASK = (1u << 8u) - 1u,
  ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED = 0u,
  ZR_WIN32_OUTPUT_WAIT_MODE_IMMEDIATE_READY = 1u,
  ZR_WIN32_OUTPUT_WAIT_MODE_WAIT_HANDLE = 2u,
};

zr_result_t zr_plat_win32_create(plat_t** out_plat, const plat_config_t* cfg);

struct plat_t {
  HANDLE h_in;
  HANDLE h_out;
  HANDLE h_wake_event;

  DWORD in_mode_orig;
  DWORD out_mode_orig;

  UINT in_cp_orig;
  UINT out_cp_orig;

  plat_size_t last_size;

  plat_config_t cfg;
  plat_caps_t caps;

  bool modes_valid;
  bool cp_valid;
  bool raw_active;
  bool has_pending_high_surrogate;
  uint16_t pending_high_surrogate;
  uint8_t output_wait_mode;
  uint8_t _pad[1];
};

static const char* zr_win32_getenv_nonempty(const char* key) {
  if (!key) {
    return NULL;
  }
  const char* v = getenv(key);
  if (!v || v[0] == '\0') {
    return NULL;
  }
  return v;
}

static bool zr_win32_env_bool_override(const char* key, uint8_t* out_value) {
  if (!key || !out_value) {
    return false;
  }

  const char* v = zr_win32_getenv_nonempty(key);
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

static void zr_win32_cap_override(const char* key, uint8_t* inout_cap) {
  uint8_t override_value = 0u;
  if (zr_win32_env_bool_override(key, &override_value)) {
    *inout_cap = override_value;
  }
}

static bool zr_win32_env_u32_override(const char* key, uint32_t* out_value) {
  if (!key || !out_value) {
    return false;
  }

  const char* v = zr_win32_getenv_nonempty(key);
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

static void zr_win32_cap_u32_override(const char* key, uint32_t* inout_cap) {
  uint32_t override_value = 0u;
  if (zr_win32_env_u32_override(key, &override_value)) {
    *inout_cap = override_value;
  }
}

static uint8_t zr_win32_ascii_tolower(uint8_t c) {
  if (c >= (uint8_t)'A' && c <= (uint8_t)'Z') {
    return (uint8_t)(c + ((uint8_t)'a' - (uint8_t)'A'));
  }
  return c;
}

static bool zr_win32_str_contains_ci(const char* s, const char* needle) {
  if (!s || !needle || needle[0] == '\0') {
    return false;
  }

  for (size_t i = 0u; s[i] != '\0'; i++) {
    size_t j = 0u;
    while (needle[j] != '\0' && s[i + j] != '\0' &&
           zr_win32_ascii_tolower((uint8_t)s[i + j]) == zr_win32_ascii_tolower((uint8_t)needle[j])) {
      j++;
    }
    if (needle[j] == '\0') {
      return true;
    }
  }
  return false;
}

static bool zr_win32_str_has_any_ci(const char* s, const char* const* needles, size_t count) {
  if (!s || !needles) {
    return false;
  }
  for (size_t i = 0u; i < count; i++) {
    if (needles[i] && zr_win32_str_contains_ci(s, needles[i])) {
      return true;
    }
  }
  return false;
}

static bool zr_win32_detect_modern_vt_host(void) {
  if (zr_win32_getenv_nonempty("WT_SESSION") || zr_win32_getenv_nonempty("KITTY_WINDOW_ID") ||
      zr_win32_getenv_nonempty("WEZTERM_PANE") || zr_win32_getenv_nonempty("WEZTERM_EXECUTABLE") ||
      zr_win32_getenv_nonempty("ANSICON")) {
    return true;
  }

  const char* conemu_ansi = zr_win32_getenv_nonempty("ConEmuANSI");
  if (conemu_ansi && (strcmp(conemu_ansi, "ON") == 0 || strcmp(conemu_ansi, "on") == 0)) {
    return true;
  }

  const char* term = zr_win32_getenv_nonempty("TERM");
  static const char* kRichTerms[] = {"xterm",     "screen", "tmux",    "kitty", "wezterm",
                                     "alacritty", "foot",   "ghostty", "rio"};
  if (zr_win32_str_has_any_ci(term, kRichTerms, sizeof(kRichTerms) / sizeof(kRichTerms[0]))) {
    return true;
  }

  const char* term_program = zr_win32_getenv_nonempty("TERM_PROGRAM");
  static const char* kPrograms[] = {"WezTerm", "vscode", "WarpTerminal"};
  return zr_win32_str_has_any_ci(term_program, kPrograms, sizeof(kPrograms) / sizeof(kPrograms[0]));
}

static uint8_t zr_win32_detect_focus_events(void) {
  return zr_win32_detect_modern_vt_host() ? 1u : 0u;
}

static uint32_t zr_win32_detect_sgr_attrs_supported(void) {
  uint32_t attrs = ZR_STYLE_ATTR_BOLD | ZR_STYLE_ATTR_UNDERLINE | ZR_STYLE_ATTR_REVERSE | ZR_STYLE_ATTR_DIM;
  if (zr_win32_detect_modern_vt_host()) {
    attrs |= ZR_STYLE_ATTR_ITALIC | ZR_STYLE_ATTR_STRIKE | ZR_STYLE_ATTR_OVERLINE | ZR_STYLE_ATTR_BLINK;
  }
  return attrs;
}

static plat_color_mode_t zr_win32_color_mode_clamp(plat_color_mode_t requested, plat_color_mode_t detected) {
  if (detected == PLAT_COLOR_MODE_UNKNOWN) {
    detected = PLAT_COLOR_MODE_16;
  }
  if (requested == PLAT_COLOR_MODE_UNKNOWN) {
    return detected;
  }
  return (requested < detected) ? requested : detected;
}

static uint8_t zr_win32_detect_sync_update(void) {
  if (zr_win32_getenv_nonempty("KITTY_WINDOW_ID")) {
    return 1u;
  }
  if (zr_win32_getenv_nonempty("WEZTERM_PANE") || zr_win32_getenv_nonempty("WEZTERM_EXECUTABLE")) {
    return 1u;
  }
  const char* term = zr_win32_getenv_nonempty("TERM");
  if (term && (strstr(term, "kitty") || strstr(term, "wezterm") || strstr(term, "rio"))) {
    return 1u;
  }
  return 0u;
}

static uint8_t zr_win32_detect_osc52(void) {
  if (zr_win32_getenv_nonempty("KITTY_WINDOW_ID")) {
    return 1u;
  }
  if (zr_win32_getenv_nonempty("WEZTERM_PANE") || zr_win32_getenv_nonempty("WEZTERM_EXECUTABLE")) {
    return 1u;
  }
  const char* term = zr_win32_getenv_nonempty("TERM");
  if (term && (strstr(term, "xterm") || strstr(term, "screen") || strstr(term, "tmux") || strstr(term, "kitty") ||
               strstr(term, "wezterm"))) {
    return 1u;
  }
  return 0u;
}

static void zr_win32_emit_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, const uint8_t* seq, size_t seq_len,
                                 WORD repeat) {
  if (!out_buf || !io_len || !seq) {
    return;
  }
  if (seq_len == 0u) {
    return;
  }
  if (repeat == 0u) {
    repeat = 1u;
  }
  for (WORD r = 0u; r < repeat; r++) {
    if (*io_len + seq_len > out_cap) {
      return;
    }
    memcpy(out_buf + *io_len, seq, seq_len);
    *io_len += seq_len;
  }
}

/* Emit decimal u32 into a local byte buffer. Returns 0 when out_cap is too small. */
static size_t zr_win32_emit_u32_dec(uint8_t* out, size_t out_cap, uint32_t v) {
  if (!out || out_cap == 0u) {
    return 0u;
  }

  uint8_t tmp[10];
  size_t n = 0u;
  do {
    tmp[n++] = (uint8_t)('0' + (v % 10u));
    v /= 10u;
  } while (v != 0u && n < sizeof(tmp));

  if (n > out_cap) {
    return 0u;
  }

  for (size_t i = 0u; i < n; i++) {
    out[i] = tmp[n - 1u - i];
  }
  return n;
}

/*
  Convert Win32 control-state flags into xterm-compatible modifier bits.

  Why: Core parser normalizes modifiers from CSI parameter values. The Windows
  backend translates console key records into CSI/SS3 bytes and should preserve
  modifier intent where representable.
*/
static uint32_t zr_win32_mod_bits_from_control_state(DWORD control_state) {
  uint32_t mods = 0u;

  if ((control_state & SHIFT_PRESSED) != 0u) {
    mods |= ZR_WIN32_MOD_SHIFT_BIT;
  }
  if ((control_state & (LEFT_ALT_PRESSED | RIGHT_ALT_PRESSED)) != 0u) {
    mods |= ZR_WIN32_MOD_ALT_BIT;
  }
  if ((control_state & (LEFT_CTRL_PRESSED | RIGHT_CTRL_PRESSED)) != 0u) {
    mods |= ZR_WIN32_MOD_CTRL_BIT;
  }
  return mods;
}

/* Map xterm modifier bits to CSI modifier parameter (1 + bits). */
static uint32_t zr_win32_csi_mod_param(uint32_t mods) {
  return 1u + mods;
}

/* Emit CSI key sequence with optional modifier parameter; repeat defaults to 1. */
static void zr_win32_emit_csi_final_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, uint8_t final_byte,
                                           uint32_t mods, WORD repeat) {
  if (!out_buf || !io_len) {
    return;
  }
  if (repeat == 0u) {
    repeat = 1u;
  }

  for (WORD i = 0u; i < repeat; i++) {
    if (mods == 0u) {
      const uint8_t seq[] = {0x1Bu, (uint8_t)'[', final_byte};
      zr_win32_emit_repeat(out_buf, out_cap, io_len, seq, sizeof(seq), 1u);
      continue;
    }

    uint8_t seq[24];
    size_t n = 0u;
    seq[n++] = 0x1Bu;
    seq[n++] = (uint8_t)'[';
    seq[n++] = (uint8_t)'1';
    seq[n++] = (uint8_t)';';

    const size_t m = zr_win32_emit_u32_dec(seq + n, sizeof(seq) - n, zr_win32_csi_mod_param(mods));
    if (m == 0u) {
      return;
    }
    n += m;
    if (n >= sizeof(seq)) {
      return;
    }
    seq[n++] = final_byte;

    zr_win32_emit_repeat(out_buf, out_cap, io_len, seq, n, 1u);
  }
}

/* Emit CSI "~" key sequence with optional modifier parameter; repeat defaults to 1. */
static void zr_win32_emit_csi_tilde_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, uint32_t first_param,
                                           uint32_t mods, WORD repeat) {
  if (!out_buf || !io_len) {
    return;
  }
  if (repeat == 0u) {
    repeat = 1u;
  }

  for (WORD i = 0u; i < repeat; i++) {
    uint8_t seq[32];
    size_t n = 0u;
    seq[n++] = 0x1Bu;
    seq[n++] = (uint8_t)'[';

    const size_t p1 = zr_win32_emit_u32_dec(seq + n, sizeof(seq) - n, first_param);
    if (p1 == 0u) {
      return;
    }
    n += p1;

    if (mods != 0u) {
      if (n >= sizeof(seq)) {
        return;
      }
      seq[n++] = (uint8_t)';';
      const size_t p2 = zr_win32_emit_u32_dec(seq + n, sizeof(seq) - n, zr_win32_csi_mod_param(mods));
      if (p2 == 0u) {
        return;
      }
      n += p2;
    }

    if (n >= sizeof(seq)) {
      return;
    }
    seq[n++] = (uint8_t)'~';
    zr_win32_emit_repeat(out_buf, out_cap, io_len, seq, n, 1u);
  }
}

/* Emit SS3 key sequence (ESC O <final>); repeat defaults to 1. */
static void zr_win32_emit_ss3_final_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, uint8_t final_byte,
                                           WORD repeat) {
  const uint8_t seq[] = {0x1Bu, (uint8_t)'O', final_byte};
  zr_win32_emit_repeat(out_buf, out_cap, io_len, seq, sizeof(seq), repeat);
}

static bool zr_win32_vk_to_csi_final(WORD vk, uint8_t* out_final) {
  if (!out_final) {
    return false;
  }
  switch (vk) {
  case VK_UP:
    *out_final = (uint8_t)'A';
    return true;
  case VK_DOWN:
    *out_final = (uint8_t)'B';
    return true;
  case VK_RIGHT:
    *out_final = (uint8_t)'C';
    return true;
  case VK_LEFT:
    *out_final = (uint8_t)'D';
    return true;
  case VK_HOME:
    *out_final = (uint8_t)'H';
    return true;
  case VK_END:
    *out_final = (uint8_t)'F';
    return true;
  default:
    return false;
  }
}

static bool zr_win32_vk_to_csi_tilde(WORD vk, uint32_t* out_first) {
  if (!out_first) {
    return false;
  }
  switch (vk) {
  case VK_INSERT:
    *out_first = 2u;
    return true;
  case VK_DELETE:
    *out_first = 3u;
    return true;
  case VK_PRIOR:
    *out_first = 5u;
    return true;
  case VK_NEXT:
    *out_first = 6u;
    return true;
  case VK_F5:
    *out_first = 15u;
    return true;
  case VK_F6:
    *out_first = 17u;
    return true;
  case VK_F7:
    *out_first = 18u;
    return true;
  case VK_F8:
    *out_first = 19u;
    return true;
  case VK_F9:
    *out_first = 20u;
    return true;
  case VK_F10:
    *out_first = 21u;
    return true;
  case VK_F11:
    *out_first = 23u;
    return true;
  case VK_F12:
    *out_first = 24u;
    return true;
  default:
    return false;
  }
}

static bool zr_win32_vk_to_ss3(WORD vk, uint8_t* out_final) {
  if (!out_final) {
    return false;
  }
  switch (vk) {
  case VK_F1:
    *out_final = (uint8_t)'P';
    return true;
  case VK_F2:
    *out_final = (uint8_t)'Q';
    return true;
  case VK_F3:
    *out_final = (uint8_t)'R';
    return true;
  case VK_F4:
    *out_final = (uint8_t)'S';
    return true;
  default:
    return false;
  }
}

static size_t zr_win32_encode_utf8_scalar(uint32_t scalar, uint8_t out[4]) {
  if (!out) {
    return 0u;
  }

  if (scalar > 0x10FFFFu || (scalar >= 0xD800u && scalar <= 0xDFFFu)) {
    scalar = 0xFFFDu;
  }

  if (scalar <= 0x7Fu) {
    out[0] = (uint8_t)scalar;
    return 1u;
  }
  if (scalar <= 0x7FFu) {
    out[0] = (uint8_t)(0xC0u | ((scalar >> 6u) & 0x1Fu));
    out[1] = (uint8_t)(0x80u | (scalar & 0x3Fu));
    return 2u;
  }
  if (scalar <= 0xFFFFu) {
    out[0] = (uint8_t)(0xE0u | ((scalar >> 12u) & 0x0Fu));
    out[1] = (uint8_t)(0x80u | ((scalar >> 6u) & 0x3Fu));
    out[2] = (uint8_t)(0x80u | (scalar & 0x3Fu));
    return 3u;
  }

  out[0] = (uint8_t)(0xF0u | ((scalar >> 18u) & 0x07u));
  out[1] = (uint8_t)(0x80u | ((scalar >> 12u) & 0x3Fu));
  out[2] = (uint8_t)(0x80u | ((scalar >> 6u) & 0x3Fu));
  out[3] = (uint8_t)(0x80u | (scalar & 0x3Fu));
  return 4u;
}

static bool zr_win32_is_high_surrogate(uint32_t scalar) {
  return scalar >= ZR_WIN32_UTF16_HIGH_SURROGATE_MIN && scalar <= ZR_WIN32_UTF16_HIGH_SURROGATE_MAX;
}

static bool zr_win32_is_low_surrogate(uint32_t scalar) {
  return scalar >= ZR_WIN32_UTF16_LOW_SURROGATE_MIN && scalar <= ZR_WIN32_UTF16_LOW_SURROGATE_MAX;
}

static uint32_t zr_win32_decode_surrogate_pair(uint32_t high, uint32_t low) {
  const uint32_t hi10 = high - ZR_WIN32_UTF16_HIGH_SURROGATE_MIN;
  const uint32_t lo10 = low - ZR_WIN32_UTF16_LOW_SURROGATE_MIN;
  return 0x10000u + (hi10 << 10u) + lo10;
}

static void zr_win32_emit_utf8_scalar_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, uint32_t scalar,
                                             WORD repeat) {
  uint8_t utf8[4];
  const size_t n = zr_win32_encode_utf8_scalar(scalar, utf8);
  zr_win32_emit_repeat(out_buf, out_cap, io_len, utf8, n, repeat);
}

/*
  Emit text scalar bytes with optional Alt-prefix behavior.

  Why: In VT terminals, Alt-modified text input is commonly represented as an
  ESC byte prefix before the UTF-8 payload. This keeps Win32 console input
  translation aligned with POSIX VT-style input streams.
*/
static void zr_win32_emit_text_scalar_repeat(uint8_t* out_buf, size_t out_cap, size_t* io_len, uint32_t scalar,
                                             WORD repeat, bool prefix_alt_escape) {
  if (!prefix_alt_escape) {
    zr_win32_emit_utf8_scalar_repeat(out_buf, out_cap, io_len, scalar, repeat);
    return;
  }

  if (repeat == 0u) {
    repeat = 1u;
  }
  const uint8_t esc = 0x1Bu;
  for (WORD i = 0u; i < repeat; i++) {
    zr_win32_emit_repeat(out_buf, out_cap, io_len, &esc, 1u, 1u);
    zr_win32_emit_utf8_scalar_repeat(out_buf, out_cap, io_len, scalar, 1u);
  }
}

static void zr_win32_flush_pending_high_surrogate(plat_t* plat, uint8_t* out_buf, size_t out_cap, size_t* io_len) {
  if (!plat || !plat->has_pending_high_surrogate) {
    return;
  }
  zr_win32_emit_utf8_scalar_repeat(out_buf, out_cap, io_len, 0xFFFDu, 1u);
  plat->has_pending_high_surrogate = false;
  plat->pending_high_surrogate = 0u;
}

static zr_result_t zr_win32_write_all(HANDLE h_out, const uint8_t* bytes, int32_t len) {
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
    DWORD chunk = (DWORD)(len - written);
    DWORD did_write = 0;
    BOOL ok = WriteFile(h_out, bytes + (size_t)written, chunk, &did_write, NULL);
    if (!ok) {
      return ZR_ERR_PLATFORM;
    }
    if (did_write == 0u) {
      return ZR_ERR_PLATFORM;
    }
    if (did_write > (DWORD)(len - written)) {
      return ZR_ERR_PLATFORM;
    }
    written += (int32_t)did_write;
  }

  return ZR_OK;
}

static zr_result_t zr_win32_wait_handle_signaled(HANDLE h, int32_t timeout_ms) {
  if (!h || h == INVALID_HANDLE_VALUE) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  DWORD timeout = INFINITE;
  if (timeout_ms >= 0) {
    timeout = (DWORD)timeout_ms;
  }

  const DWORD rc = WaitForSingleObject(h, timeout);
  if (rc == WAIT_OBJECT_0) {
    return ZR_OK;
  }
  if (rc == WAIT_TIMEOUT) {
    return ZR_ERR_LIMIT;
  }
  if (rc == WAIT_FAILED) {
    const DWORD err = GetLastError();
    if (err == ERROR_INVALID_HANDLE || err == ERROR_INVALID_FUNCTION || err == ERROR_NOT_SUPPORTED) {
      return ZR_ERR_UNSUPPORTED;
    }
  }
  return ZR_ERR_PLATFORM;
}

/* Pick a deterministic output-wait strategy for the current stdout handle type. */
static uint8_t zr_win32_detect_output_wait_mode(HANDLE h_out) {
  if (!h_out || h_out == INVALID_HANDLE_VALUE) {
    return ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED;
  }

  const DWORD file_type = GetFileType(h_out);
  if (file_type == FILE_TYPE_CHAR || file_type == FILE_TYPE_DISK) {
    return ZR_WIN32_OUTPUT_WAIT_MODE_IMMEDIATE_READY;
  }

  if (file_type == FILE_TYPE_PIPE) {
    const zr_result_t rc = zr_win32_wait_handle_signaled(h_out, 0);
    if (rc == ZR_OK || rc == ZR_ERR_LIMIT) {
      return ZR_WIN32_OUTPUT_WAIT_MODE_WAIT_HANDLE;
    }
    if (rc == ZR_ERR_UNSUPPORTED) {
      /*
        Some ConPTY pipe handles reject direct wait probes while output writes
        are still valid. Prefer deterministic immediate-ready parity over
        reporting unsupported in that case.
      */
      return ZR_WIN32_OUTPUT_WAIT_MODE_IMMEDIATE_READY;
    }
  }

  return ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED;
}

static uint8_t zr_win32_output_wait_cap_from_mode(uint8_t wait_mode) {
  return (wait_mode == ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED) ? 0u : 1u;
}

static zr_result_t zr_win32_write_cstr(HANDLE h_out, const uint8_t* s, size_t n_with_nul) {
  if (!s || n_with_nul == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (n_with_nul > (size_t)INT32_MAX + 1u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_win32_write_all(h_out, s, (int32_t)(n_with_nul - 1u));
}

static zr_result_t zr_win32_restore_modes_best_effort(plat_t* plat) {
  if (!plat || !plat->modes_valid) {
    return ZR_OK;
  }
  (void)SetConsoleMode(plat->h_in, plat->in_mode_orig);
  (void)SetConsoleMode(plat->h_out, plat->out_mode_orig);
  if (plat->cp_valid) {
    (void)SetConsoleCP(plat->in_cp_orig);
    (void)SetConsoleOutputCP(plat->out_cp_orig);
  }
  return ZR_OK;
}

/* Enable VT output/input per locked v1 rules; restores saved modes on failure. */
static zr_result_t zr_win32_enable_vt_or_fail(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* --- Save original modes --- */
  DWORD in_mode = 0u;
  DWORD out_mode = 0u;
  if (!GetConsoleMode(plat->h_in, &in_mode) || !GetConsoleMode(plat->h_out, &out_mode)) {
    return ZR_ERR_PLATFORM;
  }
  plat->in_mode_orig = in_mode;
  plat->out_mode_orig = out_mode;
  plat->modes_valid = true;

  /* --- Prefer UTF-8 console code pages for correct glyph rendering --- */
  plat->in_cp_orig = GetConsoleCP();
  plat->out_cp_orig = GetConsoleOutputCP();
  plat->cp_valid = (plat->in_cp_orig != 0u && plat->out_cp_orig != 0u);
  if (!SetConsoleCP(CP_UTF8) || !SetConsoleOutputCP(CP_UTF8)) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_UNSUPPORTED;
  }
  if (GetConsoleCP() != (UINT)CP_UTF8 || GetConsoleOutputCP() != (UINT)CP_UTF8) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_UNSUPPORTED;
  }

  /* --- Enable VT output (required) --- */
  DWORD out_mode_new = out_mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING;
  if (!SetConsoleMode(plat->h_out, out_mode_new)) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_PLATFORM;
  }
  DWORD out_mode_after = 0u;
  if (!GetConsoleMode(plat->h_out, &out_mode_after) || (out_mode_after & ENABLE_VIRTUAL_TERMINAL_PROCESSING) == 0u) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_PLATFORM;
  }

  /* --- Enable VT input (required; no legacy fallback in v1) --- */
  /*
    "Raw" input in practice means:
      - no cooked line buffering and no echo
      - no ctrl-c signal translation (engine parses bytes)
      - avoid QuickEdit mode (can freeze input on mouse selection)

    Note: we intentionally keep this logic deterministic and config-driven.
  */
  DWORD in_mode_base = in_mode | ENABLE_VIRTUAL_TERMINAL_INPUT;

  /*
    QuickEdit handling is best-effort: only toggle the bit when the console host
    already exposes EXTENDED_FLAGS behavior.
  */
  if ((in_mode & ENABLE_EXTENDED_FLAGS) != 0u) {
    in_mode_base &= ~((DWORD)ENABLE_QUICK_EDIT_MODE);
  }

  /*
    Some environments (notably certain ConPTY configurations) reject aggressive
    mode bit clearing. Try a strict raw-ish mode first; fall back to a minimal,
    VT-input-capable mode on failure. The fallback ladder must still disable
    line buffering; otherwise, input may not be delivered until Enter.
  */
  DWORD candidates[4];
  candidates[0] =
      in_mode_base & ~((DWORD)(ENABLE_ECHO_INPUT | ENABLE_LINE_INPUT | ENABLE_PROCESSED_INPUT | ENABLE_WINDOW_INPUT));
  candidates[1] = in_mode_base & ~((DWORD)(ENABLE_ECHO_INPUT | ENABLE_LINE_INPUT | ENABLE_WINDOW_INPUT));
  candidates[2] = in_mode_base & ~((DWORD)(ENABLE_ECHO_INPUT | ENABLE_LINE_INPUT));
  candidates[3] = in_mode_base;

  bool set_ok = false;
  for (size_t i = 0u; i < (sizeof(candidates) / sizeof(candidates[0])); i++) {
    if (SetConsoleMode(plat->h_in, candidates[i])) {
      set_ok = true;
      break;
    }
  }
  if (!set_ok) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_UNSUPPORTED;
  }
  DWORD in_mode_after = 0u;
  if (!GetConsoleMode(plat->h_in, &in_mode_after) || (in_mode_after & ENABLE_VIRTUAL_TERMINAL_INPUT) == 0u) {
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_UNSUPPORTED;
  }
  if ((in_mode_after & ENABLE_LINE_INPUT) != 0u) {
    /*
      Without disabling line input, ReadFile() may block until Enter and arrow
      keys won't arrive as VT sequences. Treat as unsupported so callers can
      surface a clear error.
    */
    (void)zr_win32_restore_modes_best_effort(plat);
    return ZR_ERR_UNSUPPORTED;
  }

  return ZR_OK;
}

static void zr_win32_emit_enter_sequences_best_effort(plat_t* plat) {
  /*
    Locked ordering for enter:
      ?1049h, ?25l, ?7h, ?2004h, ?1004h, ?1000h?1002h?1003h?1006h (when enabled by config/caps)
  */
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_ALT_SCREEN_ENTER, sizeof(ZR_WIN32_SEQ_ALT_SCREEN_ENTER));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_CURSOR_HIDE, sizeof(ZR_WIN32_SEQ_CURSOR_HIDE));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_WRAP_ENABLE, sizeof(ZR_WIN32_SEQ_WRAP_ENABLE));

  if (plat->cfg.enable_bracketed_paste && plat->caps.supports_bracketed_paste) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_BRACKETED_PASTE_ENABLE,
                              sizeof(ZR_WIN32_SEQ_BRACKETED_PASTE_ENABLE));
  }
  if (plat->cfg.enable_focus_events && plat->caps.supports_focus_events) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_FOCUS_ENABLE, sizeof(ZR_WIN32_SEQ_FOCUS_ENABLE));
  }
  if (plat->cfg.enable_mouse && plat->caps.supports_mouse) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_MOUSE_ENABLE, sizeof(ZR_WIN32_SEQ_MOUSE_ENABLE));
  }
}

static void zr_win32_emit_leave_sequences_best_effort(plat_t* plat) {
  /*
    Best-effort restore on leave:
      - disable mouse / focus / bracketed paste
      - reset scroll region + SGR state
      - show cursor
      - leave alt screen
      - wrap policy: leave wrap enabled
  */
  if (plat->cfg.enable_mouse && plat->caps.supports_mouse) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_MOUSE_DISABLE, sizeof(ZR_WIN32_SEQ_MOUSE_DISABLE));
  }
  if (plat->cfg.enable_focus_events && plat->caps.supports_focus_events) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_FOCUS_DISABLE, sizeof(ZR_WIN32_SEQ_FOCUS_DISABLE));
  }
  if (plat->cfg.enable_bracketed_paste && plat->caps.supports_bracketed_paste) {
    (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_BRACKETED_PASTE_DISABLE,
                              sizeof(ZR_WIN32_SEQ_BRACKETED_PASTE_DISABLE));
  }

  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_SCROLL_REGION_RESET, sizeof(ZR_WIN32_SEQ_SCROLL_REGION_RESET));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_SGR_RESET, sizeof(ZR_WIN32_SEQ_SGR_RESET));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_WRAP_ENABLE, sizeof(ZR_WIN32_SEQ_WRAP_ENABLE));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_CURSOR_SHOW, sizeof(ZR_WIN32_SEQ_CURSOR_SHOW));
  (void)zr_win32_write_cstr(plat->h_out, ZR_WIN32_SEQ_ALT_SCREEN_LEAVE, sizeof(ZR_WIN32_SEQ_ALT_SCREEN_LEAVE));
}

static bool zr_win32_query_size_best_effort(HANDLE h_out, plat_size_t* inout_last_size) {
  if (!inout_last_size) {
    return false;
  }

  CONSOLE_SCREEN_BUFFER_INFO csbi;
  memset(&csbi, 0, sizeof(csbi));
  if (!GetConsoleScreenBufferInfo(h_out, &csbi)) {
    return false;
  }

  int cols_i = (int)csbi.srWindow.Right - (int)csbi.srWindow.Left + 1;
  int rows_i = (int)csbi.srWindow.Bottom - (int)csbi.srWindow.Top + 1;
  if (cols_i <= 0 || rows_i <= 0) {
    return false;
  }

  inout_last_size->cols = (uint32_t)cols_i;
  inout_last_size->rows = (uint32_t)rows_i;
  return true;
}

/* Create Win32 platform handle with wake event and conservative default caps. */
zr_result_t zr_plat_win32_create(plat_t** out_plat, const plat_config_t* cfg) {
  if (!out_plat || !cfg) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_plat = NULL;

  plat_t* plat = (plat_t*)calloc(1u, sizeof(*plat));
  if (!plat) {
    return ZR_ERR_OOM;
  }

  plat->cfg = *cfg;
  plat->h_in = GetStdHandle(STD_INPUT_HANDLE);
  plat->h_out = GetStdHandle(STD_OUTPUT_HANDLE);
  plat->in_mode_orig = 0u;
  plat->out_mode_orig = 0u;
  plat->modes_valid = false;
  plat->raw_active = false;
  plat->has_pending_high_surrogate = false;
  plat->pending_high_surrogate = 0u;
  plat->output_wait_mode = ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED;
  plat->last_size.cols = 0u;
  plat->last_size.rows = 0u;

  if (!plat->h_in || plat->h_in == INVALID_HANDLE_VALUE || !plat->h_out || plat->h_out == INVALID_HANDLE_VALUE) {
    free(plat);
    return ZR_ERR_PLATFORM;
  }

  plat->h_wake_event = CreateEventW(NULL, FALSE, FALSE, NULL);
  if (!plat->h_wake_event) {
    free(plat);
    return ZR_ERR_PLATFORM;
  }

  /*
    v1 caps are conservative and deterministic: if the environment supports VT
    output/input (required on enter), these sequences are safe to emit.
  */
  plat->caps.color_mode = zr_win32_color_mode_clamp(cfg->requested_color_mode, PLAT_COLOR_MODE_RGB);
  plat->caps.supports_mouse = 1u;
  plat->caps.supports_bracketed_paste = 1u;
  plat->caps.supports_focus_events = zr_win32_detect_focus_events();
  plat->caps.supports_osc52 = zr_win32_detect_osc52();
  plat->caps.supports_sync_update = zr_win32_detect_sync_update();
  plat->caps.supports_scroll_region = 1u;
  plat->caps.supports_cursor_shape = 1u;
  plat->output_wait_mode = zr_win32_detect_output_wait_mode(plat->h_out);
  plat->caps.supports_output_wait_writable = zr_win32_output_wait_cap_from_mode(plat->output_wait_mode);
  plat->caps.sgr_attrs_supported = zr_win32_detect_sgr_attrs_supported();

  /* Manual boolean capability overrides for non-standard terminals and CI harnesses. */
  zr_win32_cap_override("ZIREAEL_CAP_MOUSE", &plat->caps.supports_mouse);
  zr_win32_cap_override("ZIREAEL_CAP_BRACKETED_PASTE", &plat->caps.supports_bracketed_paste);
  zr_win32_cap_override("ZIREAEL_CAP_OSC52", &plat->caps.supports_osc52);
  zr_win32_cap_override("ZIREAEL_CAP_SYNC_UPDATE", &plat->caps.supports_sync_update);
  zr_win32_cap_override("ZIREAEL_CAP_SCROLL_REGION", &plat->caps.supports_scroll_region);
  zr_win32_cap_override("ZIREAEL_CAP_CURSOR_SHAPE", &plat->caps.supports_cursor_shape);
  zr_win32_cap_override("ZIREAEL_CAP_FOCUS_EVENTS", &plat->caps.supports_focus_events);

  /*
    Keep cap + runtime behavior aligned:
      - manual off always disables wait support
      - manual on upgrades unsupported handles to immediate-ready mode
  */
  uint8_t output_wait_override = 0u;
  if (zr_win32_env_bool_override("ZIREAEL_CAP_OUTPUT_WAIT_WRITABLE", &output_wait_override)) {
    plat->caps.supports_output_wait_writable = output_wait_override;
    if (output_wait_override == 0u) {
      plat->output_wait_mode = ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED;
    } else if (plat->output_wait_mode == ZR_WIN32_OUTPUT_WAIT_MODE_UNSUPPORTED) {
      plat->output_wait_mode = ZR_WIN32_OUTPUT_WAIT_MODE_IMMEDIATE_READY;
    }
  }

  /* Optional attr-mask override (decimal or 0x... hex). */
  zr_win32_cap_u32_override("ZIREAEL_CAP_SGR_ATTRS", &plat->caps.sgr_attrs_supported);
  zr_win32_cap_u32_override("ZIREAEL_CAP_SGR_ATTRS_MASK", &plat->caps.sgr_attrs_supported);
  plat->caps.sgr_attrs_supported &= ZR_STYLE_ATTR_ALL_MASK;
  plat->caps._pad0[0] = 0u;
  plat->caps._pad0[1] = 0u;
  plat->caps._pad0[2] = 0u;

  (void)zr_win32_query_size_best_effort(plat->h_out, &plat->last_size);

  *out_plat = plat;
  return ZR_OK;
}

void plat_destroy(plat_t* plat) {
  if (!plat) {
    return;
  }

  (void)plat_leave_raw(plat);

  if (plat->h_wake_event) {
    (void)CloseHandle(plat->h_wake_event);
    plat->h_wake_event = NULL;
  }

  free(plat);
}

/* Enter raw mode: enable VT I/O (locked v1) and emit deterministic enter sequences. */
zr_result_t plat_enter_raw(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (plat->raw_active) {
    return ZR_OK;
  }

  zr_result_t r = zr_win32_enable_vt_or_fail(plat);
  if (r != ZR_OK) {
    return r;
  }

  zr_win32_emit_enter_sequences_best_effort(plat);
  plat->raw_active = true;
  return ZR_OK;
}

/* Leave raw mode: restore saved console modes and emit leave sequences. Idempotent. */
zr_result_t plat_leave_raw(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /*
    Idempotent + best-effort:
      - Attempt to restore the terminal even if we were never marked active.
      - Never block indefinitely.
  */
  if (plat->raw_active) {
    zr_win32_emit_leave_sequences_best_effort(plat);
  }

  (void)zr_win32_restore_modes_best_effort(plat);

  plat->raw_active = false;
  return ZR_OK;
}

zr_result_t plat_get_size(plat_t* plat, plat_size_t* out_size) {
  if (!plat || !out_size) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (!zr_win32_query_size_best_effort(plat->h_out, &plat->last_size)) {
    out_size->cols = 0u;
    out_size->rows = 0u;
    return ZR_ERR_PLATFORM;
  }

  *out_size = plat->last_size;
  return ZR_OK;
}

zr_result_t plat_get_caps(plat_t* plat, plat_caps_t* out_caps) {
  if (!plat || !out_caps) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_caps = plat->caps;
  return ZR_OK;
}

static int32_t zr_win32_read_input_pipe(plat_t* plat) {
  if (!plat) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }
  DWORD avail = 0u;
  BOOL ok = PeekNamedPipe(plat->h_in, NULL, 0u, NULL, &avail, NULL);
  if (!ok) {
    return (int32_t)ZR_ERR_PLATFORM;
  }
  return (avail == 0u) ? 0 : 1;
}

static void zr_win32_translate_console_key(const KEY_EVENT_RECORD* k, plat_t* plat, uint8_t* out_buf, size_t out_cap,
                                           size_t* out_len) {
  if (!k || !plat || !out_buf || !out_len || !k->bKeyDown) {
    return;
  }

  const WORD vk = k->wVirtualKeyCode;
  const WCHAR ch = k->uChar.UnicodeChar;
  const WORD repeat = k->wRepeatCount;
  const uint32_t mods = zr_win32_mod_bits_from_control_state(k->dwControlKeyState);
  const bool has_alt = (mods & ZR_WIN32_MOD_ALT_BIT) != 0u;

  uint8_t csi_final = 0u;
  if (zr_win32_vk_to_csi_final(vk, &csi_final)) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    zr_win32_emit_csi_final_repeat(out_buf, out_cap, out_len, csi_final, mods, repeat);
    return;
  }

  uint32_t csi_tilde_first = 0u;
  if (zr_win32_vk_to_csi_tilde(vk, &csi_tilde_first)) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    zr_win32_emit_csi_tilde_repeat(out_buf, out_cap, out_len, csi_tilde_first, mods, repeat);
    return;
  }

  uint8_t ss3_final = 0u;
  if (zr_win32_vk_to_ss3(vk, &ss3_final)) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    zr_win32_emit_ss3_final_repeat(out_buf, out_cap, out_len, ss3_final, repeat);
    return;
  }

  if (vk == VK_RETURN) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    const uint8_t seq[] = {(uint8_t)'\r'};
    zr_win32_emit_repeat(out_buf, out_cap, out_len, seq, sizeof(seq), repeat);
    return;
  }
  if (vk == VK_ESCAPE) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    const uint8_t seq[] = {0x1Bu};
    zr_win32_emit_repeat(out_buf, out_cap, out_len, seq, sizeof(seq), repeat);
    return;
  }
  if (vk == VK_TAB) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    if ((mods & ZR_WIN32_MOD_SHIFT_BIT) != 0u) {
      if (mods != ZR_WIN32_MOD_SHIFT_BIT) {
        zr_win32_emit_csi_final_repeat(out_buf, out_cap, out_len, (uint8_t)'Z', mods, repeat);
        return;
      }
      const uint8_t seq[] = {0x1Bu, (uint8_t)'[', (uint8_t)'Z'};
      zr_win32_emit_repeat(out_buf, out_cap, out_len, seq, sizeof(seq), repeat);
      return;
    }
    const uint8_t seq[] = {(uint8_t)'\t'};
    zr_win32_emit_repeat(out_buf, out_cap, out_len, seq, sizeof(seq), repeat);
    return;
  }
  if (vk == VK_BACK) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    const uint8_t seq[] = {0x7Fu};
    zr_win32_emit_repeat(out_buf, out_cap, out_len, seq, sizeof(seq), repeat);
    return;
  }

  if (ch == 0) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    return;
  }

  if (zr_win32_is_high_surrogate((uint32_t)ch)) {
    zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
    plat->has_pending_high_surrogate = true;
    plat->pending_high_surrogate = (uint16_t)ch;
    return;
  }
  if (zr_win32_is_low_surrogate((uint32_t)ch)) {
    if (plat->has_pending_high_surrogate) {
      const uint32_t scalar = zr_win32_decode_surrogate_pair((uint32_t)plat->pending_high_surrogate, (uint32_t)ch);
      plat->has_pending_high_surrogate = false;
      plat->pending_high_surrogate = 0u;
      zr_win32_emit_text_scalar_repeat(out_buf, out_cap, out_len, scalar, repeat, has_alt);
      return;
    }
    zr_win32_emit_text_scalar_repeat(out_buf, out_cap, out_len, 0xFFFDu, repeat, has_alt);
    return;
  }

  zr_win32_flush_pending_high_surrogate(plat, out_buf, out_cap, out_len);
  zr_win32_emit_text_scalar_repeat(out_buf, out_cap, out_len, (uint32_t)ch, repeat, has_alt);
}

static int32_t zr_win32_read_input_console(plat_t* plat, uint8_t* out_buf, int32_t out_cap) {
  if (!plat || !out_buf || out_cap < 0) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }

  DWORD n_events = 0u;
  if (!GetNumberOfConsoleInputEvents(plat->h_in, &n_events)) {
    return (int32_t)ZR_ERR_PLATFORM;
  }
  if (n_events == 0u) {
    return 0;
  }

  INPUT_RECORD recs[32];
  DWORD read = 0u;
  DWORD want = n_events;
  if (want > (DWORD)(sizeof(recs) / sizeof(recs[0]))) {
    want = (DWORD)(sizeof(recs) / sizeof(recs[0]));
  }
  if (!ReadConsoleInputW(plat->h_in, recs, want, &read)) {
    return (int32_t)ZR_ERR_PLATFORM;
  }

  size_t out_len = 0u;
  const size_t out_cap_z = (size_t)out_cap;
  for (DWORD i = 0u; i < read; i++) {
    const INPUT_RECORD* r = &recs[i];
    if (r->EventType != KEY_EVENT) {
      continue;
    }
    zr_win32_translate_console_key(&r->Event.KeyEvent, plat, out_buf, out_cap_z, &out_len);
  }

  if (out_len > (size_t)INT32_MAX) {
    return (int32_t)ZR_ERR_PLATFORM;
  }
  return (int32_t)out_len;
}

static int32_t zr_win32_read_input_waitable(plat_t* plat, uint8_t* out_buf, int32_t out_cap) {
  if (!plat || !out_buf || out_cap < 0) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }

  DWORD wait_rc = WaitForSingleObject(plat->h_in, 0u);
  if (wait_rc == WAIT_TIMEOUT) {
    return 0;
  }
  if (wait_rc != WAIT_OBJECT_0) {
    return (int32_t)ZR_ERR_PLATFORM;
  }

  DWORD n = 0u;
  BOOL ok = ReadFile(plat->h_in, out_buf, (DWORD)out_cap, &n, NULL);
  if (!ok || n > (DWORD)INT32_MAX) {
    return (int32_t)ZR_ERR_PLATFORM;
  }
  return (int32_t)n;
}

/* Non-blocking read from console input; returns bytes read, 0 if none available, or error. */
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

  /*
    Non-blocking read is subtle on Windows:
      - ConPTY and some hosts present STDIN as a pipe; waitable handles may still
        appear signaled when no bytes are currently readable.
      - Console input handles may not behave like pipes for readiness queries.

    Rule: never call ReadFile unless we have strong evidence that it will not
    block. Prefer explicit "bytes available" probes when possible.
  */
  const DWORD ft = GetFileType(plat->h_in);
  if (ft == FILE_TYPE_PIPE) {
    const int32_t ready = zr_win32_read_input_pipe(plat);
    if (ready <= 0) {
      return ready;
    }
  } else if (ft == FILE_TYPE_CHAR) {
    return zr_win32_read_input_console(plat, out_buf, out_cap);
  }
  return zr_win32_read_input_waitable(plat, out_buf, out_cap);
}

zr_result_t plat_write_output(plat_t* plat, const uint8_t* bytes, int32_t len) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_win32_write_all(plat->h_out, bytes, len);
}

zr_result_t plat_wait_output_writable(plat_t* plat, int32_t timeout_ms) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (plat->caps.supports_output_wait_writable == 0u) {
    return ZR_ERR_UNSUPPORTED;
  }

  if (plat->output_wait_mode == ZR_WIN32_OUTPUT_WAIT_MODE_WAIT_HANDLE) {
    return zr_win32_wait_handle_signaled(plat->h_out, timeout_ms);
  }
  if (plat->output_wait_mode == ZR_WIN32_OUTPUT_WAIT_MODE_IMMEDIATE_READY) {
    return ZR_OK;
  }
  return ZR_ERR_UNSUPPORTED;
}

/* Wait for input or wake event; returns 1 if ready, 0 on timeout, or error code. */
int32_t plat_wait(plat_t* plat, int32_t timeout_ms) {
  if (!plat) {
    return (int32_t)ZR_ERR_INVALID_ARGUMENT;
  }

  DWORD timeout = INFINITE;
  if (timeout_ms >= 0) {
    timeout = (DWORD)timeout_ms;
  }

  HANDLE handles[2];
  handles[0] = plat->h_in;
  handles[1] = plat->h_wake_event;

  DWORD rc = WaitForMultipleObjects(2u, handles, FALSE, timeout);
  if (rc == WAIT_TIMEOUT) {
    return 0;
  }
  if (rc == WAIT_OBJECT_0 || rc == (WAIT_OBJECT_0 + 1u)) {
    return 1;
  }

  return (int32_t)ZR_ERR_PLATFORM;
}

/* Wake a blocked plat_wait call from another thread by signaling the wake event. */
zr_result_t plat_wake(plat_t* plat) {
  if (!plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!plat->h_wake_event) {
    return ZR_ERR_PLATFORM;
  }
  if (!SetEvent(plat->h_wake_event)) {
    return ZR_ERR_PLATFORM;
  }
  return ZR_OK;
}

uint64_t plat_now_ms(void) {
  LARGE_INTEGER freq;
  LARGE_INTEGER now;
  if (!QueryPerformanceFrequency(&freq) || freq.QuadPart <= 0) {
    return 0ull;
  }
  if (!QueryPerformanceCounter(&now)) {
    return 0ull;
  }

  uint64_t ticks = (uint64_t)now.QuadPart;
  uint64_t hz = (uint64_t)freq.QuadPart;

  uint64_t seconds = ticks / hz;
  uint64_t rem = ticks % hz;
  if (seconds > UINT64_MAX / 1000ull) {
    return UINT64_MAX;
  }
  return (seconds * 1000ull) + ((rem * 1000ull) / hz);
}
