/*
  src/core/zr_input_parser.c — Deterministic input byte parser implementation.

  Why: Provides a deterministic, bounds-checked parser for platform input bytes
  suitable for fuzzing. Unknown escape sequences are handled without hangs.
*/

#include "core/zr_input_parser.h"

#include "unicode/zr_utf8.h"

#include <string.h>

enum {
  ZR_CSI_MOD_PARAM_BASE = 1u,
  ZR_CSI_MOD_SHIFT_BIT = 1u << 0,
  ZR_CSI_MOD_ALT_BIT = 1u << 1,
  ZR_CSI_MOD_CTRL_BIT = 1u << 2,
  ZR_CSI_MOD_META_BIT = 1u << 3,

  ZR_XTERM_BTN_BASE_MASK = 0x03u,
  ZR_XTERM_BTN_SHIFT_BIT = 1u << 2,
  ZR_XTERM_BTN_ALT_BIT = 1u << 3,
  ZR_XTERM_BTN_CTRL_BIT = 1u << 4,
  ZR_XTERM_BTN_MOTION_BIT = 1u << 5,
  ZR_XTERM_BTN_WHEEL_BIT = 1u << 6,

  ZR_XTERM_WHEEL_UP = 0u,
  ZR_XTERM_WHEEL_DOWN = 1u,
  ZR_XTERM_WHEEL_RIGHT = 2u,
  ZR_XTERM_WHEEL_LEFT = 3u,
};

static uint32_t zr__mods_from_csi_param(uint32_t mod_param) {
  uint32_t mods = 0u;
  if (mod_param <= ZR_CSI_MOD_PARAM_BASE) {
    return 0u;
  }

  const uint32_t bits = mod_param - ZR_CSI_MOD_PARAM_BASE;
  if ((bits & ZR_CSI_MOD_SHIFT_BIT) != 0u) {
    mods |= ZR_MOD_SHIFT;
  }
  if ((bits & ZR_CSI_MOD_ALT_BIT) != 0u) {
    mods |= ZR_MOD_ALT;
  }
  if ((bits & ZR_CSI_MOD_CTRL_BIT) != 0u) {
    mods |= ZR_MOD_CTRL;
  }
  if ((bits & ZR_CSI_MOD_META_BIT) != 0u) {
    mods |= ZR_MOD_META;
  }
  return mods;
}

static void zr__push_key(zr_event_queue_t* q, uint32_t time_ms, zr_key_t key, uint32_t mods, zr_key_action_t action) {
  zr_event_t ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = ZR_EV_KEY;
  ev.time_ms = time_ms;
  ev.flags = 0u;
  ev.u.key.key = (uint32_t)key;
  ev.u.key.mods = mods;
  ev.u.key.action = (uint32_t)action;
  ev.u.key.reserved0 = 0u;
  (void)zr_event_queue_push(q, &ev);
}

static void zr__push_mouse(zr_event_queue_t* q, uint32_t time_ms, int32_t x, int32_t y, uint32_t kind, uint32_t mods,
                           uint32_t buttons, int32_t wheel_x, int32_t wheel_y) {
  zr_event_t ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = ZR_EV_MOUSE;
  ev.time_ms = time_ms;
  ev.flags = 0u;
  ev.u.mouse.x = x;
  ev.u.mouse.y = y;
  ev.u.mouse.kind = kind;
  ev.u.mouse.mods = mods;
  ev.u.mouse.buttons = buttons;
  ev.u.mouse.wheel_x = wheel_x;
  ev.u.mouse.wheel_y = wheel_y;
  ev.u.mouse.reserved0 = 0u;
  (void)zr_event_queue_push(q, &ev);
}

static void zr__push_text_scalar(zr_event_queue_t* q, uint32_t time_ms, uint32_t scalar) {
  zr_event_t ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = ZR_EV_TEXT;
  ev.time_ms = time_ms;
  ev.flags = 0u;
  ev.u.text.codepoint = scalar;
  ev.u.text.reserved0 = 0u;
  (void)zr_event_queue_push(q, &ev);
}

static bool zr__is_digit(uint8_t b) {
  return b >= (uint8_t)'0' && b <= (uint8_t)'9';
}

/*
  Return true when bytes[i] starts a valid UTF-8 prefix that is incomplete.

  Why: Prefix parsing is used by the engine's pending-input buffer, which may
  receive one byte at a time. We must preserve an incomplete scalar until more
  bytes arrive instead of emitting replacement text prematurely.
*/
static bool zr__is_incomplete_utf8_prefix(const uint8_t* bytes, size_t len, size_t i) {
  if (!bytes || i >= len) {
    return false;
  }

  const uint8_t b0 = bytes[i];
  size_t expect = 0u;
  if (b0 >= 0xC2u && b0 <= 0xDFu) {
    expect = 2u;
  } else if (b0 >= 0xE0u && b0 <= 0xEFu) {
    expect = 3u;
  } else if (b0 >= 0xF0u && b0 <= 0xF4u) {
    expect = 4u;
  } else {
    return false;
  }

  const size_t avail = len - i;
  if (avail >= expect) {
    return false;
  }

  for (size_t j = 1u; j < avail; j++) {
    if ((bytes[i + j] & 0xC0u) != 0x80u) {
      return false;
    }
  }

  /*
    Keep only prefixes that can still become valid once additional bytes arrive.
    Examples:
      - E0 80 .. is impossible (second byte must be A0..BF)
      - F4 90 .. is impossible (second byte must be 80..8F)
  */
  if (avail >= 2u) {
    const uint8_t b1 = bytes[i + 1u];
    if (expect == 3u) {
      if (b0 == 0xE0u && b1 < 0xA0u) {
        return false;
      }
      if (b0 == 0xEDu && b1 > 0x9Fu) {
        return false;
      }
    } else if (expect == 4u) {
      if (b0 == 0xF0u && b1 < 0x90u) {
        return false;
      }
      if (b0 == 0xF4u && b1 > 0x8Fu) {
        return false;
      }
    }
  }

  return true;
}

static bool zr__parse_u32_dec(const uint8_t* bytes, size_t len, size_t* io_i, uint32_t* out_val) {
  if (!bytes || !io_i || !out_val) {
    return false;
  }
  size_t i = *io_i;
  if (i >= len || !zr__is_digit(bytes[i])) {
    return false;
  }

  uint32_t v = 0u;
  while (i < len && zr__is_digit(bytes[i])) {
    const uint32_t d = (uint32_t)(bytes[i] - (uint8_t)'0');
    if (v > (UINT32_MAX / 10u)) {
      return false;
    }
    if (v == (UINT32_MAX / 10u) && d > (UINT32_MAX % 10u)) {
      return false;
    }
    v = (v * 10u) + d;
    i++;
  }

  *io_i = i;
  *out_val = v;
  return true;
}

static bool zr__csi_tilde_key_from_first(uint32_t first, zr_key_t* out_key) {
  if (!out_key) {
    return false;
  }

  static const struct {
    uint32_t n;
    zr_key_t key;
  } map[] = {
      {1u, ZR_KEY_HOME},   {7u, ZR_KEY_HOME},   {4u, ZR_KEY_END},     {8u, ZR_KEY_END},
      {15u, ZR_KEY_F5},    {17u, ZR_KEY_F6},    {18u, ZR_KEY_F7},     {19u, ZR_KEY_F8},
      {20u, ZR_KEY_F9},    {21u, ZR_KEY_F10},   {23u, ZR_KEY_F11},    {24u, ZR_KEY_F12},
      {2u, ZR_KEY_INSERT}, {3u, ZR_KEY_DELETE}, {5u, ZR_KEY_PAGE_UP}, {6u, ZR_KEY_PAGE_DOWN},
  };

  for (size_t mi = 0u; mi < (sizeof(map) / sizeof(map[0])); mi++) {
    if (map[mi].n == first) {
      *out_key = map[mi].key;
      return true;
    }
  }
  return false;
}

static bool zr__csi_simple_key_from_final(uint8_t final_byte, zr_key_t* out_key) {
  if (!out_key) {
    return false;
  }

  switch (final_byte) {
  case (uint8_t)'A':
    *out_key = ZR_KEY_UP;
    return true;
  case (uint8_t)'B':
    *out_key = ZR_KEY_DOWN;
    return true;
  case (uint8_t)'C':
    *out_key = ZR_KEY_RIGHT;
    return true;
  case (uint8_t)'D':
    *out_key = ZR_KEY_LEFT;
    return true;
  case (uint8_t)'H':
    *out_key = ZR_KEY_HOME;
    return true;
  case (uint8_t)'F':
    *out_key = ZR_KEY_END;
    return true;
  default:
    return false;
  }
}

static bool zr__parse_csi_tilde_key(const uint8_t* bytes, size_t len, size_t i, zr_key_t* out_key, uint32_t* out_mods,
                                    size_t* out_consumed) {
  if (!bytes || !out_key || !out_consumed) {
    return false;
  }
  if (!out_mods) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  size_t j = i + 2u;
  uint32_t first = 0u;
  uint32_t mod_param = 0u;
  bool has_mod = false;
  if (!zr__parse_u32_dec(bytes, len, &j, &first)) {
    return false;
  }

  while (j < len && bytes[j] != (uint8_t)'~') {
    /* Skip modifier parameters (e.g. "1;5~"). */
    if (bytes[j] == (uint8_t)';') {
      j++;
      uint32_t dummy = 0u;
      if (!zr__parse_u32_dec(bytes, len, &j, &dummy)) {
        return false;
      }
      if (!has_mod) {
        mod_param = dummy;
        has_mod = true;
      }
      continue;
    }
    return false;
  }

  if (j >= len || bytes[j] != (uint8_t)'~') {
    return false;
  }

  zr_key_t key = ZR_KEY_UNKNOWN;
  if (!zr__csi_tilde_key_from_first(first, &key)) {
    return false;
  }

  *out_key = key;
  *out_mods = has_mod ? zr__mods_from_csi_param(mod_param) : 0u;
  *out_consumed = (j + 1u) - i;
  return true;
}

static bool zr__parse_csi_simple_key(const uint8_t* bytes, size_t len, size_t i, zr_key_t* out_key, uint32_t* out_mods,
                                     size_t* out_consumed) {
  if (!bytes || !out_key || !out_consumed) {
    return false;
  }
  if (!out_mods) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  /*
    CSI sequences we accept here:
      - ESC [ A/B/C/D (arrows)
      - ESC [ <params> A/B/C/D (arrows with modifiers)
      - ESC [ H/F (home/end) and their param forms
      - ESC [ Z (shift-tab)
  */
  size_t j = i + 2u;
  uint32_t param_index = 0u;
  uint32_t mod_param = 0u;

  while (j < len && (zr__is_digit(bytes[j]) || bytes[j] == (uint8_t)';')) {
    uint32_t parsed = 0u;
    if (!zr__parse_u32_dec(bytes, len, &j, &parsed)) {
      return false;
    }
    param_index++;
    if (param_index == 2u) {
      mod_param = parsed;
    }
    if (j < len && bytes[j] == (uint8_t)';') {
      j++;
      continue;
    }
    break;
  }

  if (j >= len) {
    return false;
  }

  zr_key_t key = ZR_KEY_UNKNOWN;
  if (!zr__csi_simple_key_from_final(bytes[j], &key)) {
    if (bytes[j] != (uint8_t)'Z') {
      return false;
    }
    key = ZR_KEY_TAB;
    *out_mods = (param_index >= 2u) ? zr__mods_from_csi_param(mod_param) : (uint32_t)ZR_MOD_SHIFT;
    *out_key = key;
    *out_consumed = (j + 1u) - i;
    return true;
  }

  *out_key = key;
  *out_mods = (param_index >= 2u) ? zr__mods_from_csi_param(mod_param) : 0u;
  *out_consumed = (j + 1u) - i;
  return true;
}

static bool zr__parse_csi_focus_key(const uint8_t* bytes, size_t len, size_t i, zr_key_t* out_key,
                                    size_t* out_consumed) {
  if (!bytes || !out_key || !out_consumed) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  if (bytes[i + 2u] == (uint8_t)'I') {
    *out_key = ZR_KEY_FOCUS_IN;
    *out_consumed = 3u;
    return true;
  }
  if (bytes[i + 2u] == (uint8_t)'O') {
    *out_key = ZR_KEY_FOCUS_OUT;
    *out_consumed = 3u;
    return true;
  }
  return false;
}

static bool zr__is_valid_unicode_scalar(uint32_t scalar) {
  if (scalar > 0x10FFFFu) {
    return false;
  }
  return scalar < 0xD800u || scalar > 0xDFFFu;
}

static bool zr__extended_key_from_codepoint(uint32_t codepoint, zr_key_t* out_key) {
  if (!out_key) {
    return false;
  }
  switch (codepoint) {
  case 0x08u:
  case 0x7Fu:
    *out_key = ZR_KEY_BACKSPACE;
    return true;
  case 0x09u:
    *out_key = ZR_KEY_TAB;
    return true;
  case 0x0Du:
    *out_key = ZR_KEY_ENTER;
    return true;
  case 0x1Bu:
    *out_key = ZR_KEY_ESCAPE;
    return true;
  default:
    return false;
  }
}

/*
  Emit a normalized event from an extended key protocol codepoint+modifier pair.

  Why: CSI-u and modifyOtherKeys encode text/control keys through numeric fields.
  The current event ABI has dedicated key+mods for control keys and text scalars
  for printable input; this helper keeps both protocols on one policy path.
*/
static bool zr__emit_extended_codepoint(zr_event_queue_t* q, uint32_t time_ms, uint32_t codepoint, uint32_t mods) {
  if (!q) {
    return false;
  }

  zr_key_t key = ZR_KEY_UNKNOWN;
  if (zr__extended_key_from_codepoint(codepoint, &key)) {
    zr__push_key(q, time_ms, key, mods, ZR_KEY_ACTION_DOWN);
    return true;
  }

  if (zr__is_valid_unicode_scalar(codepoint)) {
    if ((mods & (ZR_MOD_ALT | ZR_MOD_META)) != 0u) {
      zr__push_key(q, time_ms, ZR_KEY_ESCAPE, 0u, ZR_KEY_ACTION_DOWN);
    }
    zr__push_text_scalar(q, time_ms, codepoint);
    return true;
  }

  if (mods != 0u) {
    zr__push_key(q, time_ms, ZR_KEY_UNKNOWN, mods, ZR_KEY_ACTION_DOWN);
    return true;
  }
  return false;
}

static bool zr__parse_csi_u_key(const uint8_t* bytes, size_t len, size_t i, uint32_t time_ms, zr_event_queue_t* q,
                                size_t* out_consumed) {
  if (!bytes || !q || !out_consumed) {
    return false;
  }
  if ((i + 3u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  size_t j = i + 2u;
  uint32_t param_index = 0u;
  uint32_t codepoint = 0u;
  uint32_t mod_param = 0u;

  while (j < len && (zr__is_digit(bytes[j]) || bytes[j] == (uint8_t)';')) {
    uint32_t parsed = 0u;
    if (!zr__parse_u32_dec(bytes, len, &j, &parsed)) {
      return false;
    }
    param_index++;
    if (param_index == 1u) {
      codepoint = parsed;
    } else if (param_index == 2u) {
      mod_param = parsed;
    }
    if (j < len && bytes[j] == (uint8_t)';') {
      j++;
      continue;
    }
    break;
  }

  if (param_index == 0u || j >= len || bytes[j] != (uint8_t)'u') {
    return false;
  }

  const uint32_t mods = (param_index >= 2u) ? zr__mods_from_csi_param(mod_param) : 0u;
  if (!zr__emit_extended_codepoint(q, time_ms, codepoint, mods)) {
    return false;
  }
  *out_consumed = (j + 1u) - i;
  return true;
}

static bool zr__parse_modify_other_keys_tilde(const uint8_t* bytes, size_t len, size_t i, uint32_t time_ms,
                                              zr_event_queue_t* q, size_t* out_consumed) {
  if (!bytes || !q || !out_consumed) {
    return false;
  }
  if ((i + 5u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  size_t j = i + 2u;
  uint32_t params[3];
  params[0] = 0u;
  params[1] = 0u;
  params[2] = 0u;
  uint32_t param_count = 0u;

  if (!zr__parse_u32_dec(bytes, len, &j, &params[0])) {
    return false;
  }
  param_count = 1u;

  while (j < len && bytes[j] != (uint8_t)'~') {
    if (bytes[j] != (uint8_t)';') {
      return false;
    }
    j++;
    uint32_t parsed = 0u;
    if (!zr__parse_u32_dec(bytes, len, &j, &parsed)) {
      return false;
    }
    if (param_count < 3u) {
      params[param_count] = parsed;
    }
    param_count++;
  }

  if (j >= len || bytes[j] != (uint8_t)'~') {
    return false;
  }
  if (params[0] != 27u || param_count < 3u) {
    return false;
  }

  const uint32_t mods = zr__mods_from_csi_param(params[1]);
  if (!zr__emit_extended_codepoint(q, time_ms, params[2], mods)) {
    return false;
  }
  *out_consumed = (j + 1u) - i;
  return true;
}

static bool zr__parse_ss3_key(const uint8_t* bytes, size_t len, size_t i, zr_key_t* out_key, size_t* out_consumed) {
  if (!bytes || !out_key || !out_consumed) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'O') {
    return false;
  }

  zr_key_t key = ZR_KEY_UNKNOWN;
  switch (bytes[i + 2u]) {
  case (uint8_t)'A':
    key = ZR_KEY_UP;
    break;
  case (uint8_t)'B':
    key = ZR_KEY_DOWN;
    break;
  case (uint8_t)'C':
    key = ZR_KEY_RIGHT;
    break;
  case (uint8_t)'D':
    key = ZR_KEY_LEFT;
    break;
  case (uint8_t)'H':
    key = ZR_KEY_HOME;
    break;
  case (uint8_t)'F':
    key = ZR_KEY_END;
    break;
  case (uint8_t)'P':
    key = ZR_KEY_F1;
    break;
  case (uint8_t)'Q':
    key = ZR_KEY_F2;
    break;
  case (uint8_t)'R':
    key = ZR_KEY_F3;
    break;
  case (uint8_t)'S':
    key = ZR_KEY_F4;
    break;
  default:
    return false;
  }

  *out_key = key;
  *out_consumed = 3u;
  return true;
}

static uint32_t zr__mods_from_xterm_btn(uint32_t b) {
  uint32_t mods = 0u;
  if ((b & ZR_XTERM_BTN_SHIFT_BIT) != 0u) {
    mods |= ZR_MOD_SHIFT;
  }
  if ((b & ZR_XTERM_BTN_ALT_BIT) != 0u) {
    mods |= ZR_MOD_ALT;
  }
  if ((b & ZR_XTERM_BTN_CTRL_BIT) != 0u) {
    mods |= ZR_MOD_CTRL;
  }
  return mods;
}

static uint32_t zr__buttons_mask_from_base(uint32_t base) {
  if (base > 2u) {
    return 0u;
  }
  return 1u << base;
}

static int32_t zr__term_coord_to_i32(uint32_t coord) {
  if (coord == 0u || coord > (uint32_t)INT32_MAX) {
    return 0;
  }
  return (int32_t)(coord - 1u);
}

/*
  Classify an xterm SGR mouse packet into engine event fields.

  Why: Button bitfields are dense and easy to misread; keeping the policy in one
  helper avoids drift between press/release/motion/wheel paths.
*/
static void zr__decode_sgr_mouse_event(uint32_t button_code, uint8_t terminator, uint32_t* out_kind,
                                       uint32_t* out_buttons, int32_t* out_wheel_x, int32_t* out_wheel_y) {
  if (!out_kind || !out_buttons || !out_wheel_x || !out_wheel_y) {
    return;
  }

  const uint32_t base = button_code & ZR_XTERM_BTN_BASE_MASK;
  const bool is_motion = (button_code & ZR_XTERM_BTN_MOTION_BIT) != 0u;
  const bool is_wheel = (button_code & ZR_XTERM_BTN_WHEEL_BIT) != 0u;

  *out_kind = (uint32_t)ZR_MOUSE_MOVE;
  *out_buttons = 0u;
  *out_wheel_x = 0;
  *out_wheel_y = 0;

  if (is_wheel) {
    *out_kind = (uint32_t)ZR_MOUSE_WHEEL;
    if (base == ZR_XTERM_WHEEL_UP) {
      *out_wheel_y = 1;
    } else if (base == ZR_XTERM_WHEEL_DOWN) {
      *out_wheel_y = -1;
    } else if (base == ZR_XTERM_WHEEL_RIGHT) {
      *out_wheel_x = 1;
    } else {
      *out_wheel_x = -1;
    }
    return;
  }

  if (is_motion) {
    /*
      In any-event tracking, motion with no buttons pressed is encoded as
      base=3 plus motion bit. Preserve that as MOVE (not button up).
    */
    if (base != 3u) {
      *out_buttons = zr__buttons_mask_from_base(base);
    }
    *out_kind = (*out_buttons != 0u) ? (uint32_t)ZR_MOUSE_DRAG : (uint32_t)ZR_MOUSE_MOVE;
    return;
  }

  if (terminator == (uint8_t)'m') {
    *out_kind = (uint32_t)ZR_MOUSE_UP;
    *out_buttons = zr__buttons_mask_from_base(base);
    return;
  }

  if (base == 3u) {
    *out_kind = (uint32_t)ZR_MOUSE_MOVE;
    return;
  }

  *out_kind = (uint32_t)ZR_MOUSE_DOWN;
  *out_buttons = zr__buttons_mask_from_base(base);
}

static bool zr__parse_sgr_mouse(const uint8_t* bytes, size_t len, size_t i, uint32_t time_ms, zr_event_queue_t* q,
                                size_t* out_consumed) {
  if (!bytes || !q || !out_consumed) {
    return false;
  }
  if ((i + 3u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[' || bytes[i + 2u] != (uint8_t)'<') {
    return false;
  }

  size_t j = i + 3u;
  uint32_t b = 0u;
  uint32_t x = 0u;
  uint32_t y = 0u;

  if (!zr__parse_u32_dec(bytes, len, &j, &b)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr__parse_u32_dec(bytes, len, &j, &x)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr__parse_u32_dec(bytes, len, &j, &y)) {
    return false;
  }
  if (j >= len) {
    return false;
  }

  const uint8_t term = bytes[j];
  if (term != (uint8_t)'M' && term != (uint8_t)'m') {
    return false;
  }

  const int32_t xi = zr__term_coord_to_i32(x);
  const int32_t yi = zr__term_coord_to_i32(y);
  const uint32_t mods = zr__mods_from_xterm_btn(b);

  uint32_t kind = 0u;
  uint32_t buttons = 0u;
  int32_t wheel_x = 0;
  int32_t wheel_y = 0;
  zr__decode_sgr_mouse_event(b, term, &kind, &buttons, &wheel_x, &wheel_y);

  zr__push_mouse(q, time_ms, xi, yi, kind, mods, buttons, wheel_x, wheel_y);
  *out_consumed = (j + 1u) - i;
  return true;
}

/*
  Check whether an ESC byte begins a supported escape sequence that is incomplete.

  Why: The engine may split platform reads arbitrarily. Callers that want to
  buffer only supported partial sequences can stop before consuming them, and
  only flush them as a bare Escape key on idle.
*/
static bool zr__esc_is_incomplete_supported(const uint8_t* bytes, size_t len, size_t i) {
  if (!bytes || i >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu) {
    return false;
  }
  if ((i + 1u) >= len) {
    return true;
  }

  const uint8_t b1 = bytes[i + 1u];
  if (b1 == (uint8_t)'[') {
    if ((i + 2u) >= len) {
      return true;
    }

    const uint8_t b2 = bytes[i + 2u];
    if (b2 == (uint8_t)'<') {
      /* SGR mouse: require a terminating M/m. */
      for (size_t j = i + 3u; j < len; j++) {
        const uint8_t t = bytes[j];
        if (t == (uint8_t)'M' || t == (uint8_t)'m') {
          return false;
        }
      }
      return true;
    }

    /* CSI keys: require a terminator (not digit/;). */
    for (size_t j = i + 2u; j < len; j++) {
      const uint8_t t = bytes[j];
      if (zr__is_digit(t) || t == (uint8_t)';') {
        continue;
      }
      return false;
    }
    return true;
  }

  if (b1 == (uint8_t)'O') {
    /* SS3 keys: ESC O <final>. */
    return (i + 2u) >= len;
  }

  return false;
}

/*
  Consume an escape-driven sequence starting at bytes[i], enqueuing a normalized event.

  Why: Centralizes the "try parse known VT sequences; otherwise fallback to
  Escape key" behavior so prefix parsing and full parsing stay consistent.
*/
static size_t zr__consume_escape(zr_event_queue_t* q, const uint8_t* bytes, size_t len, size_t i, uint32_t time_ms) {
  if (!q || !bytes || i >= len) {
    return 0u;
  }
  if (bytes[i] != 0x1Bu) {
    return 0u;
  }

  zr_key_t key = ZR_KEY_UNKNOWN;
  uint32_t mods = 0u;
  size_t consumed = 0u;

  if ((i + 2u) < len && bytes[i + 1u] == (uint8_t)'[') {
    /* SGR mouse: ESC [ < ... (M or m) */
    if (bytes[i + 2u] == (uint8_t)'<') {
      if (zr__parse_sgr_mouse(bytes, len, i, time_ms, q, &consumed)) {
        return consumed;
      }
    }

    if (zr__parse_csi_focus_key(bytes, len, i, &key, &consumed)) {
      zr__push_key(q, time_ms, key, 0u, ZR_KEY_ACTION_DOWN);
      return consumed;
    }
    if (zr__parse_csi_u_key(bytes, len, i, time_ms, q, &consumed)) {
      return consumed;
    }
    if (zr__parse_modify_other_keys_tilde(bytes, len, i, time_ms, q, &consumed)) {
      return consumed;
    }
    if (zr__parse_csi_simple_key(bytes, len, i, &key, &mods, &consumed)) {
      zr__push_key(q, time_ms, key, mods, ZR_KEY_ACTION_DOWN);
      return consumed;
    }
    if (zr__parse_csi_tilde_key(bytes, len, i, &key, &mods, &consumed)) {
      zr__push_key(q, time_ms, key, mods, ZR_KEY_ACTION_DOWN);
      return consumed;
    }
  }

  if (zr__parse_ss3_key(bytes, len, i, &key, &consumed)) {
    zr__push_key(q, time_ms, key, 0u, ZR_KEY_ACTION_DOWN);
    return consumed;
  }

  /* Deterministic fallback: treat bare ESC as an Escape key. */
  zr__push_key(q, time_ms, ZR_KEY_ESCAPE, 0u, ZR_KEY_ACTION_DOWN);
  return 1u;
}

/* Parse bytes into events, optionally stopping before an incomplete supported ESC sequence. */
static size_t zr_input_parse_bytes_internal(zr_event_queue_t* q, const uint8_t* bytes, size_t len, uint32_t time_ms,
                                            bool stop_before_incomplete_escape) {
  if (!q || (!bytes && len != 0u)) {
    return 0u;
  }

  size_t i = 0u;
  while (i < len) {
    const uint8_t b = bytes[i];

    /* --- Escape-driven VT sequences --- */
    if (b == 0x1Bu) {
      if (stop_before_incomplete_escape && zr__esc_is_incomplete_supported(bytes, len, i)) {
        break;
      }

      i += zr__consume_escape(q, bytes, len, i, time_ms);
      continue;
    }

    if (b == (uint8_t)'\r' || b == (uint8_t)'\n') {
      zr__push_key(q, time_ms, ZR_KEY_ENTER, 0u, ZR_KEY_ACTION_DOWN);
      i += 1u;
      continue;
    }
    if (b == (uint8_t)'\t') {
      zr__push_key(q, time_ms, ZR_KEY_TAB, 0u, ZR_KEY_ACTION_DOWN);
      i += 1u;
      continue;
    }
    if (b == 0x7Fu) {
      zr__push_key(q, time_ms, ZR_KEY_BACKSPACE, 0u, ZR_KEY_ACTION_DOWN);
      i += 1u;
      continue;
    }

    if (stop_before_incomplete_escape && zr__is_incomplete_utf8_prefix(bytes, len, i)) {
      break;
    }

    zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes + i, len - i);
    if (d.size == 0u) {
      break;
    }
    const uint32_t scalar = (d.valid != 0u) ? d.scalar : 0xFFFDu;
    zr__push_text_scalar(q, time_ms, scalar);
    i += (size_t)d.size;
  }

  return i;
}

/*
  Parse terminal input bytes into key/mouse/text events.

  Why: The engine reads raw bytes on POSIX backends. This parser must accept
  common VT/xterm control sequences (arrows, home/end, SGR mouse) and degrade
  deterministically on unknown sequences without hangs.
*/
void zr_input_parse_bytes(zr_event_queue_t* q, const uint8_t* bytes, size_t len, uint32_t time_ms) {
  (void)zr_input_parse_bytes_internal(q, bytes, len, time_ms, false);
}

size_t zr_input_parse_bytes_prefix(zr_event_queue_t* q, const uint8_t* bytes, size_t len, uint32_t time_ms) {
  return zr_input_parse_bytes_internal(q, bytes, len, time_ms, true);
}
