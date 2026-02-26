/*
  src/core/zr_image.c — Shared image frame state, selection, scaling, and cache.

  Why: Keeps DRAW_IMAGE protocol-agnostic behavior deterministic while protocol
  byte encoders live in dedicated files.
*/

#include "core/zr_image.h"

#include "util/zr_checked.h"

#include <stddef.h>
#include <stdlib.h>
#include <string.h>

enum {
  ZR_IMAGE_DEFAULT_CELL_W = 8u,
  ZR_IMAGE_DEFAULT_CELL_H = 16u,
  ZR_IMAGE_CMDS_INITIAL_CAP = 8u,
  ZR_IMAGE_BLOB_INITIAL_CAP = 1024u,
};

static zr_result_t zr_image_frame_ensure_cmd_cap(zr_image_frame_t* frame, uint32_t need) {
  uint32_t cap = 0u;
  zr_image_cmd_t* next = NULL;
  size_t bytes = 0u;

  if (!frame) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (need <= frame->cmds_cap) {
    return ZR_OK;
  }

  cap = (frame->cmds_cap == 0u) ? ZR_IMAGE_CMDS_INITIAL_CAP : frame->cmds_cap;
  while (cap < need) {
    if (cap > (UINT32_MAX / 2u)) {
      cap = need;
      break;
    }
    cap *= 2u;
  }

  if (!zr_checked_mul_size((size_t)cap, sizeof(zr_image_cmd_t), &bytes)) {
    return ZR_ERR_LIMIT;
  }
  next = (zr_image_cmd_t*)realloc(frame->cmds, bytes);
  if (!next) {
    return ZR_ERR_OOM;
  }
  frame->cmds = next;
  frame->cmds_cap = cap;
  return ZR_OK;
}

static zr_result_t zr_image_frame_ensure_blob_cap(zr_image_frame_t* frame, uint32_t need) {
  uint32_t cap = 0u;
  uint8_t* next = NULL;

  if (!frame) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (need <= frame->blob_cap) {
    return ZR_OK;
  }

  cap = (frame->blob_cap == 0u) ? ZR_IMAGE_BLOB_INITIAL_CAP : frame->blob_cap;
  while (cap < need) {
    if (cap > (UINT32_MAX / 2u)) {
      cap = need;
      break;
    }
    cap *= 2u;
  }

  next = (uint8_t*)realloc(frame->blob_bytes, (size_t)cap);
  if (!next) {
    return ZR_ERR_OOM;
  }
  frame->blob_bytes = next;
  frame->blob_cap = cap;
  return ZR_OK;
}

void zr_image_frame_init(zr_image_frame_t* frame) {
  if (!frame) {
    return;
  }
  memset(frame, 0, sizeof(*frame));
}

void zr_image_frame_reset(zr_image_frame_t* frame) {
  if (!frame) {
    return;
  }
  frame->cmds_len = 0u;
  frame->blob_len = 0u;
}

zr_result_t zr_image_frame_reserve(zr_image_frame_t* frame, uint32_t cmd_cap, uint32_t blob_cap) {
  zr_result_t rc = ZR_OK;
  if (!frame) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_image_frame_ensure_cmd_cap(frame, cmd_cap);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_image_frame_ensure_blob_cap(frame, blob_cap);
}

void zr_image_frame_release(zr_image_frame_t* frame) {
  if (!frame) {
    return;
  }
  free(frame->cmds);
  free(frame->blob_bytes);
  memset(frame, 0, sizeof(*frame));
}

void zr_image_frame_swap(zr_image_frame_t* a, zr_image_frame_t* b) {
  zr_image_frame_t tmp;
  if (!a || !b) {
    return;
  }
  tmp = *a;
  *a = *b;
  *b = tmp;
}

/* Copy one DRAW_IMAGE payload into engine-owned staging storage. */
zr_result_t zr_image_frame_push_copy(zr_image_frame_t* frame, const zr_image_cmd_t* cmd, const uint8_t* blob_bytes) {
  uint32_t cmd_blob_len = 0u;
  uint32_t next_blob_len = 0u;
  zr_image_cmd_t copy;
  zr_result_t rc = ZR_OK;

  if (!frame || !cmd) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  cmd_blob_len = cmd->blob_len;
  if (!blob_bytes && cmd_blob_len != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_add_u32(frame->blob_len, cmd_blob_len, &next_blob_len)) {
    return ZR_ERR_LIMIT;
  }

  rc = zr_image_frame_ensure_cmd_cap(frame, frame->cmds_len + 1u);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_image_frame_ensure_blob_cap(frame, next_blob_len);
  if (rc != ZR_OK) {
    return rc;
  }

  copy = *cmd;
  copy.blob_off = frame->blob_len;
  if (cmd_blob_len != 0u) {
    memcpy(frame->blob_bytes + frame->blob_len, blob_bytes, (size_t)cmd_blob_len);
  }

  frame->blob_len = next_blob_len;
  frame->cmds[frame->cmds_len++] = copy;
  return ZR_OK;
}

zr_image_protocol_t zr_image_select_protocol(uint8_t requested_protocol, const zr_terminal_profile_t* profile) {
  if (requested_protocol == (uint8_t)ZR_IMG_PROTO_KITTY) {
    return ZR_IMG_PROTO_KITTY;
  }
  if (requested_protocol == (uint8_t)ZR_IMG_PROTO_SIXEL) {
    return ZR_IMG_PROTO_SIXEL;
  }
  if (requested_protocol == (uint8_t)ZR_IMG_PROTO_ITERM2) {
    return ZR_IMG_PROTO_ITERM2;
  }
  if (requested_protocol != 0u) {
    return ZR_IMG_PROTO_NONE;
  }
  if (!profile) {
    return ZR_IMG_PROTO_NONE;
  }
  if (profile->supports_kitty_graphics != 0u) {
    return ZR_IMG_PROTO_KITTY;
  }
  if (profile->supports_sixel != 0u) {
    return ZR_IMG_PROTO_SIXEL;
  }
  if (profile->supports_iterm2_images != 0u) {
    return ZR_IMG_PROTO_ITERM2;
  }
  return ZR_IMG_PROTO_NONE;
}

uint64_t zr_image_hash_fnv1a64(const uint8_t* bytes, size_t len) {
  uint64_t h = 14695981039346656037ull;
  size_t i = 0u;
  if (!bytes && len != 0u) {
    return 0u;
  }
  for (i = 0u; i < len; i++) {
    h ^= (uint64_t)bytes[i];
    h *= 1099511628211ull;
  }
  return h;
}

static uint32_t zr_image_scale_axis(uint32_t pos, uint32_t src_len, uint32_t dst_len) {
  uint64_t num = 0u;
  if (dst_len == 0u || src_len == 0u) {
    return 0u;
  }
  num = (uint64_t)pos * (uint64_t)src_len;
  return (uint32_t)(num / (uint64_t)dst_len);
}

static uint32_t zr_image_div_ceil_u64(uint64_t num, uint32_t den) {
  uint64_t q = 0u;
  if (den == 0u) {
    return 0u;
  }
  q = num / (uint64_t)den;
  if ((num % (uint64_t)den) != 0u && q < UINT32_MAX) {
    q++;
  }
  return (uint32_t)q;
}

static zr_result_t zr_image_rgba_out_size(uint16_t w, uint16_t h, size_t* out) {
  size_t px = 0u;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_mul_size((size_t)w, (size_t)h, &px) ||
      !zr_checked_mul_size(px, (size_t)ZR_IMAGE_RGBA_BYTES_PER_PIXEL, out)) {
    return ZR_ERR_LIMIT;
  }
  return ZR_OK;
}

static void zr_image_copy_mapped_pixel(const uint8_t* src, uint32_t src_w, uint32_t src_h, uint8_t* dst, uint32_t dst_x,
                                       uint32_t dst_y, uint32_t dst_w, uint32_t sx_scaled, uint32_t sy_scaled,
                                       uint32_t scaled_w, uint32_t scaled_h) {
  size_t dst_off = 0u;
  size_t src_off = 0u;
  uint32_t src_x = 0u;
  uint32_t src_y = 0u;

  if (!src || !dst || dst_w == 0u || scaled_w == 0u || scaled_h == 0u || src_w == 0u || src_h == 0u) {
    return;
  }

  src_x = zr_image_scale_axis(sx_scaled, src_w, scaled_w);
  src_y = zr_image_scale_axis(sy_scaled, src_h, scaled_h);
  if (src_x >= src_w) {
    src_x = src_w - 1u;
  }
  if (src_y >= src_h) {
    src_y = src_h - 1u;
  }

  dst_off = ((size_t)dst_y * (size_t)dst_w + (size_t)dst_x) * (size_t)ZR_IMAGE_RGBA_BYTES_PER_PIXEL;
  src_off = ((size_t)src_y * (size_t)src_w + (size_t)src_x) * (size_t)ZR_IMAGE_RGBA_BYTES_PER_PIXEL;
  memcpy(dst + dst_off, src + src_off, ZR_IMAGE_RGBA_BYTES_PER_PIXEL);
}

static void zr_image_choose_contain_dims(uint32_t src_w, uint32_t src_h, uint32_t dst_w, uint32_t dst_h,
                                         uint32_t* out_w, uint32_t* out_h) {
  uint64_t lhs = (uint64_t)src_w * (uint64_t)dst_h;
  uint64_t rhs = (uint64_t)src_h * (uint64_t)dst_w;

  if (lhs >= rhs) {
    *out_w = dst_w;
    *out_h = (src_w == 0u) ? 0u : (uint32_t)(((uint64_t)src_h * (uint64_t)dst_w) / (uint64_t)src_w);
  } else {
    *out_h = dst_h;
    *out_w = (src_h == 0u) ? 0u : (uint32_t)(((uint64_t)src_w * (uint64_t)dst_h) / (uint64_t)src_h);
  }
  if (*out_w == 0u) {
    *out_w = 1u;
  }
  if (*out_h == 0u) {
    *out_h = 1u;
  }
}

static void zr_image_choose_cover_dims(uint32_t src_w, uint32_t src_h, uint32_t dst_w, uint32_t dst_h, uint32_t* out_w,
                                       uint32_t* out_h) {
  uint64_t lhs = (uint64_t)src_w * (uint64_t)dst_h;
  uint64_t rhs = (uint64_t)src_h * (uint64_t)dst_w;

  if (lhs >= rhs) {
    *out_h = dst_h;
    *out_w = (src_h == 0u) ? 0u : zr_image_div_ceil_u64((uint64_t)src_w * (uint64_t)dst_h, src_h);
  } else {
    *out_w = dst_w;
    *out_h = (src_w == 0u) ? 0u : zr_image_div_ceil_u64((uint64_t)src_h * (uint64_t)dst_w, src_w);
  }
  if (*out_w == 0u) {
    *out_w = 1u;
  }
  if (*out_h == 0u) {
    *out_h = 1u;
  }
}

/* Scale source RGBA to destination pixel size using deterministic nearest-neighbor fit modes. */
zr_result_t zr_image_scale_rgba(const uint8_t* src_rgba, uint16_t src_w, uint16_t src_h, uint8_t fit_mode,
                                uint16_t dst_w, uint16_t dst_h, uint8_t* out_rgba, size_t out_len) {
  uint32_t x = 0u;
  uint32_t y = 0u;
  size_t need = 0u;

  if (!src_rgba || !out_rgba || src_w == 0u || src_h == 0u || dst_w == 0u || dst_h == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (zr_image_rgba_out_size(dst_w, dst_h, &need) != ZR_OK || need != out_len) {
    return ZR_ERR_LIMIT;
  }

  if (fit_mode == (uint8_t)ZR_IMAGE_FIT_FILL) {
    for (y = 0u; y < (uint32_t)dst_h; y++) {
      for (x = 0u; x < (uint32_t)dst_w; x++) {
        zr_image_copy_mapped_pixel(src_rgba, src_w, src_h, out_rgba, x, y, dst_w, x, y, dst_w, dst_h);
      }
    }
    return ZR_OK;
  }

  if (fit_mode == (uint8_t)ZR_IMAGE_FIT_CONTAIN) {
    uint32_t scaled_w = 0u;
    uint32_t scaled_h = 0u;
    uint32_t off_x = 0u;
    uint32_t off_y = 0u;
    memset(out_rgba, 0, out_len);
    zr_image_choose_contain_dims(src_w, src_h, dst_w, dst_h, &scaled_w, &scaled_h);
    off_x = ((uint32_t)dst_w - scaled_w) / 2u;
    off_y = ((uint32_t)dst_h - scaled_h) / 2u;
    for (y = 0u; y < scaled_h; y++) {
      for (x = 0u; x < scaled_w; x++) {
        zr_image_copy_mapped_pixel(src_rgba, src_w, src_h, out_rgba, x + off_x, y + off_y, dst_w, x, y, scaled_w,
                                   scaled_h);
      }
    }
    return ZR_OK;
  }

  if (fit_mode == (uint8_t)ZR_IMAGE_FIT_COVER) {
    uint32_t scaled_w = 0u;
    uint32_t scaled_h = 0u;
    uint32_t crop_x = 0u;
    uint32_t crop_y = 0u;
    zr_image_choose_cover_dims(src_w, src_h, dst_w, dst_h, &scaled_w, &scaled_h);
    crop_x = (scaled_w > (uint32_t)dst_w) ? ((scaled_w - (uint32_t)dst_w) / 2u) : 0u;
    crop_y = (scaled_h > (uint32_t)dst_h) ? ((scaled_h - (uint32_t)dst_h) / 2u) : 0u;
    for (y = 0u; y < (uint32_t)dst_h; y++) {
      for (x = 0u; x < (uint32_t)dst_w; x++) {
        zr_image_copy_mapped_pixel(src_rgba, src_w, src_h, out_rgba, x, y, dst_w, x + crop_x, y + crop_y, scaled_w,
                                   scaled_h);
      }
    }
    return ZR_OK;
  }

  return ZR_ERR_INVALID_ARGUMENT;
}

void zr_image_state_init(zr_image_state_t* state) {
  if (!state) {
    return;
  }
  memset(state, 0, sizeof(*state));
  state->next_kitty_id = 1u;
}

void zr_image_state_begin_frame(zr_image_state_t* state) {
  uint32_t i = 0u;
  if (!state) {
    return;
  }
  for (i = 0u; i < state->slot_count; i++) {
    state->slots[i].placed_this_frame = 0u;
  }
}

int32_t zr_image_cache_find_by_id_hash(const zr_image_state_t* state, uint32_t image_id, uint64_t hash, uint16_t px_w,
                                       uint16_t px_h) {
  uint32_t i = 0u;
  if (!state || image_id == 0u) {
    return -1;
  }
  for (i = 0u; i < state->slot_count; i++) {
    const zr_image_slot_t* slot = &state->slots[i];
    if (slot->transmitted == 0u) {
      continue;
    }
    if (slot->image_id == image_id && slot->content_hash == hash && slot->px_width == px_w && slot->px_height == px_h) {
      return (int32_t)i;
    }
  }
  return -1;
}

int32_t zr_image_cache_find_by_hash_dims(const zr_image_state_t* state, uint64_t hash, uint16_t px_w, uint16_t px_h) {
  uint32_t i = 0u;
  if (!state) {
    return -1;
  }
  for (i = 0u; i < state->slot_count; i++) {
    const zr_image_slot_t* slot = &state->slots[i];
    if (slot->transmitted == 0u) {
      continue;
    }
    if (slot->content_hash == hash && slot->px_width == px_w && slot->px_height == px_h) {
      return (int32_t)i;
    }
  }
  return -1;
}

uint32_t zr_image_cache_choose_slot(const zr_image_state_t* state) {
  uint32_t i = 0u;
  uint32_t idx = 0u;
  uint64_t oldest = 0u;

  if (!state) {
    return 0u;
  }
  if (state->slot_count < ZR_IMAGE_CACHE_SIZE) {
    return state->slot_count;
  }

  for (i = 0u; i < state->slot_count; i++) {
    if (state->slots[i].transmitted == 0u) {
      return i;
    }
  }

  idx = 0u;
  oldest = state->slots[0].lru_tick;
  for (i = 1u; i < state->slot_count; i++) {
    if (state->slots[i].lru_tick < oldest) {
      oldest = state->slots[i].lru_tick;
      idx = i;
    }
  }
  return idx;
}

void zr_image_cache_touch(zr_image_state_t* state, uint32_t slot_index) {
  if (!state || slot_index >= state->slot_count) {
    return;
  }
  state->lru_tick++;
  state->slots[slot_index].lru_tick = state->lru_tick;
}

void zr_image_cache_set_placed(zr_image_state_t* state, uint32_t slot_index, uint16_t dst_col, uint16_t dst_row,
                               uint16_t dst_cols, uint16_t dst_rows, int8_t z_layer) {
  zr_image_slot_t* slot = NULL;
  if (!state || slot_index >= state->slot_count) {
    return;
  }
  slot = &state->slots[slot_index];
  slot->placed_this_frame = 1u;
  slot->dst_col = dst_col;
  slot->dst_row = dst_row;
  slot->dst_cols = dst_cols;
  slot->dst_rows = dst_rows;
  slot->z_layer = z_layer;
  zr_image_cache_touch(state, slot_index);
}

static zr_result_t zr_image_calc_target_px(const zr_image_emit_ctx_t* ctx, const zr_image_cmd_t* cmd, uint16_t* out_w,
                                           uint16_t* out_h) {
  uint16_t cell_w = 0u;
  uint16_t cell_h = 0u;
  uint32_t tmp_w = 0u;
  uint32_t tmp_h = 0u;

  if (!ctx || !cmd || !out_w || !out_h) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  cell_w = ctx->opts.cell_width_px ? ctx->opts.cell_width_px : ZR_IMAGE_DEFAULT_CELL_W;
  cell_h = ctx->opts.cell_height_px ? ctx->opts.cell_height_px : ZR_IMAGE_DEFAULT_CELL_H;

  if (!zr_checked_mul_u32((uint32_t)cmd->dst_cols, (uint32_t)cell_w, &tmp_w) ||
      !zr_checked_mul_u32((uint32_t)cmd->dst_rows, (uint32_t)cell_h, &tmp_h) || tmp_w == 0u || tmp_h == 0u ||
      tmp_w > UINT16_MAX || tmp_h > UINT16_MAX) {
    return ZR_ERR_LIMIT;
  }

  *out_w = (uint16_t)tmp_w;
  *out_h = (uint16_t)tmp_h;
  return ZR_OK;
}

static zr_result_t zr_image_emit_kitty_cmd(zr_image_emit_ctx_t* ctx, const zr_image_cmd_t* cmd, const uint8_t* blob) {
  int32_t hit = -1;
  uint32_t slot_index = 0u;
  uint64_t hash = 0u;
  zr_image_slot_t* slot = NULL;
  zr_result_t rc = ZR_OK;

  if (!ctx || !cmd || !blob || !ctx->state || !ctx->out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (cmd->format != (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
    return ZR_ERR_UNSUPPORTED;
  }

  hash = zr_image_hash_fnv1a64(blob, (size_t)cmd->blob_len);
  hit = zr_image_cache_find_by_id_hash(ctx->state, cmd->image_id, hash, cmd->px_width, cmd->px_height);
  if (hit < 0) {
    hit = zr_image_cache_find_by_hash_dims(ctx->state, hash, cmd->px_width, cmd->px_height);
  }

  if (hit >= 0) {
    slot_index = (uint32_t)hit;
    slot = &ctx->state->slots[slot_index];
    rc = zr_image_kitty_emit_place(ctx->out, slot->kitty_id, cmd->dst_col, cmd->dst_row, cmd->dst_cols, cmd->dst_rows,
                                   cmd->z_layer);
    if (rc != ZR_OK) {
      return rc;
    }
    zr_image_cache_set_placed(ctx->state, slot_index, cmd->dst_col, cmd->dst_row, cmd->dst_cols, cmd->dst_rows,
                              cmd->z_layer);
    return ZR_OK;
  }

  slot_index = zr_image_cache_choose_slot(ctx->state);
  if (slot_index < ctx->state->slot_count && ctx->state->slots[slot_index].transmitted != 0u) {
    rc = zr_image_kitty_emit_delete(ctx->out, ctx->state->slots[slot_index].kitty_id);
    if (rc != ZR_OK) {
      return rc;
    }
  }
  if (slot_index == ctx->state->slot_count && ctx->state->slot_count < ZR_IMAGE_CACHE_SIZE) {
    ctx->state->slot_count++;
  }

  slot = &ctx->state->slots[slot_index];
  memset(slot, 0, sizeof(*slot));
  if (ctx->state->next_kitty_id == 0u) {
    ctx->state->next_kitty_id = 1u;
  }
  slot->kitty_id = ctx->state->next_kitty_id++;
  slot->image_id = cmd->image_id;
  slot->content_hash = hash;
  slot->px_width = cmd->px_width;
  slot->px_height = cmd->px_height;

  rc = zr_image_kitty_emit_transmit_rgba(ctx->out, slot->kitty_id, blob, cmd->px_width, cmd->px_height, cmd->dst_cols,
                                         cmd->dst_rows);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_image_kitty_emit_place(ctx->out, slot->kitty_id, cmd->dst_col, cmd->dst_row, cmd->dst_cols, cmd->dst_rows,
                                 cmd->z_layer);
  if (rc != ZR_OK) {
    return rc;
  }

  slot->transmitted = 1u;
  zr_image_cache_set_placed(ctx->state, slot_index, cmd->dst_col, cmd->dst_row, cmd->dst_cols, cmd->dst_rows,
                            cmd->z_layer);
  return ZR_OK;
}

static zr_result_t zr_image_emit_scaled_rgba(zr_image_emit_ctx_t* ctx, const zr_image_cmd_t* cmd, const uint8_t* blob,
                                             uint16_t target_w, uint16_t target_h, uint8_t** out_scaled) {
  size_t target_bytes = 0u;
  uint8_t* scaled = NULL;
  zr_result_t rc = ZR_OK;

  if (!ctx || !cmd || !blob || !out_scaled) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_image_rgba_out_size(target_w, target_h, &target_bytes);
  if (rc != ZR_OK) {
    return rc;
  }

  scaled = (uint8_t*)zr_arena_alloc(ctx->arena, target_bytes, 16u);
  if (!scaled) {
    return ZR_ERR_OOM;
  }

  rc =
      zr_image_scale_rgba(blob, cmd->px_width, cmd->px_height, cmd->fit_mode, target_w, target_h, scaled, target_bytes);
  if (rc != ZR_OK) {
    return rc;
  }

  *out_scaled = scaled;
  return ZR_OK;
}

static zr_result_t zr_image_emit_sixel_cmd(zr_image_emit_ctx_t* ctx, const zr_image_cmd_t* cmd, const uint8_t* blob) {
  uint16_t target_w = 0u;
  uint16_t target_h = 0u;
  uint8_t* scaled = NULL;
  zr_result_t rc = ZR_OK;

  if (!ctx || !cmd || !blob) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (cmd->format != (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
    return ZR_ERR_UNSUPPORTED;
  }

  rc = zr_image_calc_target_px(ctx, cmd, &target_w, &target_h);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_image_emit_scaled_rgba(ctx, cmd, blob, target_w, target_h, &scaled);
  if (rc != ZR_OK) {
    return rc;
  }

  return zr_image_sixel_emit_rgba(ctx->out, ctx->arena, scaled, target_w, target_h, cmd->dst_col, cmd->dst_row);
}

static zr_result_t zr_image_emit_iterm2_cmd(zr_image_emit_ctx_t* ctx, const zr_image_cmd_t* cmd, const uint8_t* blob) {
  uint16_t target_w = 0u;
  uint16_t target_h = 0u;
  uint8_t* scaled = NULL;
  zr_result_t rc = ZR_OK;

  if (!ctx || !cmd || !blob) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (cmd->format == (uint8_t)ZR_IMAGE_FORMAT_PNG) {
    return zr_image_iterm2_emit_png(ctx->out, blob, (size_t)cmd->blob_len, cmd->dst_col, cmd->dst_row, cmd->dst_cols,
                                    cmd->dst_rows);
  }
  if (cmd->format != (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
    return ZR_ERR_UNSUPPORTED;
  }

  rc = zr_image_calc_target_px(ctx, cmd, &target_w, &target_h);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_image_emit_scaled_rgba(ctx, cmd, blob, target_w, target_h, &scaled);
  if (rc != ZR_OK) {
    return rc;
  }

  return zr_image_iterm2_emit_rgba(ctx->out, ctx->arena, scaled, target_w, target_h, cmd->dst_col, cmd->dst_row,
                                   cmd->dst_cols, cmd->dst_rows);
}

static zr_result_t zr_image_emit_cleanup_kitty(zr_image_emit_ctx_t* ctx) {
  uint32_t i = 0u;
  zr_result_t rc = ZR_OK;
  if (!ctx || !ctx->state || !ctx->out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  for (i = 0u; i < ctx->state->slot_count; i++) {
    zr_image_slot_t* slot = &ctx->state->slots[i];
    if (slot->transmitted == 0u || slot->placed_this_frame != 0u) {
      continue;
    }
    rc = zr_image_kitty_emit_delete(ctx->out, slot->kitty_id);
    if (rc != ZR_OK) {
      return rc;
    }
    memset(slot, 0, sizeof(*slot));
  }
  return ZR_OK;
}

/* Emit images for the current frame using selected protocol and cleanup rules. */
zr_result_t zr_image_emit_frame(zr_image_emit_ctx_t* ctx) {
  uint32_t i = 0u;
  if (!ctx || !ctx->frame || !ctx->state || !ctx->out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_image_state_begin_frame(ctx->state);
  for (i = 0u; i < ctx->frame->cmds_len; i++) {
    const zr_image_cmd_t* cmd = &ctx->frame->cmds[i];
    uint32_t blob_end = 0u;
    const uint8_t* blob = NULL;
    zr_image_protocol_t proto = zr_image_select_protocol(cmd->protocol, ctx->profile);
    zr_result_t rc = ZR_OK;

    /* Guard blob_off + blob_len before creating any derived blob pointer. */
    if (!zr_checked_add_u32(cmd->blob_off, cmd->blob_len, &blob_end) || blob_end > ctx->frame->blob_len) {
      return ZR_ERR_INVALID_ARGUMENT;
    }
    if (cmd->blob_len != 0u) {
      if (!ctx->frame->blob_bytes) {
        return ZR_ERR_INVALID_ARGUMENT;
      }
      blob = ctx->frame->blob_bytes + cmd->blob_off;
    }

    if (proto == ZR_IMG_PROTO_NONE) {
      continue;
    }
    if (proto == ZR_IMG_PROTO_KITTY) {
      rc = zr_image_emit_kitty_cmd(ctx, cmd, blob);
    } else if (proto == ZR_IMG_PROTO_SIXEL) {
      rc = zr_image_emit_sixel_cmd(ctx, cmd, blob);
    } else {
      rc = zr_image_emit_iterm2_cmd(ctx, cmd, blob);
    }
    if (rc != ZR_OK) {
      return rc;
    }
  }

  return zr_image_emit_cleanup_kitty(ctx);
}
