/*
  src/core/zr_drawlist.h — Drawlist parsing/validation/execution (engine-internal).

  Why: Validates wrapper-provided drawlist bytes and executes them into an
  in-memory framebuffer with strict bounds checks and deterministic behavior.
*/

#ifndef ZR_CORE_ZR_DRAWLIST_H_INCLUDED
#define ZR_CORE_ZR_DRAWLIST_H_INCLUDED

#include "zr/zr_drawlist.h" /* ABI structs */

#include "core/zr_blit.h"
#include "core/zr_cursor.h"

#include "util/zr_caps.h"
#include "util/zr_result.h"

#include "zr/zr_terminal_caps.h"

#include <stddef.h>
#include <stdint.h>

typedef struct zr_fb_t zr_fb_t;
typedef struct zr_image_frame_t zr_image_frame_t;

typedef struct zr_dl_resource_entry_t {
  uint32_t id;
  uint8_t* bytes;
  uint32_t len;
  /*
    Ownership tag for `bytes`.

    Why: preflight uses shallow snapshots that borrow `bytes` pointers from the
    stage store to avoid deep-copying persistent payloads every submit.
  */
  uint8_t owned;
  uint8_t reserved0[3];
} zr_dl_resource_entry_t;

typedef struct zr_dl_resource_store_t {
  zr_dl_resource_entry_t* entries;
  uint32_t len;
  uint32_t cap;
  uint32_t total_bytes;
} zr_dl_resource_store_t;

typedef struct zr_dl_resources_t {
  zr_dl_resource_store_t strings;
  zr_dl_resource_store_t blobs;
} zr_dl_resources_t;

/*
  zr_dl_view_t (engine-internal validated view):
    - All pointers are borrowed views into the caller-provided drawlist byte
      buffer passed to zr_dl_validate().
    - Ownership: the engine does not allocate or copy drawlist payload; the
      caller retains ownership of `bytes`.
    - Lifetime: `bytes` (and therefore all derived pointers) must remain valid
      and unchanged for the duration of any use of this view (typically until
      zr_dl_execute() completes).
*/
typedef struct zr_dl_view_t {
  zr_dl_header_t hdr; /* host-endian copy */

  const uint8_t* bytes;
  size_t bytes_len;

  const uint8_t* cmd_bytes;
  size_t cmd_bytes_len;

  const uint8_t* strings_span_bytes;
  size_t strings_count;
  const uint8_t* strings_bytes;
  size_t strings_bytes_len;

  const uint8_t* blobs_span_bytes;
  size_t blobs_count;
  const uint8_t* blobs_bytes;
  size_t blobs_bytes_len;

  struct {
    uint32_t tab_width;
    uint32_t width_policy;
  } text;
} zr_dl_view_t;

zr_result_t zr_dl_validate(const uint8_t* bytes, size_t bytes_len, const zr_limits_t* lim, zr_dl_view_t* out_view);
zr_result_t zr_dl_preflight_resources(const zr_dl_view_t* v, zr_fb_t* fb, zr_image_frame_t* image_stage,
                                      const zr_limits_t* lim, const zr_terminal_profile_t* term_profile,
                                      zr_dl_resources_t* resources);
zr_result_t zr_dl_execute(const zr_dl_view_t* v, zr_fb_t* dst, const zr_limits_t* lim, uint32_t tab_width,
                          uint32_t width_policy, const zr_blit_caps_t* blit_caps,
                          const zr_terminal_profile_t* term_profile, zr_image_frame_t* image_frame_stage,
                          zr_dl_resources_t* resources, zr_cursor_state_t* inout_cursor_state);

void zr_dl_resources_init(zr_dl_resources_t* resources);
void zr_dl_resources_release(zr_dl_resources_t* resources);
void zr_dl_resources_swap(zr_dl_resources_t* a, zr_dl_resources_t* b);
zr_result_t zr_dl_resources_clone(zr_dl_resources_t* dst, const zr_dl_resources_t* src);
zr_result_t zr_dl_resources_clone_shallow(zr_dl_resources_t* dst, const zr_dl_resources_t* src);

#endif /* ZR_CORE_ZR_DRAWLIST_H_INCLUDED */
