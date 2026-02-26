/*
  src/core/zr_image.h — Terminal image protocol selection and frame state.

  Why: DRAW_IMAGE stores image commands outside the cell framebuffer and the
  present path emits protocol sideband bytes deterministically.
*/

#ifndef ZR_CORE_ZR_IMAGE_H_INCLUDED
#define ZR_CORE_ZR_IMAGE_H_INCLUDED

#include "core/zr_base64.h"

#include "util/zr_arena.h"
#include "util/zr_result.h"
#include "util/zr_string_builder.h"

#include "zr/zr_terminal_caps.h"

#include <stddef.h>
#include <stdint.h>

enum {
  ZR_IMAGE_RGBA_BYTES_PER_PIXEL = 4u,
  ZR_IMAGE_CACHE_SIZE = 64u,
  ZR_IMAGE_CHUNK_BASE64_MAX = 4096u,
  ZR_IMAGE_ALPHA_THRESHOLD = 128u,
};

typedef enum zr_image_protocol_t {
  ZR_IMG_PROTO_NONE = 0,
  ZR_IMG_PROTO_KITTY = 1,
  ZR_IMG_PROTO_SIXEL = 2,
  ZR_IMG_PROTO_ITERM2 = 3,
} zr_image_protocol_t;

typedef enum zr_image_format_t {
  ZR_IMAGE_FORMAT_RGBA = 0,
  ZR_IMAGE_FORMAT_PNG = 1,
} zr_image_format_t;

typedef enum zr_image_fit_mode_t {
  ZR_IMAGE_FIT_FILL = 0,
  ZR_IMAGE_FIT_CONTAIN = 1,
  ZR_IMAGE_FIT_COVER = 2,
} zr_image_fit_mode_t;

typedef struct zr_image_cmd_t {
  uint16_t dst_col;
  uint16_t dst_row;
  uint16_t dst_cols;
  uint16_t dst_rows;
  uint16_t px_width;
  uint16_t px_height;
  uint32_t blob_off;
  uint32_t blob_len;
  uint32_t image_id;
  uint8_t format;   /* zr_image_format_t */
  uint8_t protocol; /* resolved: (uint8_t)zr_image_protocol_t; staged frames use 1..3 */
  int8_t z_layer;   /* -1, 0, 1 */
  uint8_t fit_mode; /* zr_image_fit_mode_t */
} zr_image_cmd_t;

typedef struct zr_image_frame_t {
  zr_image_cmd_t* cmds;
  uint32_t cmds_len;
  uint32_t cmds_cap;

  uint8_t* blob_bytes;
  uint32_t blob_len;
  uint32_t blob_cap;
} zr_image_frame_t;

typedef struct zr_image_slot_t {
  uint32_t kitty_id;
  uint32_t image_id;
  uint64_t content_hash;
  uint16_t px_width;
  uint16_t px_height;
  uint16_t dst_col;
  uint16_t dst_row;
  uint16_t dst_cols;
  uint16_t dst_rows;
  int8_t z_layer;
  uint8_t transmitted;
  uint8_t placed_this_frame;
  uint64_t lru_tick;
} zr_image_slot_t;

typedef struct zr_image_state_t {
  zr_image_slot_t slots[ZR_IMAGE_CACHE_SIZE];
  uint32_t slot_count;
  uint32_t next_kitty_id;
  uint64_t lru_tick;
} zr_image_state_t;

typedef struct zr_image_emit_options_t {
  uint16_t cell_width_px;
  uint16_t cell_height_px;
} zr_image_emit_options_t;

typedef struct zr_image_emit_ctx_t {
  const zr_image_frame_t* frame;
  const zr_terminal_profile_t* profile;
  zr_image_emit_options_t opts;
  zr_arena_t* arena;
  zr_image_state_t* state;
  zr_sb_t* out;
} zr_image_emit_ctx_t;

/* --- Shared frame storage helpers --- */
void zr_image_frame_init(zr_image_frame_t* frame);
void zr_image_frame_reset(zr_image_frame_t* frame);
zr_result_t zr_image_frame_reserve(zr_image_frame_t* frame, uint32_t cmd_cap, uint32_t blob_cap);
void zr_image_frame_release(zr_image_frame_t* frame);
zr_result_t zr_image_frame_push_copy(zr_image_frame_t* frame, const zr_image_cmd_t* cmd, const uint8_t* blob_bytes);
void zr_image_frame_swap(zr_image_frame_t* a, zr_image_frame_t* b);

/* --- Selection + hashes --- */
zr_image_protocol_t zr_image_select_protocol(uint8_t requested_protocol, const zr_terminal_profile_t* profile);
uint64_t zr_image_hash_fnv1a64(const uint8_t* bytes, size_t len);

/* --- RGBA fit/scaling --- */
zr_result_t zr_image_scale_rgba(const uint8_t* src_rgba, uint16_t src_w, uint16_t src_h, uint8_t fit_mode,
                                uint16_t dst_w, uint16_t dst_h, uint8_t* out_rgba, size_t out_len);

/* --- Kitty cache state helpers --- */
void zr_image_state_init(zr_image_state_t* state);
void zr_image_state_begin_frame(zr_image_state_t* state);
int32_t zr_image_cache_find_by_id_hash(const zr_image_state_t* state, uint32_t image_id, uint64_t hash, uint16_t px_w,
                                       uint16_t px_h);
int32_t zr_image_cache_find_by_hash_dims(const zr_image_state_t* state, uint64_t hash, uint16_t px_w, uint16_t px_h);
uint32_t zr_image_cache_choose_slot(const zr_image_state_t* state);
void zr_image_cache_touch(zr_image_state_t* state, uint32_t slot_index);
void zr_image_cache_set_placed(zr_image_state_t* state, uint32_t slot_index, uint16_t dst_col, uint16_t dst_row,
                               uint16_t dst_cols, uint16_t dst_rows, int8_t z_layer);

/* --- Protocol emitters --- */
zr_result_t zr_image_kitty_emit_transmit_rgba(zr_sb_t* sb, uint32_t kitty_id, const uint8_t* rgba, uint16_t px_w,
                                              uint16_t px_h, uint16_t dst_cols, uint16_t dst_rows);
zr_result_t zr_image_kitty_emit_place(zr_sb_t* sb, uint32_t kitty_id, uint16_t dst_col, uint16_t dst_row,
                                      uint16_t dst_cols, uint16_t dst_rows, int8_t z_layer);
zr_result_t zr_image_kitty_emit_delete(zr_sb_t* sb, uint32_t kitty_id);

zr_result_t zr_image_sixel_emit_rgba(zr_sb_t* sb, zr_arena_t* arena, const uint8_t* rgba, uint16_t px_w, uint16_t px_h,
                                     uint16_t dst_col, uint16_t dst_row);

zr_result_t zr_image_iterm2_emit_png(zr_sb_t* sb, const uint8_t* png_bytes, size_t png_len, uint16_t dst_col,
                                     uint16_t dst_row, uint16_t dst_cols, uint16_t dst_rows);
zr_result_t zr_image_iterm2_emit_rgba(zr_sb_t* sb, zr_arena_t* arena, const uint8_t* rgba, uint16_t px_w, uint16_t px_h,
                                      uint16_t dst_col, uint16_t dst_row, uint16_t dst_cols, uint16_t dst_rows);

/* Emit one frame of images into out buffer using selected protocol paths. */
zr_result_t zr_image_emit_frame(zr_image_emit_ctx_t* ctx);

#endif /* ZR_CORE_ZR_IMAGE_H_INCLUDED */
