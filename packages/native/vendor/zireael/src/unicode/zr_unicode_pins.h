/*
  src/unicode/zr_unicode_pins.h — Pinned Unicode version + default policies.

  Why: Centralizes determinism-critical pins (Unicode version and default width
  policy) so tests can assert stability across platforms/toolchains.
*/

#ifndef ZR_UNICODE_ZR_UNICODE_PINS_H_INCLUDED
#define ZR_UNICODE_ZR_UNICODE_PINS_H_INCLUDED

#include <stdint.h>

#define ZR_UNICODE_VERSION_MAJOR 15u
#define ZR_UNICODE_VERSION_MINOR 1u
#define ZR_UNICODE_VERSION_PATCH 0u

/*
  Default width policy (pinned).

  Note: This intentionally references a zr_width.h enum value; include
  unicode/zr_width.h when using the macro.
*/
#define ZR_WIDTH_POLICY_DEFAULT ZR_WIDTH_EMOJI_WIDE

typedef struct zr_unicode_version_t {
  uint32_t major;
  uint32_t minor;
  uint32_t patch;
} zr_unicode_version_t;

static inline zr_unicode_version_t zr_unicode_version(void) {
  zr_unicode_version_t v;
  v.major = (uint32_t)ZR_UNICODE_VERSION_MAJOR;
  v.minor = (uint32_t)ZR_UNICODE_VERSION_MINOR;
  v.patch = (uint32_t)ZR_UNICODE_VERSION_PATCH;
  return v;
}

#endif /* ZR_UNICODE_ZR_UNICODE_PINS_H_INCLUDED */

