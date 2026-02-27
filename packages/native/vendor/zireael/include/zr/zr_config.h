/*
  include/zr/zr_config.h - Public engine configuration and validation surface.

  Why: Defines stable config structs for engine creation and runtime updates,
  including version negotiation pins and deterministic limits.
*/

#ifndef ZR_ZR_CONFIG_H_INCLUDED
#define ZR_ZR_CONFIG_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

#include "zr/zr_caps.h"
#include "zr/zr_platform_types.h"
#include "zr/zr_result.h"
#include "zr/zr_terminal_caps.h"
#include "zr/zr_version.h"

#include <stdint.h>

/*
  Engine creation config.

  Ownership:
    - Engine does not retain pointers into this struct.

  Notes:
    - Version request fields drive engine_create negotiation.
    - Boolean-like toggles are encoded as 0/1 bytes for ABI stability.
*/
typedef struct zr_engine_config_t {
  /* --- Version negotiation --- */
  uint32_t requested_engine_abi_major;
  uint32_t requested_engine_abi_minor;
  uint32_t requested_engine_abi_patch;

  uint32_t requested_drawlist_version;
  uint32_t requested_event_batch_version;

  /* --- Deterministic limits/caps --- */
  zr_limits_t limits;

  /* --- Platform policy (OS-header-free type surface) --- */
  plat_config_t plat;

  /* --- Text policy --- */
  uint32_t tab_width;
  uint32_t width_policy; /* zr_width_policy_t encoded as fixed-width integer */

  /* --- Scheduling --- */
  uint32_t target_fps;

  /* --- Feature toggles (0/1) --- */
  uint8_t enable_scroll_optimizations;
  uint8_t enable_debug_overlay;
  uint8_t enable_replay_recording;
  uint8_t wait_for_output_drain;

  /* --- Terminal capability override policy --- */
  zr_terminal_cap_flags_t cap_force_flags;    /* force ON for listed caps */
  zr_terminal_cap_flags_t cap_suppress_flags; /* force OFF for listed caps */
} zr_engine_config_t;

/*
  Runtime config for engine_set_config.

  Notes:
    - Platform sub-config changes may be rejected by engine_set_config.
    - Same toggle/limits validation rules as create config.
*/
typedef struct zr_engine_runtime_config_t {
  zr_limits_t limits;
  plat_config_t plat;

  uint32_t tab_width;
  uint32_t width_policy;
  uint32_t target_fps;

  uint8_t enable_scroll_optimizations;
  uint8_t enable_debug_overlay;
  uint8_t enable_replay_recording;
  uint8_t wait_for_output_drain;

  zr_terminal_cap_flags_t cap_force_flags;
  zr_terminal_cap_flags_t cap_suppress_flags;
} zr_engine_runtime_config_t;

/* Return deterministic default config values suitable for initial integration. */
zr_engine_config_t zr_engine_config_default(void);

/* Validate create-time config, including version negotiation fields. */
zr_result_t zr_engine_config_validate(const zr_engine_config_t* cfg);

/* Validate runtime config for engine_set_config. */
zr_result_t zr_engine_runtime_config_validate(const zr_engine_runtime_config_t* cfg);

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_CONFIG_H_INCLUDED */
