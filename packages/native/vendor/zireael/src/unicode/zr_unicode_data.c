/*
  src/unicode/zr_unicode_data.c — Pinned Unicode 15.1.0 property tables.

  Why: Implements deterministic property lookups without heap allocation.
  Tables are generated from the pinned Unicode 15.1.0 UCD sources.
*/

#include "unicode/zr_unicode_data.h"

typedef struct zr_unicode_range8_t {
  uint32_t lo;
  uint32_t hi;
  uint8_t v;
  uint8_t _pad0[3];
} zr_unicode_range8_t;

typedef struct zr_unicode_range_t {
  uint32_t lo;
  uint32_t hi;
} zr_unicode_range_t;

/* Generated tables (Unicode 15.1.0). */
#include "unicode/zr_unicode_data_tables_15_1_0.inc"

static uint32_t zr_unicode_ranges8_count(void) {
  return (uint32_t)(sizeof(kGcbRanges) / sizeof(kGcbRanges[0]));
}
static uint32_t zr_unicode_ep_count(void) {
  return (uint32_t)(sizeof(kExtendedPictographicRanges) / sizeof(kExtendedPictographicRanges[0]));
}
static uint32_t zr_unicode_emoji_presentation_count(void) {
  return (uint32_t)(sizeof(kEmojiPresentationRanges) / sizeof(kEmojiPresentationRanges[0]));
}
static uint32_t zr_unicode_eaw_wide_count(void) {
  return (uint32_t)(sizeof(kEawWideRanges) / sizeof(kEawWideRanges[0]));
}

/* Standard binary search over sorted inclusive [lo, hi] ranges. */
static bool zr_unicode_in_ranges(const zr_unicode_range_t* ranges, uint32_t n, uint32_t scalar) {
  uint32_t lo = 0u;
  uint32_t hi = n;
  while (lo < hi) {
    const uint32_t mid = lo + (hi - lo) / 2u;
    const zr_unicode_range_t r = ranges[mid];
    if (scalar < r.lo) {
      hi = mid;
      continue;
    }
    if (scalar > r.hi) {
      lo = mid + 1u;
      continue;
    }
    return true;
  }
  return false;
}

/* Binary search variant returning an 8-bit payload for the matching range. */
static zr_gcb_class_t zr_unicode_ranges8_lookup(const zr_unicode_range8_t* ranges, uint32_t n, uint32_t scalar) {
  uint32_t lo = 0u;
  uint32_t hi = n;
  while (lo < hi) {
    const uint32_t mid = lo + (hi - lo) / 2u;
    const zr_unicode_range8_t r = ranges[mid];
    if (scalar < r.lo) {
      hi = mid;
      continue;
    }
    if (scalar > r.hi) {
      lo = mid + 1u;
      continue;
    }
    return (zr_gcb_class_t)r.v;
  }
  return ZR_GCB_OTHER;
}

zr_gcb_class_t zr_unicode_gcb_class(uint32_t scalar) {
  return zr_unicode_ranges8_lookup(kGcbRanges, zr_unicode_ranges8_count(), scalar);
}

bool zr_unicode_is_extended_pictographic(uint32_t scalar) {
  return zr_unicode_in_ranges(kExtendedPictographicRanges, zr_unicode_ep_count(), scalar);
}

bool zr_unicode_is_emoji_presentation(uint32_t scalar) {
  return zr_unicode_in_ranges(kEmojiPresentationRanges, zr_unicode_emoji_presentation_count(), scalar);
}

bool zr_unicode_is_eaw_wide(uint32_t scalar) {
  return zr_unicode_in_ranges(kEawWideRanges, zr_unicode_eaw_wide_count(), scalar);
}
