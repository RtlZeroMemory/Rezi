/*
  src/unicode/zr_wrap.c — Deterministic UTF-8 measurement and wrapping.

  Why: Ensures stable layout decisions (measure + wrap) across platforms by
  using grapheme iteration, pinned width policy, and deterministic TAB rules.
*/

#include "unicode/zr_wrap.h"

#include "unicode/zr_grapheme.h"
#include "unicode/zr_utf8.h"

enum {
  ZR_WRAP_SCALAR_SPACE = 0x20u,
  ZR_WRAP_SCALAR_TAB = 0x09u,
  ZR_WRAP_SCALAR_LF = 0x0Au,
  ZR_WRAP_SCALAR_CR = 0x0Du,
};

#define ZR_WRAP_NO_BREAK ((size_t)(-1))

static bool zr_wrap_is_space_grapheme(const uint8_t* bytes, size_t len) {
  zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes, len);
  return d.valid != 0u && d.scalar == ZR_WRAP_SCALAR_SPACE;
}

static bool zr_wrap_is_tab_grapheme(const uint8_t* bytes, size_t len) {
  zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes, len);
  return d.valid != 0u && d.scalar == ZR_WRAP_SCALAR_TAB;
}

static bool zr_wrap_is_hard_break_grapheme(const uint8_t* bytes, size_t len) {
  zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes, len);
  if (d.valid == 0u) {
    return false;
  }
  if (d.scalar == ZR_WRAP_SCALAR_LF || d.scalar == ZR_WRAP_SCALAR_CR) {
    return true;
  }
  return false;
}

static uint32_t zr_wrap_tab_advance(uint32_t col, uint32_t tab_stop) {
  const uint32_t rem = col % tab_stop;
  return (rem == 0u) ? tab_stop : (tab_stop - rem);
}

static void zr_wrap_push_offset(size_t off, size_t* out_offsets, size_t out_cap, size_t* io_count, bool* io_trunc) {
  const size_t idx = *io_count;
  if (idx < out_cap) {
    out_offsets[idx] = off;
  } else {
    *io_trunc = true;
  }
  *io_count = idx + 1u;
}

/* Measure UTF-8 text dimensions (line count and max column width) with tab expansion. */
zr_result_t zr_measure_utf8(const uint8_t* bytes, size_t len, zr_width_policy_t policy, uint32_t tab_stop,
                            zr_measure_utf8_t* out) {
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  out->lines = 1u;
  out->max_cols = 0u;

  if (tab_stop == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (len == 0u) {
    return ZR_OK;
  }
  if (!bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_grapheme_iter_t it;
  zr_grapheme_iter_init(&it, bytes, len);

  uint32_t col = 0u;
  zr_grapheme_t g;
  while (zr_grapheme_next(&it, &g)) {
    const uint8_t* gb = bytes + g.offset;
    const size_t gl = g.size;

    if (zr_wrap_is_hard_break_grapheme(gb, gl)) {
      if (col > out->max_cols) {
        out->max_cols = col;
      }
      col = 0u;
      out->lines++;
      continue;
    }

    if (zr_wrap_is_tab_grapheme(gb, gl)) {
      col += zr_wrap_tab_advance(col, tab_stop);
      continue;
    }

    col += (uint32_t)zr_width_grapheme_utf8(gb, gl, policy);
  }

  if (col > out->max_cols) {
    out->max_cols = col;
  }

  return ZR_OK;
}

/* Compute greedy line-break offsets for UTF-8 text within max_cols, preferring whitespace breaks. */
zr_result_t zr_wrap_greedy_utf8(const uint8_t* bytes, size_t len, uint32_t max_cols, zr_width_policy_t policy,
                                uint32_t tab_stop, size_t* out_offsets, size_t out_offsets_cap, size_t* out_count,
                                bool* out_truncated) {
  if (!out_count || !out_truncated) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_count = 0u;
  *out_truncated = false;

  if (tab_stop == 0u || max_cols == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!out_offsets && out_offsets_cap != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!bytes && len != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* Always emit the first line start at offset 0. */
  zr_wrap_push_offset(0u, out_offsets, out_offsets_cap, out_count, out_truncated);
  if (len == 0u) {
    return ZR_OK;
  }

  zr_grapheme_iter_t it;
  zr_grapheme_iter_init(&it, bytes, len);

  size_t line_start = 0u;
  uint32_t col = 0u;

  size_t last_ws_break_off = ZR_WRAP_NO_BREAK;

  zr_grapheme_t g;
  while (zr_grapheme_next(&it, &g)) {
    const uint8_t* gb = bytes + g.offset;
    const size_t gl = g.size;

    if (zr_wrap_is_hard_break_grapheme(gb, gl)) {
      line_start = g.offset + g.size;
      col = 0u;
      last_ws_break_off = ZR_WRAP_NO_BREAK;
      zr_wrap_push_offset(line_start, out_offsets, out_offsets_cap, out_count, out_truncated);
      continue;
    }

    uint32_t adv = 0u;
    bool is_ws_break = false;
    if (zr_wrap_is_tab_grapheme(gb, gl)) {
      adv = zr_wrap_tab_advance(col, tab_stop);
      is_ws_break = true;
    } else {
      adv = (uint32_t)zr_width_grapheme_utf8(gb, gl, policy);
      if (zr_wrap_is_space_grapheme(gb, gl)) {
        is_ws_break = true;
      }
    }

    if (adv == 0u) {
      /* Zero-width grapheme: always include. */
      continue;
    }

    /*
      If a whitespace grapheme would overflow, drop it and start a new line
      after it. This avoids producing lines that begin with whitespace when the
      preceding line is already full.
    */
    if (is_ws_break && col + adv > max_cols) {
      line_start = g.offset + g.size;
      col = 0u;
      last_ws_break_off = ZR_WRAP_NO_BREAK;
      zr_wrap_push_offset(line_start, out_offsets, out_offsets_cap, out_count, out_truncated);
      continue;
    }

    if (col + adv <= max_cols) {
      col += adv;
      if (is_ws_break) {
        last_ws_break_off = g.offset + g.size;
      }
      continue;
    }

    /* Overflow: prefer breaking after the last whitespace. */
    if (last_ws_break_off != ZR_WRAP_NO_BREAK && last_ws_break_off > line_start) {
      it.off = last_ws_break_off;
      line_start = last_ws_break_off;
      col = 0u;
      last_ws_break_off = ZR_WRAP_NO_BREAK;
      zr_wrap_push_offset(line_start, out_offsets, out_offsets_cap, out_count, out_truncated);
      continue;
    }

    /*
      No whitespace break available: break before the current grapheme.
      Ensure progress if a single grapheme is wider than max_cols by forcing it
      onto an empty line.
    */
    if (g.offset == line_start) {
      col = adv;
      continue;
    }

    it.off = g.offset;
    line_start = g.offset;
    col = 0u;
    last_ws_break_off = ZR_WRAP_NO_BREAK;
    zr_wrap_push_offset(line_start, out_offsets, out_offsets_cap, out_count, out_truncated);
  }

  return ZR_OK;
}
