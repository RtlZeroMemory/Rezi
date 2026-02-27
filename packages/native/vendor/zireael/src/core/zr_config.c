/*
  src/core/zr_config.c — Public config defaults and validation.

  Why: Provides deterministic defaults and argument validation for the
  public configuration structs without pulling OS headers into core.
*/

#include "core/zr_config.h"

#include "unicode/zr_width.h"

/* --- Defaults (determinism pinned) --- */
#define ZR_CFG_DEFAULT_TAB_WIDTH (4u)
#define ZR_CFG_DEFAULT_TARGET_FPS (60u)

/* Validate plat_config_t without OS dependencies (core/platform boundary). */
static zr_result_t zr_cfg_validate_plat(const plat_config_t* cfg) {
  if (!cfg) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  switch (cfg->requested_color_mode) {
  case PLAT_COLOR_MODE_UNKNOWN:
  case PLAT_COLOR_MODE_16:
  case PLAT_COLOR_MODE_256:
  case PLAT_COLOR_MODE_RGB:
    break;
  default:
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if ((cfg->_pad[0] != 0u) || (cfg->_pad[1] != 0u) || (cfg->_pad[2] != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if ((cfg->enable_mouse > 1u) || (cfg->enable_bracketed_paste > 1u) || (cfg->enable_focus_events > 1u) ||
      (cfg->enable_osc52 > 1u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  return ZR_OK;
}

/* Validate the shared runtime-config surface used by both engine-create and live reconfiguration. */
static zr_result_t zr_cfg_validate_runtime_common(const zr_limits_t* lim, const plat_config_t* plat, uint32_t tab_width,
                                                  uint32_t width_policy, uint32_t target_fps,
                                                  uint8_t enable_scroll_optimizations, uint8_t enable_debug_overlay,
                                                  uint8_t enable_replay_recording, uint8_t wait_for_output_drain,
                                                  zr_terminal_cap_flags_t cap_force_flags,
                                                  zr_terminal_cap_flags_t cap_suppress_flags) {

  /* --- Validate pointers and caps --- */
  if (!lim || !plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_result_t rc = zr_limits_validate(lim);
  if (rc != ZR_OK) {
    return rc;
  }

  rc = zr_cfg_validate_plat(plat);
  if (rc != ZR_OK) {
    return rc;
  }

  /* --- Validate text policy --- */
  if (tab_width == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (width_policy != (uint32_t)ZR_WIDTH_EMOJI_NARROW && width_policy != (uint32_t)ZR_WIDTH_EMOJI_WIDE) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* --- Validate boolean toggles --- */
  if ((enable_scroll_optimizations > 1u) || (enable_debug_overlay > 1u) || (enable_replay_recording > 1u) ||
      (wait_for_output_drain > 1u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (wait_for_output_drain != 0u && target_fps == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if ((cap_force_flags & ~ZR_TERM_CAP_ALL_MASK) != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if ((cap_suppress_flags & ~ZR_TERM_CAP_ALL_MASK) != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  return ZR_OK;
}

/* Produce the deterministic default engine config used by wrappers. */
zr_engine_config_t zr_engine_config_default(void) {
  zr_engine_config_t cfg;

  cfg.requested_engine_abi_major = ZR_ENGINE_ABI_MAJOR;
  cfg.requested_engine_abi_minor = ZR_ENGINE_ABI_MINOR;
  cfg.requested_engine_abi_patch = ZR_ENGINE_ABI_PATCH;
  cfg.requested_drawlist_version = ZR_DRAWLIST_VERSION_V1;
  cfg.requested_event_batch_version = ZR_EVENT_BATCH_VERSION_V1;

  cfg.limits = zr_limits_default();

  cfg.plat.requested_color_mode = PLAT_COLOR_MODE_UNKNOWN;
  cfg.plat.enable_mouse = 1u;
  cfg.plat.enable_bracketed_paste = 1u;
  cfg.plat.enable_focus_events = 1u;
  cfg.plat.enable_osc52 = 0u;
  cfg.plat._pad[0] = 0u;
  cfg.plat._pad[1] = 0u;
  cfg.plat._pad[2] = 0u;

  cfg.tab_width = ZR_CFG_DEFAULT_TAB_WIDTH;
  cfg.width_policy = (uint32_t)zr_width_policy_default();
  cfg.target_fps = ZR_CFG_DEFAULT_TARGET_FPS;

  cfg.enable_scroll_optimizations = 1u;
  cfg.enable_debug_overlay = 0u;
  cfg.enable_replay_recording = 0u;
  cfg.wait_for_output_drain = 0u;
  cfg.cap_force_flags = 0u;
  cfg.cap_suppress_flags = 0u;

  return cfg;
}

/* Validate an engine-create config, including pinned version negotiation. */
zr_result_t zr_engine_config_validate(const zr_engine_config_t* cfg) {
  if (!cfg) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* --- Validate version negotiation pins --- */
  if (cfg->requested_engine_abi_major != ZR_ENGINE_ABI_MAJOR ||
      cfg->requested_engine_abi_minor != ZR_ENGINE_ABI_MINOR ||
      cfg->requested_engine_abi_patch != ZR_ENGINE_ABI_PATCH) {
    return ZR_ERR_UNSUPPORTED;
  }

  if (cfg->requested_drawlist_version != ZR_DRAWLIST_VERSION_V1 ||
      cfg->requested_event_batch_version != ZR_EVENT_BATCH_VERSION_V1) {
    return ZR_ERR_UNSUPPORTED;
  }

  return zr_cfg_validate_runtime_common(&cfg->limits, &cfg->plat, cfg->tab_width, cfg->width_policy, cfg->target_fps,
                                        cfg->enable_scroll_optimizations, cfg->enable_debug_overlay,
                                        cfg->enable_replay_recording, cfg->wait_for_output_drain, cfg->cap_force_flags,
                                        cfg->cap_suppress_flags);
}

/* Validate the runtime-only config surface for engine_set_config(). */
zr_result_t zr_engine_runtime_config_validate(const zr_engine_runtime_config_t* cfg) {
  if (!cfg) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  return zr_cfg_validate_runtime_common(&cfg->limits, &cfg->plat, cfg->tab_width, cfg->width_policy, cfg->target_fps,
                                        cfg->enable_scroll_optimizations, cfg->enable_debug_overlay,
                                        cfg->enable_replay_recording, cfg->wait_for_output_drain, cfg->cap_force_flags,
                                        cfg->cap_suppress_flags);
}
