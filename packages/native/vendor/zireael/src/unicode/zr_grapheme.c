/*
  src/unicode/zr_grapheme.c — Deterministic grapheme cluster iteration (UAX #29 subset).

  Why: Enables grapheme-safe width and wrapping with a strict progress and
  bounds-safety contract, even for malformed UTF-8.
*/

#include "unicode/zr_grapheme.h"

#include "unicode/zr_unicode_data.h"
#include "unicode/zr_utf8.h"

static bool zr_grapheme_is_control(zr_gcb_class_t c) {
  return c == ZR_GCB_CONTROL || c == ZR_GCB_CR || c == ZR_GCB_LF;
}

static bool zr_grapheme_is_hangul_l(zr_gcb_class_t c) {
  return c == ZR_GCB_L;
}
static bool zr_grapheme_is_hangul_v(zr_gcb_class_t c) {
  return c == ZR_GCB_V;
}
static bool zr_grapheme_is_hangul_t(zr_gcb_class_t c) {
  return c == ZR_GCB_T;
}
static bool zr_grapheme_is_hangul_lv(zr_gcb_class_t c) {
  return c == ZR_GCB_LV;
}
static bool zr_grapheme_is_hangul_lvt(zr_gcb_class_t c) {
  return c == ZR_GCB_LVT;
}

static bool zr_grapheme_should_break(zr_gcb_class_t prev_class, bool prev_zwj_after_ep, uint32_t ri_run,
                                     zr_gcb_class_t next_class, bool next_is_ep) {
  /*
    Implemented UAX #29 rules (Unicode 15.1.0, core set):
      - GB3: CR x LF
      - GB4/GB5: break around controls
      - GB6/7/8: Hangul syllable sequences
      - GB9/9a/9b/9c: x Extend / SpacingMark / Prepend x / x ZWJ
      - GB11: EP Extend* ZWJ x EP
      - GB12/GB13: RI pairs
      - otherwise: break
  */

  if (prev_class == ZR_GCB_CR && next_class == ZR_GCB_LF) {
    return false;
  }

  if (zr_grapheme_is_control(prev_class)) {
    return true;
  }
  if (zr_grapheme_is_control(next_class)) {
    return true;
  }

  /* GB6: L x (L|V|LV|LVT) */
  if (zr_grapheme_is_hangul_l(prev_class) &&
      (zr_grapheme_is_hangul_l(next_class) || zr_grapheme_is_hangul_v(next_class) ||
       zr_grapheme_is_hangul_lv(next_class) || zr_grapheme_is_hangul_lvt(next_class))) {
    return false;
  }

  /* GB7: (LV|V) x (V|T) */
  if ((zr_grapheme_is_hangul_lv(prev_class) || zr_grapheme_is_hangul_v(prev_class)) &&
      (zr_grapheme_is_hangul_v(next_class) || zr_grapheme_is_hangul_t(next_class))) {
    return false;
  }

  /* GB8: (LVT|T) x T */
  if ((zr_grapheme_is_hangul_lvt(prev_class) || zr_grapheme_is_hangul_t(prev_class)) &&
      zr_grapheme_is_hangul_t(next_class)) {
    return false;
  }

  /* GB9: x Extend */
  if (next_class == ZR_GCB_EXTEND) {
    return false;
  }

  /* GB9a: x SpacingMark */
  if (next_class == ZR_GCB_SPACINGMARK) {
    return false;
  }

  /* GB9b: Prepend x */
  if (prev_class == ZR_GCB_PREPEND) {
    return false;
  }

  /* GB9c: x ZWJ */
  if (next_class == ZR_GCB_ZWJ) {
    return false;
  }

  /* GB11: ... ZWJ x EP when that immediate ZWJ is preceded by EP (ignoring Extend). */
  if (prev_class == ZR_GCB_ZWJ && next_is_ep && prev_zwj_after_ep) {
    return false;
  }

  /* GB12/13: Pair regional indicators. */
  if (prev_class == ZR_GCB_REGIONAL_INDICATOR && next_class == ZR_GCB_REGIONAL_INDICATOR) {
    /*
      Within a run of RI, group into pairs:
        RI RI | RI RI | ...
      No-break when the count of RI seen in the current cluster so far is odd.
    */
    return (ri_run % 2u) == 0u;
  }

  return true;
}

typedef struct zr_grapheme_cp_t {
  uint8_t size;
  zr_gcb_class_t gcb_class;
  bool is_extended_pictographic;
} zr_grapheme_cp_t;

typedef struct zr_grapheme_break_state_t {
  zr_gcb_class_t prev_class;
  uint32_t ri_run;
  bool last_non_extend_is_ep;
  bool prev_zwj_after_ep;
} zr_grapheme_break_state_t;

/* Decode one scalar at byte offset and project it to grapheme boundary inputs. */
static bool zr_grapheme_decode_cp(const zr_grapheme_iter_t* it, size_t off, zr_grapheme_cp_t* out_cp) {
  if (!it || !out_cp) {
    return false;
  }
  if (off >= it->len || !it->bytes) {
    return false;
  }

  const zr_utf8_decode_result_t dec = zr_utf8_decode_one(it->bytes + off, it->len - off);
  if (dec.size == 0u) {
    return false;
  }

  out_cp->size = dec.size;
  out_cp->gcb_class = zr_unicode_gcb_class(dec.scalar);
  out_cp->is_extended_pictographic = zr_unicode_is_extended_pictographic(dec.scalar);
  return true;
}

/*
  Initialize GB11/RI tracking for the first scalar of a cluster.

  Why: The boundary predicate is stateless; this object carries the minimal
  context needed to evaluate the next boundary deterministically.
*/
static void zr_grapheme_state_init(zr_grapheme_break_state_t* state, const zr_grapheme_cp_t* first) {
  if (!state || !first) {
    return;
  }

  state->prev_class = first->gcb_class;
  state->ri_run = (first->gcb_class == ZR_GCB_REGIONAL_INDICATOR) ? 1u : 0u;
  state->last_non_extend_is_ep = (first->gcb_class != ZR_GCB_EXTEND) ? first->is_extended_pictographic : false;
  state->prev_zwj_after_ep = (first->gcb_class == ZR_GCB_ZWJ) ? state->last_non_extend_is_ep : false;
}

/* Advance GB11/RI tracking after accepting one more scalar into the cluster. */
static void zr_grapheme_state_advance(zr_grapheme_break_state_t* state, const zr_grapheme_cp_t* cp) {
  if (!state || !cp) {
    return;
  }

  if (cp->gcb_class == ZR_GCB_REGIONAL_INDICATOR) {
    state->ri_run++;
  } else {
    state->ri_run = 0u;
  }

  if (cp->gcb_class == ZR_GCB_ZWJ && state->last_non_extend_is_ep) {
    state->prev_zwj_after_ep = true;
  } else if (cp->gcb_class != ZR_GCB_EXTEND) {
    state->prev_zwj_after_ep = false;
  }
  if (cp->gcb_class != ZR_GCB_EXTEND) {
    state->last_non_extend_is_ep = cp->is_extended_pictographic;
  }

  state->prev_class = cp->gcb_class;
}

void zr_grapheme_iter_init(zr_grapheme_iter_t* it, const uint8_t* bytes, size_t len) {
  if (!it) {
    return;
  }
  it->bytes = bytes;
  it->len = len;
  it->off = 0u;
}

/* Advance iterator to next grapheme cluster; returns false when exhausted. */
bool zr_grapheme_next(zr_grapheme_iter_t* it, zr_grapheme_t* out) {
  if (!it || !out) {
    return false;
  }
  if (it->off >= it->len) {
    return false;
  }
  if (!it->bytes) {
    return false;
  }

  const size_t start = it->off;

  zr_grapheme_cp_t first_cp;
  if (!zr_grapheme_decode_cp(it, it->off, &first_cp)) {
    return false;
  }
  it->off += (size_t)first_cp.size;

  zr_grapheme_break_state_t state;
  zr_grapheme_state_init(&state, &first_cp);

  while (it->off < it->len) {
    zr_grapheme_cp_t next_cp;
    if (!zr_grapheme_decode_cp(it, it->off, &next_cp)) {
      break;
    }

    if (zr_grapheme_should_break(state.prev_class, state.prev_zwj_after_ep, state.ri_run, next_cp.gcb_class,
                                 next_cp.is_extended_pictographic)) {
      break;
    }

    it->off += (size_t)next_cp.size;
    zr_grapheme_state_advance(&state, &next_cp);
  }

  out->offset = start;
  out->size = it->off - start;
  return true;
}
