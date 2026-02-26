/*
  src/unicode/zr_unicode_data.h — Pinned Unicode 15.1.0 property lookups.

  Why: Grapheme segmentation and width measurement require stable Unicode
  property data. These lookups are table-driven and deterministic (no locale,
  no OS APIs), and the tables are pinned to Unicode 15.1.0.
*/

#ifndef ZR_UNICODE_ZR_UNICODE_DATA_H_INCLUDED
#define ZR_UNICODE_ZR_UNICODE_DATA_H_INCLUDED

#include <stdbool.h>
#include <stdint.h>

typedef enum zr_gcb_class_t {
  ZR_GCB_OTHER = 0,
  ZR_GCB_CR,
  ZR_GCB_LF,
  ZR_GCB_CONTROL,
  ZR_GCB_PREPEND,
  ZR_GCB_SPACINGMARK,
  ZR_GCB_EXTEND,
  ZR_GCB_ZWJ,
  ZR_GCB_REGIONAL_INDICATOR,
  ZR_GCB_L,
  ZR_GCB_V,
  ZR_GCB_T,
  ZR_GCB_LV,
  ZR_GCB_LVT
} zr_gcb_class_t;

zr_gcb_class_t zr_unicode_gcb_class(uint32_t scalar);
bool           zr_unicode_is_extended_pictographic(uint32_t scalar);
bool           zr_unicode_is_emoji_presentation(uint32_t scalar);
bool           zr_unicode_is_eaw_wide(uint32_t scalar);

#endif /* ZR_UNICODE_ZR_UNICODE_DATA_H_INCLUDED */
