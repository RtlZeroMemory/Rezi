/*
  include/zr/zr_platform_types.h — OS-header-free platform types.

  Why: Exposes stable, fixed-width platform capability/config types used by the
  public engine config without exposing OS headers or platform backend APIs.
*/

#ifndef ZR_ZR_PLATFORM_TYPES_H_INCLUDED
#define ZR_ZR_PLATFORM_TYPES_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

/*
  plat_color_mode_t:
    - A fixed-width, ABI-stable color capability / request.
*/
typedef uint8_t plat_color_mode_t;
#define PLAT_COLOR_MODE_UNKNOWN ((plat_color_mode_t)0u)
#define PLAT_COLOR_MODE_16 ((plat_color_mode_t)1u)
#define PLAT_COLOR_MODE_256 ((plat_color_mode_t)2u)
#define PLAT_COLOR_MODE_RGB ((plat_color_mode_t)3u)

/*
  plat_size_t:
    - Terminal size in character cells.
*/
typedef struct plat_size_t {
  uint32_t cols;
  uint32_t rows;
} plat_size_t;

/*
  plat_caps_t:
    - Backend-discovered capabilities.
    - Boolean-like fields are encoded as 0/1 bytes for ABI stability.
*/
typedef struct plat_caps_t {
  plat_color_mode_t color_mode;
  uint8_t supports_mouse;
  uint8_t supports_bracketed_paste;
  uint8_t supports_focus_events;
  uint8_t supports_osc52;
  uint8_t supports_sync_update;
  uint8_t supports_scroll_region;
  uint8_t supports_cursor_shape;
  uint8_t supports_output_wait_writable;
  uint8_t supports_underline_styles;
  uint8_t supports_colored_underlines;
  uint8_t supports_hyperlinks;

  /*
    sgr_attrs_supported:
      - Bitmask of supported zr_style_t attrs for SGR emission.
      - Diff renderer must AND desired attrs with this mask deterministically.
  */
  uint32_t sgr_attrs_supported;
} plat_caps_t;

/*
  plat_config_t:
    - Core-provided desired platform behavior.
*/
typedef struct plat_config_t {
  plat_color_mode_t requested_color_mode;
  uint8_t enable_mouse;
  uint8_t enable_bracketed_paste;
  uint8_t enable_focus_events;
  uint8_t enable_osc52;
  uint8_t _pad[3];
} plat_config_t;

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_PLATFORM_TYPES_H_INCLUDED */
