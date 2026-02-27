/*
  include/zr/zr_caps.h - Deterministic limits defaults and validation.

  Why: Centralizes cap defaults and validation so wrappers can reason about
  bounded memory/work behavior explicitly.
*/

#ifndef ZR_ZR_CAPS_H_INCLUDED
#define ZR_ZR_CAPS_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

#include "zr/zr_result.h"

#include <stdint.h>

/*
  Deterministic resource limits.

  Contract:
    - Fields must be non-zero unless explicitly documented otherwise.
    - Validation rejects invalid ranges and inconsistent budgets.
    - Wrappers should run zr_limits_validate() before engine_create().
*/
typedef struct zr_limits_t {
  /* Arena budgets (bytes). */
  uint32_t arena_max_total_bytes;
  uint32_t arena_initial_bytes;

  /* Maximum bytes emitted in one successful engine_present(). */
  uint32_t out_max_bytes_per_frame;

  /* Drawlist caps. */
  uint32_t dl_max_total_bytes;
  uint32_t dl_max_cmds;
  uint32_t dl_max_strings;
  uint32_t dl_max_blobs;
  uint32_t dl_max_clip_depth;
  uint32_t dl_max_text_run_segments;

  /* Diff renderer cap: maximum coalesced damage rectangles per frame. */
  uint32_t diff_max_damage_rects;
} zr_limits_t;

/* Return deterministic default limits. */
zr_limits_t zr_limits_default(void);

/* Validate limit values and relationships. */
zr_result_t zr_limits_validate(const zr_limits_t* limits);

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_CAPS_H_INCLUDED */
