/*
  src/core/zr_detect.c — Startup terminal probing and capability profile shaping.

  Why: Sends deterministic terminal queries once during engine creation, parses
  responses safely, and maps results into a stable capability profile.
*/

#include "core/zr_detect.h"

#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

enum {
  ZR_DETECT_VERSION_CAP = 64u,
  ZR_DETECT_READ_CHUNK_CAP = 256u,
  ZR_DETECT_READ_ACCUM_CAP = 4096u,
  ZR_DETECT_QUERY_TIMEOUT_MS = 100u,
  ZR_DETECT_TOTAL_TIMEOUT_MS = 500u,
  ZR_DETECT_DECRQM_SET = 1u,
};

static const uint8_t ZR_DETECT_QUERY_BATCH[] = "\x1b[>0q"     /* XTVERSION */
                                               "\x1b[c"       /* DA1 */
                                               "\x1b[>c"      /* DA2 */
                                               "\x1b[?2026$p" /* DECRQM sync-update */
                                               "\x1b[?2027$p" /* DECRQM grapheme clusters */
                                               "\x1b[?1016$p" /* DECRQM pixel mouse */
                                               "\x1b[?2004$p" /* DECRQM bracketed paste */
                                               "\x1b[16t"     /* cell pixel size */
                                               "\x1b[14t";    /* text area pixel size */

typedef struct zr_term_known_caps_t {
  zr_terminal_id_t id;
  uint8_t supports_sixel;
  uint8_t supports_kitty_graphics;
  uint8_t supports_iterm2_images;
  uint8_t supports_underline_styles;
  uint8_t supports_colored_underlines;
  uint8_t supports_hyperlinks;
  uint8_t supports_grapheme_clusters;
  uint8_t supports_overline;
  uint8_t supports_pixel_mouse;
  uint8_t supports_kitty_keyboard;
  uint8_t supports_sync_update;
} zr_term_known_caps_t;

/*
  Known-terminal capability defaults.

  Sources: Kitty/WezTerm/iTerm2/xterm/Windows Terminal docs and conservative
  terminal behavior observations from the existing backend capability model.
*/
static const zr_term_known_caps_t ZR_DETECT_KNOWN_CAPS[] = {
    {ZR_TERM_KITTY, 0u, 1u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 1u, 1u},
    {ZR_TERM_GHOSTTY, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 1u, 0u},
    {ZR_TERM_WEZTERM, 1u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 1u, 1u},
    {ZR_TERM_FOOT, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 0u, 0u},
    {ZR_TERM_ITERM2, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 0u, 0u, 0u},
    {ZR_TERM_VTE, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 0u, 0u, 0u},
    {ZR_TERM_KONSOLE, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 0u, 0u},
    {ZR_TERM_CONTOUR, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 1u, 0u, 0u},
    {ZR_TERM_WINDOWS_TERMINAL, 0u, 0u, 0u, 1u, 0u, 1u, 1u, 0u, 0u, 0u, 0u},
    {ZR_TERM_ALACRITTY, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 1u, 0u, 0u, 0u},
    {ZR_TERM_XTERM, 1u, 0u, 0u, 1u, 0u, 1u, 0u, 0u, 0u, 0u, 0u},
    {ZR_TERM_MINTTY, 0u, 0u, 0u, 1u, 0u, 1u, 0u, 0u, 0u, 0u, 0u},
    {ZR_TERM_TMUX, 0u, 0u, 0u, 1u, 0u, 1u, 0u, 0u, 0u, 0u, 0u},
    {ZR_TERM_SCREEN, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u},
};

static uint8_t zr_detect_ascii_lower(uint8_t c) {
  if (c >= (uint8_t)'A' && c <= (uint8_t)'Z') {
    return (uint8_t)(c + (uint8_t)('a' - 'A'));
  }
  return c;
}

static bool zr_detect_is_digit(uint8_t c) {
  return c >= (uint8_t)'0' && c <= (uint8_t)'9';
}

static bool zr_detect_parse_u32(const uint8_t* bytes, size_t len, size_t* io_i, uint32_t* out_v) {
  if (!bytes || !io_i || !out_v) {
    return false;
  }
  if (*io_i >= len || !zr_detect_is_digit(bytes[*io_i])) {
    return false;
  }

  uint32_t v = 0u;
  while (*io_i < len && zr_detect_is_digit(bytes[*io_i])) {
    const uint32_t d = (uint32_t)(bytes[*io_i] - (uint8_t)'0');
    if (v > (UINT32_MAX / 10u)) {
      return false;
    }
    if (v == (UINT32_MAX / 10u) && d > (UINT32_MAX % 10u)) {
      return false;
    }
    v = (v * 10u) + d;
    (*io_i)++;
  }

  *out_v = v;
  return true;
}

static bool zr_detect_starts_with_ci(const char* s, const char* prefix) {
  if (!s || !prefix) {
    return false;
  }

  size_t i = 0u;
  while (prefix[i] != '\0') {
    if (s[i] == '\0') {
      return false;
    }
    if (zr_detect_ascii_lower((uint8_t)s[i]) != zr_detect_ascii_lower((uint8_t)prefix[i])) {
      return false;
    }
    i++;
  }
  return true;
}

static zr_terminal_id_t zr_detect_terminal_id_from_xtversion(const char* text) {
  if (!text || text[0] == '\0') {
    return ZR_TERM_UNKNOWN;
  }
  if (zr_detect_starts_with_ci(text, "kitty(")) {
    return ZR_TERM_KITTY;
  }
  if (zr_detect_starts_with_ci(text, "ghostty")) {
    return ZR_TERM_GHOSTTY;
  }
  if (zr_detect_starts_with_ci(text, "wezterm ")) {
    return ZR_TERM_WEZTERM;
  }
  if (zr_detect_starts_with_ci(text, "foot(")) {
    return ZR_TERM_FOOT;
  }
  if (zr_detect_starts_with_ci(text, "iterm2 ")) {
    return ZR_TERM_ITERM2;
  }
  if (zr_detect_starts_with_ci(text, "vte(")) {
    return ZR_TERM_VTE;
  }
  if (zr_detect_starts_with_ci(text, "konsole ")) {
    return ZR_TERM_KONSOLE;
  }
  if (zr_detect_starts_with_ci(text, "contour")) {
    return ZR_TERM_CONTOUR;
  }
  if (zr_detect_starts_with_ci(text, "alacritty")) {
    return ZR_TERM_ALACRITTY;
  }
  if (zr_detect_starts_with_ci(text, "xterm")) {
    return ZR_TERM_XTERM;
  }
  if (zr_detect_starts_with_ci(text, "mintty")) {
    return ZR_TERM_MINTTY;
  }
  if (zr_detect_starts_with_ci(text, "tmux")) {
    return ZR_TERM_TMUX;
  }
  if (zr_detect_starts_with_ci(text, "screen")) {
    return ZR_TERM_SCREEN;
  }
  return ZR_TERM_UNKNOWN;
}

static const zr_term_known_caps_t* zr_detect_known_caps(zr_terminal_id_t id) {
  for (size_t i = 0u; i < (sizeof(ZR_DETECT_KNOWN_CAPS) / sizeof(ZR_DETECT_KNOWN_CAPS[0])); i++) {
    if (ZR_DETECT_KNOWN_CAPS[i].id == id) {
      return &ZR_DETECT_KNOWN_CAPS[i];
    }
  }
  return NULL;
}

const uint8_t* zr_detect_query_batch_bytes(size_t* out_len) {
  if (out_len) {
    *out_len = sizeof(ZR_DETECT_QUERY_BATCH) - 1u;
  }
  return ZR_DETECT_QUERY_BATCH;
}

void zr_detect_parsed_reset(zr_detect_parsed_t* out_parsed) {
  if (!out_parsed) {
    return;
  }
  memset(out_parsed, 0, sizeof(*out_parsed));
  out_parsed->xtversion_id = ZR_TERM_UNKNOWN;
}

/*
  Parse XTGETTCAP/XTVersion reply: ESC P > | ... ST.

  Why: Terminal identity from this payload helps choose stable capability
  defaults before applying optional DA/DECRQM refinements.
*/
static bool zr_detect_parse_xtversion(const uint8_t* bytes, size_t len, size_t i, size_t* out_consumed,
                                      zr_detect_parsed_t* parsed) {
  if (!bytes || !out_consumed || !parsed) {
    return false;
  }
  if ((i + 3u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'P' || bytes[i + 2u] != (uint8_t)'>' ||
      bytes[i + 3u] != (uint8_t)'|') {
    return false;
  }

  size_t text_begin = i + 4u;
  size_t term_pos = SIZE_MAX;
  size_t term_len = 0u;
  for (size_t j = text_begin; j < len; j++) {
    if (bytes[j] == 0x9Cu) {
      term_pos = j;
      term_len = 1u;
      break;
    }
    if (bytes[j] == 0x1Bu && (j + 1u) < len && bytes[j + 1u] == (uint8_t)'\\') {
      term_pos = j;
      term_len = 2u;
      break;
    }
  }
  if (term_pos == SIZE_MAX) {
    return false;
  }

  size_t text_len = term_pos - text_begin;
  if (text_len >= ZR_DETECT_VERSION_CAP) {
    text_len = ZR_DETECT_VERSION_CAP - 1u;
  }
  memset(parsed->xtversion_raw, 0, sizeof(parsed->xtversion_raw));
  if (text_len != 0u) {
    memcpy(parsed->xtversion_raw, bytes + text_begin, text_len);
  }
  parsed->xtversion_raw[text_len] = '\0';
  parsed->xtversion_id = zr_detect_terminal_id_from_xtversion(parsed->xtversion_raw);
  parsed->xtversion_responded = 1u;

  *out_consumed = (term_pos + term_len) - i;
  return true;
}

/*
  Parse DA1 reply: ESC [ ? Ps ; ... c.

  Why: We currently extract only whether capability code 4 (sixel) appears.
*/
static bool zr_detect_parse_da1(const uint8_t* bytes, size_t len, size_t i, size_t* out_consumed,
                                zr_detect_parsed_t* parsed) {
  if (!bytes || !out_consumed || !parsed) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[' || bytes[i + 2u] != (uint8_t)'?') {
    return false;
  }

  size_t j = i + 3u;
  bool saw_value = false;
  uint8_t has_sixel = 0u;
  while (j < len) {
    uint32_t value = 0u;
    if (!zr_detect_parse_u32(bytes, len, &j, &value)) {
      return false;
    }
    saw_value = true;
    if (value == 4u) {
      has_sixel = 1u;
    }

    if (j >= len) {
      return false;
    }
    if (bytes[j] == (uint8_t)'c') {
      if (!saw_value) {
        return false;
      }
      parsed->da1_responded = 1u;
      parsed->da1_has_sixel = has_sixel;
      *out_consumed = (j + 1u) - i;
      return true;
    }
    if (bytes[j] != (uint8_t)';') {
      return false;
    }
    j++;
  }

  return false;
}

/*
  Parse DA2 reply: ESC [ > Pp ; Pv ; Pc c.

  Why: Model/version values are used for deterministic profile heuristics.
*/
static bool zr_detect_parse_da2(const uint8_t* bytes, size_t len, size_t i, size_t* out_consumed,
                                zr_detect_parsed_t* parsed) {
  if (!bytes || !out_consumed || !parsed) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[' || bytes[i + 2u] != (uint8_t)'>') {
    return false;
  }

  size_t j = i + 3u;
  uint32_t model = 0u;
  uint32_t version = 0u;
  uint32_t serial = 0u;
  if (!zr_detect_parse_u32(bytes, len, &j, &model)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr_detect_parse_u32(bytes, len, &j, &version)) {
    return false;
  }
  if (j < len && bytes[j] == (uint8_t)';') {
    j++;
    if (!zr_detect_parse_u32(bytes, len, &j, &serial)) {
      return false;
    }
    (void)serial;
  }
  if (j >= len || bytes[j] != (uint8_t)'c') {
    return false;
  }

  parsed->da2_responded = 1u;
  parsed->da2_model = model;
  parsed->da2_version = version;
  *out_consumed = (j + 1u) - i;
  return true;
}

/*
  Parse DECRQM mode report: ESC [ ? mode ; value $ y.

  Why: Confirms runtime support for specific modes (sync update, bracketed
  paste, sgr-pixel mouse, etc.) instead of relying on static heuristics only.
*/
static bool zr_detect_parse_decrqm(const uint8_t* bytes, size_t len, size_t i, size_t* out_consumed,
                                   zr_detect_parsed_t* parsed) {
  if (!bytes || !out_consumed || !parsed) {
    return false;
  }
  if ((i + 2u) >= len) {
    return false;
  }
  if (bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[' || bytes[i + 2u] != (uint8_t)'?') {
    return false;
  }

  size_t j = i + 3u;
  uint32_t mode = 0u;
  uint32_t value = 0u;
  if (!zr_detect_parse_u32(bytes, len, &j, &mode)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr_detect_parse_u32(bytes, len, &j, &value)) {
    return false;
  }
  if ((j + 1u) >= len || bytes[j] != (uint8_t)'$' || bytes[j + 1u] != (uint8_t)'y') {
    return false;
  }

  if (mode == 2026u) {
    parsed->decrqm_2026_seen = 1u;
    parsed->decrqm_2026_value = (uint8_t)value;
  } else if (mode == 2027u) {
    parsed->decrqm_2027_seen = 1u;
    parsed->decrqm_2027_value = (uint8_t)value;
  } else if (mode == 1016u) {
    parsed->decrqm_1016_seen = 1u;
    parsed->decrqm_1016_value = (uint8_t)value;
  } else if (mode == 2004u) {
    parsed->decrqm_2004_seen = 1u;
    parsed->decrqm_2004_value = (uint8_t)value;
  } else {
    return false;
  }

  *out_consumed = (j + 2u) - i;
  return true;
}

static bool zr_detect_parse_window_report(const uint8_t* bytes, size_t len, size_t i, size_t* out_consumed,
                                          zr_detect_parsed_t* parsed) {
  if (!bytes || !out_consumed || !parsed) {
    return false;
  }
  if ((i + 1u) >= len || bytes[i] != 0x1Bu || bytes[i + 1u] != (uint8_t)'[') {
    return false;
  }

  size_t j = i + 2u;
  uint32_t code = 0u;
  uint32_t height = 0u;
  uint32_t width = 0u;
  if (!zr_detect_parse_u32(bytes, len, &j, &code)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr_detect_parse_u32(bytes, len, &j, &height)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)';') {
    return false;
  }
  j++;
  if (!zr_detect_parse_u32(bytes, len, &j, &width)) {
    return false;
  }
  if (j >= len || bytes[j] != (uint8_t)'t') {
    return false;
  }

  if (height <= UINT16_MAX && width <= UINT16_MAX) {
    if (code == 6u) {
      parsed->cell_height_px = (uint16_t)height;
      parsed->cell_width_px = (uint16_t)width;
    } else if (code == 4u) {
      parsed->screen_height_px = (uint16_t)height;
      parsed->screen_width_px = (uint16_t)width;
    } else {
      return false;
    }
  }

  *out_consumed = (j + 1u) - i;
  return true;
}

static void zr_detect_mark_consumed(uint8_t* out_mask, size_t mask_cap, size_t begin, size_t len) {
  if (!out_mask || len == 0u || begin >= mask_cap) {
    return;
  }
  size_t n = len;
  if (n > (mask_cap - begin)) {
    n = mask_cap - begin;
  }
  memset(out_mask + begin, 1, n);
}

typedef bool (*zr_detect_parser_fn)(const uint8_t*, size_t, size_t, size_t*, zr_detect_parsed_t*);

/*
  Run one parser and update scan position + consumed mask consistently.

  Returns true when parser matched (even if consumed length was invalid and the
  caller should advance by one byte as recovery), false when parser did not match.
*/
static bool zr_detect_try_parse_response(const uint8_t* bytes, size_t len, size_t i, zr_detect_parsed_t* parsed,
                                         uint8_t* out_consumed_mask, size_t consumed_mask_cap,
                                         zr_detect_parser_fn parser, size_t* out_next) {
  if (!bytes || !parsed || !parser || !out_next || i >= len) {
    return false;
  }

  size_t consumed = 0u;
  if (!parser(bytes, len, i, &consumed, parsed)) {
    return false;
  }

  if (consumed == 0u || consumed > (len - i)) {
    *out_next = i + 1u;
    return true;
  }

  zr_detect_mark_consumed(out_consumed_mask, consumed_mask_cap, i, consumed);
  *out_next = i + consumed;
  return true;
}

static zr_result_t zr_detect_parse_responses_impl(const uint8_t* bytes, size_t len, zr_detect_parsed_t* io_parsed,
                                                  uint8_t* out_consumed_mask, size_t consumed_mask_cap) {
  if (!io_parsed) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!bytes && len != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  size_t i = 0u;
  while (i < len) {
    if (bytes[i] != 0x1Bu) {
      i++;
      continue;
    }

    size_t next = i;
    if (zr_detect_try_parse_response(bytes, len, i, io_parsed, out_consumed_mask, consumed_mask_cap,
                                     zr_detect_parse_xtversion, &next) ||
        zr_detect_try_parse_response(bytes, len, i, io_parsed, out_consumed_mask, consumed_mask_cap,
                                     zr_detect_parse_decrqm, &next) ||
        zr_detect_try_parse_response(bytes, len, i, io_parsed, out_consumed_mask, consumed_mask_cap,
                                     zr_detect_parse_da2, &next) ||
        zr_detect_try_parse_response(bytes, len, i, io_parsed, out_consumed_mask, consumed_mask_cap,
                                     zr_detect_parse_da1, &next) ||
        zr_detect_try_parse_response(bytes, len, i, io_parsed, out_consumed_mask, consumed_mask_cap,
                                     zr_detect_parse_window_report, &next)) {
      i = next;
      continue;
    }

    i++;
  }

  return ZR_OK;
}

zr_result_t zr_detect_parse_responses(const uint8_t* bytes, size_t len, zr_detect_parsed_t* io_parsed) {
  return zr_detect_parse_responses_impl(bytes, len, io_parsed, NULL, 0u);
}

static uint8_t zr_detect_mode_enabled(uint8_t seen, uint8_t value, uint8_t fallback) {
  if (seen == 0u) {
    return fallback;
  }
  return value == ZR_DETECT_DECRQM_SET;
}

static void zr_detect_profile_defaults_from_caps(const plat_caps_t* caps, zr_terminal_profile_t* out_profile) {
  if (!caps || !out_profile) {
    return;
  }
  memset(out_profile, 0, sizeof(*out_profile));
  out_profile->id = ZR_TERM_UNKNOWN;
  out_profile->supports_mouse = caps->supports_mouse;
  out_profile->supports_bracketed_paste = caps->supports_bracketed_paste;
  out_profile->supports_focus_events = caps->supports_focus_events;
  out_profile->supports_osc52 = caps->supports_osc52;
  out_profile->supports_sync_update = caps->supports_sync_update;
}

static void zr_detect_apply_known_caps(zr_terminal_profile_t* profile, const zr_term_known_caps_t* known) {
  if (!profile || !known) {
    return;
  }
  profile->supports_sixel = known->supports_sixel;
  profile->supports_kitty_graphics = known->supports_kitty_graphics;
  profile->supports_iterm2_images = known->supports_iterm2_images;
  profile->supports_underline_styles = known->supports_underline_styles;
  profile->supports_colored_underlines = known->supports_colored_underlines;
  profile->supports_hyperlinks = known->supports_hyperlinks;
  profile->supports_grapheme_clusters = known->supports_grapheme_clusters;
  profile->supports_overline = known->supports_overline;
  profile->supports_pixel_mouse = known->supports_pixel_mouse;
  profile->supports_kitty_keyboard = known->supports_kitty_keyboard;
  profile->supports_sync_update = known->supports_sync_update;
}

static void zr_detect_apply_parsed(zr_terminal_profile_t* profile, const zr_detect_parsed_t* parsed) {
  if (!profile || !parsed) {
    return;
  }

  profile->xtversion_responded = parsed->xtversion_responded;
  profile->da1_responded = parsed->da1_responded;
  profile->da2_responded = parsed->da2_responded;

  if (parsed->da1_responded != 0u) {
    /* DA1 is authoritative when present: Ps=4 means sixel is available. */
    profile->supports_sixel = (uint8_t)(parsed->da1_has_sixel != 0u);
  }

  profile->supports_sync_update =
      zr_detect_mode_enabled(parsed->decrqm_2026_seen, parsed->decrqm_2026_value, profile->supports_sync_update);
  profile->supports_grapheme_clusters =
      zr_detect_mode_enabled(parsed->decrqm_2027_seen, parsed->decrqm_2027_value, profile->supports_grapheme_clusters);
  profile->supports_pixel_mouse =
      zr_detect_mode_enabled(parsed->decrqm_1016_seen, parsed->decrqm_1016_value, profile->supports_pixel_mouse);
  profile->supports_bracketed_paste =
      zr_detect_mode_enabled(parsed->decrqm_2004_seen, parsed->decrqm_2004_value, profile->supports_bracketed_paste);

  profile->cell_width_px = parsed->cell_width_px;
  profile->cell_height_px = parsed->cell_height_px;
  profile->screen_width_px = parsed->screen_width_px;
  profile->screen_height_px = parsed->screen_height_px;
}

zr_terminal_cap_flags_t zr_detect_profile_cap_flags(const zr_terminal_profile_t* profile, const plat_caps_t* caps) {
  if (!profile || !caps) {
    return 0u;
  }

  zr_terminal_cap_flags_t flags = 0u;
  if (profile->supports_sixel != 0u) {
    flags |= ZR_TERM_CAP_SIXEL;
  }
  if (profile->supports_kitty_graphics != 0u) {
    flags |= ZR_TERM_CAP_KITTY_GRAPHICS;
  }
  if (profile->supports_iterm2_images != 0u) {
    flags |= ZR_TERM_CAP_ITERM2_IMAGES;
  }
  if (profile->supports_underline_styles != 0u) {
    flags |= ZR_TERM_CAP_UNDERLINE_STYLES;
  }
  if (profile->supports_colored_underlines != 0u) {
    flags |= ZR_TERM_CAP_COLORED_UNDERLINES;
  }
  if (profile->supports_hyperlinks != 0u) {
    flags |= ZR_TERM_CAP_HYPERLINKS;
  }
  if (profile->supports_grapheme_clusters != 0u) {
    flags |= ZR_TERM_CAP_GRAPHEME_CLUSTERS;
  }
  if (profile->supports_overline != 0u) {
    flags |= ZR_TERM_CAP_OVERLINE;
  }
  if (profile->supports_pixel_mouse != 0u) {
    flags |= ZR_TERM_CAP_PIXEL_MOUSE;
  }
  if (profile->supports_kitty_keyboard != 0u) {
    flags |= ZR_TERM_CAP_KITTY_KEYBOARD;
  }
  if (caps->supports_mouse != 0u) {
    flags |= ZR_TERM_CAP_MOUSE;
  }
  if (caps->supports_bracketed_paste != 0u) {
    flags |= ZR_TERM_CAP_BRACKETED_PASTE;
  }
  if (caps->supports_focus_events != 0u) {
    flags |= ZR_TERM_CAP_FOCUS_EVENTS;
  }
  if (caps->supports_osc52 != 0u) {
    flags |= ZR_TERM_CAP_OSC52;
  }
  if (caps->supports_sync_update != 0u) {
    flags |= ZR_TERM_CAP_SYNC_UPDATE;
  }
  if (caps->supports_scroll_region != 0u) {
    flags |= ZR_TERM_CAP_SCROLL_REGION;
  }
  if (caps->supports_cursor_shape != 0u) {
    flags |= ZR_TERM_CAP_CURSOR_SHAPE;
  }
  if (caps->supports_output_wait_writable != 0u) {
    flags |= ZR_TERM_CAP_OUTPUT_WAIT_WRITABLE;
  }
  return flags;
}

/*
  Apply normalized capability bit flags into profile + caps mirrors.

  Why: Keeps bit-to-field wiring explicit and in one place so ABI-facing cap
  layout changes remain easy to audit.
*/
static void zr_detect_apply_flags(zr_terminal_profile_t* profile, plat_caps_t* caps, zr_terminal_cap_flags_t flags) {
  if (!profile || !caps) {
    return;
  }

  profile->supports_sixel = (uint8_t)((flags & ZR_TERM_CAP_SIXEL) != 0u);
  profile->supports_kitty_graphics = (uint8_t)((flags & ZR_TERM_CAP_KITTY_GRAPHICS) != 0u);
  profile->supports_iterm2_images = (uint8_t)((flags & ZR_TERM_CAP_ITERM2_IMAGES) != 0u);
  profile->supports_underline_styles = (uint8_t)((flags & ZR_TERM_CAP_UNDERLINE_STYLES) != 0u);
  profile->supports_colored_underlines = (uint8_t)((flags & ZR_TERM_CAP_COLORED_UNDERLINES) != 0u);
  profile->supports_hyperlinks = (uint8_t)((flags & ZR_TERM_CAP_HYPERLINKS) != 0u);
  profile->supports_grapheme_clusters = (uint8_t)((flags & ZR_TERM_CAP_GRAPHEME_CLUSTERS) != 0u);
  profile->supports_overline = (uint8_t)((flags & ZR_TERM_CAP_OVERLINE) != 0u);
  profile->supports_pixel_mouse = (uint8_t)((flags & ZR_TERM_CAP_PIXEL_MOUSE) != 0u);
  profile->supports_kitty_keyboard = (uint8_t)((flags & ZR_TERM_CAP_KITTY_KEYBOARD) != 0u);

  caps->supports_mouse = (uint8_t)((flags & ZR_TERM_CAP_MOUSE) != 0u);
  caps->supports_bracketed_paste = (uint8_t)((flags & ZR_TERM_CAP_BRACKETED_PASTE) != 0u);
  caps->supports_focus_events = (uint8_t)((flags & ZR_TERM_CAP_FOCUS_EVENTS) != 0u);
  caps->supports_osc52 = (uint8_t)((flags & ZR_TERM_CAP_OSC52) != 0u);
  caps->supports_sync_update = (uint8_t)((flags & ZR_TERM_CAP_SYNC_UPDATE) != 0u);
  caps->supports_scroll_region = (uint8_t)((flags & ZR_TERM_CAP_SCROLL_REGION) != 0u);
  caps->supports_cursor_shape = (uint8_t)((flags & ZR_TERM_CAP_CURSOR_SHAPE) != 0u);
  caps->supports_output_wait_writable = (uint8_t)((flags & ZR_TERM_CAP_OUTPUT_WAIT_WRITABLE) != 0u);

  profile->supports_mouse = caps->supports_mouse;
  profile->supports_bracketed_paste = caps->supports_bracketed_paste;
  profile->supports_focus_events = caps->supports_focus_events;
  profile->supports_osc52 = caps->supports_osc52;
  profile->supports_sync_update = caps->supports_sync_update;
  if (caps->supports_mouse == 0u) {
    profile->supports_pixel_mouse = 0u;
  }
}

void zr_detect_apply_overrides(const zr_terminal_profile_t* base_profile, const plat_caps_t* base_caps,
                               zr_terminal_cap_flags_t force_flags, zr_terminal_cap_flags_t suppress_flags,
                               zr_terminal_profile_t* out_profile, plat_caps_t* out_caps) {
  if (!base_profile || !base_caps || !out_profile || !out_caps) {
    return;
  }

  *out_profile = *base_profile;
  *out_caps = *base_caps;

  const zr_terminal_cap_flags_t clamped_force = force_flags & ZR_TERM_CAP_ALL_MASK;
  const zr_terminal_cap_flags_t clamped_suppress = suppress_flags & ZR_TERM_CAP_ALL_MASK;
  const zr_terminal_cap_flags_t detected = zr_detect_profile_cap_flags(base_profile, base_caps);
  const zr_terminal_cap_flags_t effective = (detected | clamped_force) & (~clamped_suppress & ZR_TERM_CAP_ALL_MASK);

  zr_detect_apply_flags(out_profile, out_caps, effective);
}

static int32_t zr_detect_remaining_timeout(uint64_t start_ms) {
  const uint64_t now_ms = plat_now_ms();
  if (now_ms < start_ms) {
    return (int32_t)ZR_DETECT_TOTAL_TIMEOUT_MS;
  }
  const uint64_t elapsed = now_ms - start_ms;
  if (elapsed >= (uint64_t)ZR_DETECT_TOTAL_TIMEOUT_MS) {
    return 0;
  }
  return (int32_t)((uint64_t)ZR_DETECT_TOTAL_TIMEOUT_MS - elapsed);
}

static int32_t zr_detect_remaining_timeout_budget(uint32_t spent_ms) {
  if (spent_ms >= (uint32_t)ZR_DETECT_TOTAL_TIMEOUT_MS) {
    return 0;
  }
  return (int32_t)((uint32_t)ZR_DETECT_TOTAL_TIMEOUT_MS - spent_ms);
}

static int32_t zr_detect_read_timeout_slice(uint64_t start_ms, uint32_t spent_ms) {
  int32_t remaining = zr_detect_remaining_timeout(start_ms);
  const int32_t remaining_budget = zr_detect_remaining_timeout_budget(spent_ms);
  if (remaining > remaining_budget) {
    remaining = remaining_budget;
  }
  if (remaining <= 0) {
    return 0;
  }
  if (remaining > (int32_t)ZR_DETECT_QUERY_TIMEOUT_MS) {
    return (int32_t)ZR_DETECT_QUERY_TIMEOUT_MS;
  }
  return remaining;
}

static zr_terminal_id_t zr_detect_fallback_terminal_id(plat_t* plat) {
  zr_terminal_id_t id = ZR_TERM_UNKNOWN;
  if (plat_guess_terminal_id(plat, &id) != ZR_OK) {
    return ZR_TERM_UNKNOWN;
  }
  return id;
}

static void zr_detect_build_profile(const zr_detect_parsed_t* parsed, zr_terminal_id_t fallback_id,
                                    const plat_caps_t* baseline_caps, zr_terminal_profile_t* out_profile,
                                    plat_caps_t* out_caps) {
  if (!parsed || !baseline_caps || !out_profile || !out_caps) {
    return;
  }

  zr_detect_profile_defaults_from_caps(baseline_caps, out_profile);
  *out_caps = *baseline_caps;

  if (parsed->xtversion_responded != 0u) {
    out_profile->id = parsed->xtversion_id;
    memcpy(out_profile->version_string, parsed->xtversion_raw, sizeof(out_profile->version_string));
    out_profile->version_string[sizeof(out_profile->version_string) - 1u] = '\0';
  } else {
    out_profile->id = fallback_id;
  }

  const zr_term_known_caps_t* known = zr_detect_known_caps(out_profile->id);
  if (known) {
    zr_detect_apply_known_caps(out_profile, known);
  }

  zr_detect_apply_parsed(out_profile, parsed);

  out_caps->supports_mouse = out_profile->supports_mouse;
  out_caps->supports_bracketed_paste = out_profile->supports_bracketed_paste;
  out_caps->supports_focus_events = out_profile->supports_focus_events;
  out_caps->supports_osc52 = out_profile->supports_osc52;
  out_caps->supports_sync_update = out_profile->supports_sync_update;
}

static size_t zr_detect_copy_passthrough_bytes(const uint8_t* bytes, const uint8_t* consumed_mask, size_t len,
                                               uint8_t* out_passthrough, size_t passthrough_cap) {
  if (!bytes) {
    return 0u;
  }
  if (!out_passthrough && passthrough_cap != 0u) {
    return 0u;
  }

  size_t out_len = 0u;
  for (size_t i = 0u; i < len; i++) {
    if (consumed_mask && consumed_mask[i] != 0u) {
      continue;
    }
    if (out_len >= passthrough_cap) {
      break;
    }
    if (out_passthrough) {
      out_passthrough[out_len] = bytes[i];
    }
    out_len++;
  }
  return out_len;
}

zr_result_t zr_detect_probe_terminal(plat_t* plat, const plat_caps_t* baseline_caps, zr_terminal_profile_t* out_profile,
                                     plat_caps_t* out_caps, uint8_t* out_passthrough, size_t passthrough_cap,
                                     size_t* out_passthrough_len) {
  if (!plat || !baseline_caps || !out_profile || !out_caps) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_passthrough_len) {
    *out_passthrough_len = 0u;
  }

  zr_detect_parsed_t parsed;
  zr_detect_parsed_reset(&parsed);

  size_t query_len = 0u;
  const uint8_t* query_bytes = zr_detect_query_batch_bytes(&query_len);

  uint8_t collected[ZR_DETECT_READ_ACCUM_CAP];
  uint8_t consumed_mask[ZR_DETECT_READ_ACCUM_CAP];
  size_t collected_len = 0u;
  memset(consumed_mask, 0, sizeof(consumed_mask));

  if (plat_supports_terminal_queries(plat) != 0u) {
    (void)plat_write_output(plat, query_bytes, (int32_t)query_len);

    uint64_t start_ms = plat_now_ms();
    uint32_t timeout_spent_ms = 0u;
    while (true) {
      const int32_t timeout_ms = zr_detect_read_timeout_slice(start_ms, timeout_spent_ms);
      if (timeout_ms <= 0) {
        break;
      }

      uint8_t chunk[ZR_DETECT_READ_CHUNK_CAP];
      const int32_t n = plat_read_input_timed(plat, chunk, (int32_t)sizeof(chunk), timeout_ms);
      if (n < 0) {
        break;
      }
      if (n == 0) {
        timeout_spent_ms += (uint32_t)timeout_ms;
        continue;
      }

      size_t copy_len = (size_t)n;
      if (copy_len > (sizeof(collected) - collected_len)) {
        copy_len = sizeof(collected) - collected_len;
      }
      if (copy_len != 0u) {
        memcpy(collected + collected_len, chunk, copy_len);
        collected_len += copy_len;
      }
      if (collected_len == sizeof(collected)) {
        break;
      }
    }
  }

  (void)zr_detect_parse_responses_impl(collected, collected_len, &parsed, consumed_mask, sizeof(consumed_mask));
  const size_t passthrough_len =
      zr_detect_copy_passthrough_bytes(collected, consumed_mask, collected_len, out_passthrough, passthrough_cap);
  if (out_passthrough_len) {
    *out_passthrough_len = passthrough_len;
  }

  const zr_terminal_id_t fallback_id = (parsed.xtversion_responded != 0u || plat_supports_terminal_queries(plat) == 0u)
                                           ? ZR_TERM_UNKNOWN
                                           : zr_detect_fallback_terminal_id(plat);

  zr_detect_build_profile(&parsed, fallback_id, baseline_caps, out_profile, out_caps);
  return ZR_OK;
}
