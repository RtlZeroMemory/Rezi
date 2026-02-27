/*
  src/core/zr_drawlist.c — Drawlist validator + executor (v1/v2).

  Why: Validates wrapper-provided drawlist bytes (bounds/caps/version) and
  executes deterministic drawing into the framebuffer without UB.
  Invariants:
    - Offsets/sizes validated before any derived pointer is created.
    - Unaligned reads use safe helpers (no type-punning casts).
*/

#include "core/zr_drawlist.h"

#include "core/zr_blit.h"
#include "core/zr_framebuffer.h"
#include "core/zr_image.h"
#include "core/zr_version.h"

#include "unicode/zr_grapheme.h"
#include "unicode/zr_utf8.h"
#include "unicode/zr_width.h"

#include "util/zr_bytes.h"
#include "util/zr_checked.h"
#include "util/zr_macros.h"

#include <stdlib.h>
#include <string.h>

/* Drawlist format identifiers. */
#define ZR_DL_MAGIC 0x4C44525Au /* 'ZRDL' as little-endian u32 */

/* Alignment requirement for drawlist sections. */
#define ZR_DL_ALIGNMENT 4u

/* DRAW_TEXT_RUN blob framing: u32 seg_count + repeated fixed-size segments. */
#define ZR_DL_TEXT_RUN_HEADER_BYTES sizeof(uint32_t)
#define ZR_DL_TEXT_RUN_SEGMENT_TAIL_BYTES (3u * sizeof(uint32_t))

/* Fixed field groups (without style payload). */
#define ZR_DL_FILL_RECT_FIELDS_BYTES (4u * sizeof(int32_t))
#define ZR_DL_DRAW_TEXT_FIELDS_BYTES ((2u * sizeof(int32_t)) + (3u * sizeof(uint32_t)))
#define ZR_DL_DRAW_TEXT_TRAILER_BYTES sizeof(uint32_t)

/* v1 style payload (base + underline/link refs). */
#define ZR_DL_STYLE_V1_BYTES ((uint32_t)sizeof(zr_dl_style_v3_t))

typedef struct zr_dl_style_wire_t {
  uint32_t fg;
  uint32_t bg;
  uint32_t attrs;
  uint32_t reserved0;
  uint32_t underline_rgb;
  uint32_t link_uri_ref;
  uint32_t link_id_ref;
} zr_dl_style_wire_t;

typedef struct zr_dl_cmd_fill_rect_wire_t {
  int32_t x;
  int32_t y;
  int32_t w;
  int32_t h;
  zr_dl_style_wire_t style;
} zr_dl_cmd_fill_rect_wire_t;

typedef struct zr_dl_cmd_draw_text_wire_t {
  int32_t x;
  int32_t y;
  uint32_t string_id;
  uint32_t byte_off;
  uint32_t byte_len;
  zr_dl_style_wire_t style;
  uint32_t reserved0;
} zr_dl_cmd_draw_text_wire_t;

typedef struct zr_dl_text_run_segment_wire_t {
  zr_dl_style_wire_t style;
  uint32_t string_id;
  uint32_t byte_off;
  uint32_t byte_len;
} zr_dl_text_run_segment_wire_t;

static uint32_t zr_dl_style_wire_bytes(void) {
  return ZR_DL_STYLE_V1_BYTES;
}

static uint32_t zr_dl_cmd_fill_rect_size(void) {
  const uint32_t payload = (uint32_t)ZR_DL_FILL_RECT_FIELDS_BYTES + zr_dl_style_wire_bytes();
  return (uint32_t)sizeof(zr_dl_cmd_header_t) + payload;
}

static uint32_t zr_dl_cmd_draw_text_size(void) {
  const uint32_t payload =
      (uint32_t)ZR_DL_DRAW_TEXT_FIELDS_BYTES + zr_dl_style_wire_bytes() + (uint32_t)ZR_DL_DRAW_TEXT_TRAILER_BYTES;
  return (uint32_t)sizeof(zr_dl_cmd_header_t) + payload;
}

static size_t zr_dl_text_run_segment_bytes(void) {
  return (size_t)zr_dl_style_wire_bytes() + ZR_DL_TEXT_RUN_SEGMENT_TAIL_BYTES;
}

static bool zr_is_aligned4_u32(uint32_t v) {
  return (v & (ZR_DL_ALIGNMENT - 1u)) == 0u;
}

static bool zr_checked_add_u32_to_size(uint32_t a, uint32_t b, size_t* out) {
  uint32_t sum = 0u;
  if (!zr_checked_add_u32(a, b, &sum)) {
    return false;
  }
  *out = (size_t)sum;
  return true;
}

static bool zr_checked_mul_u32_to_u32(uint32_t a, uint32_t b, uint32_t* out) {
  uint32_t prod = 0u;
  if (!zr_checked_mul_u32(a, b, &prod)) {
    return false;
  }
  *out = prod;
  return true;
}

static int32_t zr_dl_store_find_index(const zr_dl_resource_store_t* store, uint32_t id) {
  if (!store) {
    return -1;
  }
  for (uint32_t i = 0u; i < store->len; i++) {
    if (store->entries[i].id == id) {
      return (int32_t)i;
    }
  }
  return -1;
}

static zr_result_t zr_dl_store_ensure_cap(zr_dl_resource_store_t* store, uint32_t need) {
  uint32_t cap = 0u;
  zr_dl_resource_entry_t* next = NULL;
  size_t bytes = 0u;
  if (!store) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (need <= store->cap) {
    return ZR_OK;
  }

  cap = (store->cap == 0u) ? 8u : store->cap;
  while (cap < need) {
    if (cap > (UINT32_MAX / 2u)) {
      cap = need;
      break;
    }
    cap *= 2u;
  }
  if (!zr_checked_mul_size((size_t)cap, sizeof(zr_dl_resource_entry_t), &bytes)) {
    return ZR_ERR_LIMIT;
  }
  next = (zr_dl_resource_entry_t*)realloc(store->entries, bytes);
  if (!next) {
    return ZR_ERR_OOM;
  }
  store->entries = next;
  store->cap = cap;
  return ZR_OK;
}

static void zr_dl_store_release(zr_dl_resource_store_t* store) {
  if (!store) {
    return;
  }
  for (uint32_t i = 0u; i < store->len; i++) {
    if (store->entries[i].owned != 0u) {
      free(store->entries[i].bytes);
    }
  }
  free(store->entries);
  memset(store, 0, sizeof(*store));
}

static zr_result_t zr_dl_store_define(zr_dl_resource_store_t* store, uint32_t id, const uint8_t* bytes,
                                      uint32_t byte_len) {
  int32_t idx = -1;
  uint8_t* copy = NULL;
  uint32_t old_len = 0u;
  uint32_t base_total = 0u;

  if (!store || id == 0u || (!bytes && byte_len != 0u)) {
    return ZR_ERR_FORMAT;
  }
  if (store->len != 0u && !store->entries) {
    return ZR_ERR_LIMIT;
  }

  if (byte_len != 0u) {
    copy = (uint8_t*)malloc((size_t)byte_len);
    if (!copy) {
      return ZR_ERR_OOM;
    }
    memcpy(copy, bytes, (size_t)byte_len);
  }

  idx = zr_dl_store_find_index(store, id);
  if (idx >= 0) {
    if (!store->entries) {
      free(copy);
      return ZR_ERR_FORMAT;
    }
    old_len = store->entries[(uint32_t)idx].len;
    if (old_len > store->total_bytes) {
      free(copy);
      return ZR_ERR_LIMIT;
    }
    base_total = store->total_bytes - old_len;
    if (byte_len > (UINT32_MAX - base_total)) {
      free(copy);
      return ZR_ERR_LIMIT;
    }
    if (store->entries[(uint32_t)idx].owned != 0u) {
      free(store->entries[(uint32_t)idx].bytes);
    }
    store->entries[(uint32_t)idx].bytes = copy;
    store->entries[(uint32_t)idx].len = byte_len;
    store->entries[(uint32_t)idx].owned = 1u;
    memset(store->entries[(uint32_t)idx].reserved0, 0, sizeof(store->entries[(uint32_t)idx].reserved0));
    store->total_bytes = base_total + byte_len;
    return ZR_OK;
  }

  if (store->total_bytes > (UINT32_MAX - byte_len)) {
    free(copy);
    return ZR_ERR_LIMIT;
  }
  zr_result_t rc = zr_dl_store_ensure_cap(store, store->len + 1u);
  if (rc != ZR_OK) {
    free(copy);
    return rc;
  }

  store->entries[store->len].id = id;
  store->entries[store->len].bytes = copy;
  store->entries[store->len].len = byte_len;
  store->entries[store->len].owned = 1u;
  memset(store->entries[store->len].reserved0, 0, sizeof(store->entries[store->len].reserved0));
  store->len += 1u;
  store->total_bytes += byte_len;
  return ZR_OK;
}

static zr_result_t zr_dl_store_free_id(zr_dl_resource_store_t* store, uint32_t id) {
  int32_t idx = -1;
  uint32_t i = 0u;
  if (!store || id == 0u) {
    return ZR_ERR_FORMAT;
  }
  idx = zr_dl_store_find_index(store, id);
  if (idx < 0) {
    return ZR_OK;
  }
  i = (uint32_t)idx;
  if (store->entries[i].len > store->total_bytes) {
    return ZR_ERR_LIMIT;
  }
  store->total_bytes -= store->entries[i].len;
  if (store->entries[i].owned != 0u) {
    free(store->entries[i].bytes);
  }
  for (; i + 1u < store->len; i++) {
    store->entries[i] = store->entries[i + 1u];
  }
  store->len -= 1u;
  return ZR_OK;
}

static zr_result_t zr_dl_store_lookup(const zr_dl_resource_store_t* store, uint32_t id, const uint8_t** out_bytes,
                                      uint32_t* out_len) {
  int32_t idx = -1;
  if (!store || !out_bytes || !out_len || id == 0u) {
    return ZR_ERR_FORMAT;
  }
  idx = zr_dl_store_find_index(store, id);
  if (idx < 0) {
    return ZR_ERR_FORMAT;
  }
  *out_bytes = store->entries[(uint32_t)idx].bytes;
  *out_len = store->entries[(uint32_t)idx].len;
  return ZR_OK;
}

void zr_dl_resources_init(zr_dl_resources_t* resources) {
  if (!resources) {
    return;
  }
  memset(resources, 0, sizeof(*resources));
}

void zr_dl_resources_release(zr_dl_resources_t* resources) {
  if (!resources) {
    return;
  }
  zr_dl_store_release(&resources->strings);
  zr_dl_store_release(&resources->blobs);
}

void zr_dl_resources_swap(zr_dl_resources_t* a, zr_dl_resources_t* b) {
  zr_dl_resources_t tmp;
  if (!a || !b) {
    return;
  }
  tmp = *a;
  *a = *b;
  *b = tmp;
}

zr_result_t zr_dl_resources_clone(zr_dl_resources_t* dst, const zr_dl_resources_t* src) {
  zr_dl_resources_t tmp;
  zr_result_t rc = ZR_OK;
  if (!dst || !src) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_dl_resources_init(&tmp);
  for (uint32_t i = 0u; i < src->strings.len; i++) {
    const zr_dl_resource_entry_t* e = &src->strings.entries[i];
    rc = zr_dl_store_define(&tmp.strings, e->id, e->bytes, e->len);
    if (rc != ZR_OK) {
      zr_dl_resources_release(&tmp);
      return rc;
    }
  }
  for (uint32_t i = 0u; i < src->blobs.len; i++) {
    const zr_dl_resource_entry_t* e = &src->blobs.entries[i];
    rc = zr_dl_store_define(&tmp.blobs, e->id, e->bytes, e->len);
    if (rc != ZR_OK) {
      zr_dl_resources_release(&tmp);
      return rc;
    }
  }

  zr_dl_resources_release(dst);
  *dst = tmp;
  return ZR_OK;
}

static zr_result_t zr_dl_store_clone_shallow(zr_dl_resource_store_t* dst, const zr_dl_resource_store_t* src) {
  zr_dl_resource_store_t tmp;
  zr_result_t rc = ZR_OK;
  if (!dst || !src) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  memset(&tmp, 0, sizeof(tmp));
  rc = zr_dl_store_ensure_cap(&tmp, src->len);
  if (rc != ZR_OK) {
    return rc;
  }
  for (uint32_t i = 0u; i < src->len; i++) {
    tmp.entries[i] = src->entries[i];
    tmp.entries[i].owned = 0u;
    memset(tmp.entries[i].reserved0, 0, sizeof(tmp.entries[i].reserved0));
  }
  tmp.len = src->len;
  tmp.total_bytes = src->total_bytes;

  zr_dl_store_release(dst);
  *dst = tmp;
  return ZR_OK;
}

zr_result_t zr_dl_resources_clone_shallow(zr_dl_resources_t* dst, const zr_dl_resources_t* src) {
  zr_dl_resources_t tmp;
  zr_result_t rc = ZR_OK;
  if (!dst || !src) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_dl_resources_init(&tmp);
  rc = zr_dl_store_clone_shallow(&tmp.strings, &src->strings);
  if (rc != ZR_OK) {
    zr_dl_resources_release(&tmp);
    return rc;
  }
  rc = zr_dl_store_clone_shallow(&tmp.blobs, &src->blobs);
  if (rc != ZR_OK) {
    zr_dl_resources_release(&tmp);
    return rc;
  }

  zr_dl_resources_release(dst);
  *dst = tmp;
  return ZR_OK;
}

static zr_result_t zr_dl_read_i32le(zr_byte_reader_t* r, int32_t* out) {
  uint32_t tmp = 0u;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u32le(r, &tmp)) {
    return ZR_ERR_FORMAT;
  }
  *out = (int32_t)tmp;
  return ZR_OK;
}

static zr_result_t zr_dl_read_style(zr_byte_reader_t* r, zr_dl_style_t* out) {
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u32le(r, &out->fg) || !zr_byte_reader_read_u32le(r, &out->bg) ||
      !zr_byte_reader_read_u32le(r, &out->attrs) || !zr_byte_reader_read_u32le(r, &out->reserved0)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_style_wire(zr_byte_reader_t* r, uint32_t version, zr_dl_style_wire_t* out) {
  zr_dl_style_t base;
  zr_result_t rc = ZR_OK;
  (void)version;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  memset(out, 0, sizeof(*out));
  rc = zr_dl_read_style(r, &base);
  if (rc != ZR_OK) {
    return rc;
  }
  out->fg = base.fg;
  out->bg = base.bg;
  out->attrs = base.attrs;
  out->reserved0 = base.reserved0;

  if (!zr_byte_reader_read_u32le(r, &out->underline_rgb) || !zr_byte_reader_read_u32le(r, &out->link_uri_ref) ||
      !zr_byte_reader_read_u32le(r, &out->link_id_ref)) {
    return ZR_ERR_FORMAT;
  }

  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_header(zr_byte_reader_t* r, zr_dl_cmd_header_t* out) {
  uint16_t opcode = 0u;
  uint16_t flags = 0u;
  uint32_t size = 0u;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u16le(r, &opcode) || !zr_byte_reader_read_u16le(r, &flags) ||
      !zr_byte_reader_read_u32le(r, &size)) {
    return ZR_ERR_FORMAT;
  }
  out->opcode = opcode;
  out->flags = flags;
  out->size = size;
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_fill_rect(zr_byte_reader_t* r, uint32_t version, zr_dl_cmd_fill_rect_wire_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->y);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->w);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->h);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_style_wire(r, version, &out->style);
  if (rc != ZR_OK) {
    return rc;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_draw_text(zr_byte_reader_t* r, uint32_t version, zr_dl_cmd_draw_text_wire_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->y);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_byte_reader_read_u32le(r, &out->string_id) || !zr_byte_reader_read_u32le(r, &out->byte_off) ||
      !zr_byte_reader_read_u32le(r, &out->byte_len)) {
    return ZR_ERR_FORMAT;
  }
  rc = zr_dl_read_style_wire(r, version, &out->style);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_byte_reader_read_u32le(r, &out->reserved0)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_push_clip(zr_byte_reader_t* r, zr_dl_cmd_push_clip_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->y);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->w);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->h);
  if (rc != ZR_OK) {
    return rc;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_blit_rect(zr_byte_reader_t* r, zr_dl_cmd_blit_rect_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->src_x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->src_y);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->w);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->h);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->dst_x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->dst_y);
  if (rc != ZR_OK) {
    return rc;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_draw_text_run(zr_byte_reader_t* r, zr_dl_cmd_draw_text_run_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->y);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_byte_reader_read_u32le(r, &out->blob_id) || !zr_byte_reader_read_u32le(r, &out->reserved0)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_set_cursor(zr_byte_reader_t* r, zr_dl_cmd_set_cursor_t* out) {
  zr_result_t rc = ZR_OK;
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_i32le(r, &out->x);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_read_i32le(r, &out->y);
  if (rc != ZR_OK) {
    return rc;
  }

  if (!zr_byte_reader_read_u8(r, &out->shape) || !zr_byte_reader_read_u8(r, &out->visible) ||
      !zr_byte_reader_read_u8(r, &out->blink) || !zr_byte_reader_read_u8(r, &out->reserved0)) {
    return ZR_ERR_FORMAT;
  }

  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_draw_canvas(zr_byte_reader_t* r, zr_dl_cmd_draw_canvas_t* out) {
  if (!r || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u16le(r, &out->dst_col) || !zr_byte_reader_read_u16le(r, &out->dst_row) ||
      !zr_byte_reader_read_u16le(r, &out->dst_cols) || !zr_byte_reader_read_u16le(r, &out->dst_rows) ||
      !zr_byte_reader_read_u16le(r, &out->px_width) || !zr_byte_reader_read_u16le(r, &out->px_height) ||
      !zr_byte_reader_read_u32le(r, &out->blob_id) || !zr_byte_reader_read_u32le(r, &out->reserved0) ||
      !zr_byte_reader_read_u8(r, &out->blitter) || !zr_byte_reader_read_u8(r, &out->flags) ||
      !zr_byte_reader_read_u16le(r, &out->reserved)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_draw_image(zr_byte_reader_t* r, zr_dl_cmd_draw_image_t* out) {
  uint8_t z_layer_u8 = 0u;
  if (!r || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u16le(r, &out->dst_col) || !zr_byte_reader_read_u16le(r, &out->dst_row) ||
      !zr_byte_reader_read_u16le(r, &out->dst_cols) || !zr_byte_reader_read_u16le(r, &out->dst_rows) ||
      !zr_byte_reader_read_u16le(r, &out->px_width) || !zr_byte_reader_read_u16le(r, &out->px_height) ||
      !zr_byte_reader_read_u32le(r, &out->blob_id) || !zr_byte_reader_read_u32le(r, &out->reserved_blob) ||
      !zr_byte_reader_read_u32le(r, &out->image_id) || !zr_byte_reader_read_u8(r, &out->format) ||
      !zr_byte_reader_read_u8(r, &out->protocol) || !zr_byte_reader_read_u8(r, &z_layer_u8) ||
      !zr_byte_reader_read_u8(r, &out->fit_mode) || !zr_byte_reader_read_u8(r, &out->flags) ||
      !zr_byte_reader_read_u8(r, &out->reserved0) || !zr_byte_reader_read_u16le(r, &out->reserved1)) {
    return ZR_ERR_FORMAT;
  }
  out->z_layer = (int8_t)z_layer_u8;
  return ZR_OK;
}

static bool zr_dl_align4_u32(uint32_t n, uint32_t* out) {
  uint32_t padded = 0u;
  if (!out) {
    return false;
  }
  if (!zr_checked_add_u32(n, 3u, &padded)) {
    return false;
  }
  padded &= ~3u;
  *out = padded;
  return true;
}

static zr_result_t zr_dl_read_cmd_def_resource(zr_byte_reader_t* r, const zr_dl_cmd_header_t* ch,
                                               zr_dl_cmd_def_resource_t* out, const uint8_t** out_bytes,
                                               uint32_t* out_padded_len) {
  uint32_t payload_len = 0u;
  uint32_t padded_len = 0u;
  if (!r || !ch || !out || !out_bytes || !out_padded_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size < ((uint32_t)sizeof(zr_dl_cmd_header_t) + (uint32_t)sizeof(zr_dl_cmd_def_resource_t))) {
    return ZR_ERR_FORMAT;
  }
  payload_len = ch->size - (uint32_t)sizeof(zr_dl_cmd_header_t);

  if (!zr_byte_reader_read_u32le(r, &out->id) || !zr_byte_reader_read_u32le(r, &out->byte_len)) {
    return ZR_ERR_FORMAT;
  }
  if (!zr_dl_align4_u32(out->byte_len, &padded_len)) {
    return ZR_ERR_FORMAT;
  }
  if (payload_len != ((uint32_t)sizeof(zr_dl_cmd_def_resource_t) + padded_len)) {
    return ZR_ERR_FORMAT;
  }
  if (zr_byte_reader_remaining(r) < (size_t)padded_len) {
    return ZR_ERR_FORMAT;
  }
  *out_bytes = r->bytes + r->off;
  if (!zr_byte_reader_skip(r, (size_t)padded_len)) {
    return ZR_ERR_FORMAT;
  }
  *out_padded_len = padded_len;
  return ZR_OK;
}

static zr_result_t zr_dl_read_cmd_free_resource(zr_byte_reader_t* r, zr_dl_cmd_free_resource_t* out) {
  if (!r || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_byte_reader_read_u32le(r, &out->id)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_read_header(const uint8_t* bytes, size_t bytes_len, zr_dl_header_t* out) {
  if (!out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  memset(out, 0, sizeof(*out));
  if (!bytes || bytes_len < sizeof(zr_dl_header_t)) {
    return ZR_ERR_FORMAT;
  }

  zr_byte_reader_t r;
  zr_byte_reader_init(&r, bytes, bytes_len);

  uint32_t fields[16];
  for (size_t i = 0u; i < 16u; i++) {
    if (!zr_byte_reader_read_u32le(&r, &fields[i])) {
      return ZR_ERR_FORMAT;
    }
  }

  out->magic = fields[0];
  out->version = fields[1];
  out->header_size = fields[2];
  out->total_size = fields[3];
  out->cmd_offset = fields[4];
  out->cmd_bytes = fields[5];
  out->cmd_count = fields[6];
  out->strings_span_offset = fields[7];
  out->strings_count = fields[8];
  out->strings_bytes_offset = fields[9];
  out->strings_bytes_len = fields[10];
  out->blobs_span_offset = fields[11];
  out->blobs_count = fields[12];
  out->blobs_bytes_offset = fields[13];
  out->blobs_bytes_len = fields[14];
  out->reserved0 = fields[15];

  return ZR_OK;
}

typedef struct zr_dl_range_t {
  uint32_t off;
  uint32_t len;
} zr_dl_range_t;

static bool zr_dl_version_supported(uint32_t version) {
  return version == ZR_DRAWLIST_VERSION_V1 || version == ZR_DRAWLIST_VERSION_V2;
}

static bool zr_dl_version_supports_blit_rect(uint32_t version) {
  return version >= ZR_DRAWLIST_VERSION_V2;
}

static bool zr_dl_range_is_empty(zr_dl_range_t r) {
  return r.len == 0u;
}

/* Validate that a byte range [off, off+len) fits within the buffer. */
static zr_result_t zr_dl_range_validate(zr_dl_range_t r, size_t bytes_len) {
  size_t end = 0u;
  if (!zr_checked_add_u32_to_size(r.off, r.len, &end)) {
    return ZR_ERR_FORMAT;
  }
  if (end > bytes_len) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

/* Check if two byte ranges overlap (empty ranges never overlap). */
static bool zr_dl_ranges_overlap(zr_dl_range_t a, zr_dl_range_t b) {
  if (zr_dl_range_is_empty(a) || zr_dl_range_is_empty(b)) {
    return false;
  }
  size_t a2 = 0u;
  size_t b2 = 0u;
  if (!zr_checked_add_u32_to_size(a.off, a.len, &a2) || !zr_checked_add_u32_to_size(b.off, b.len, &b2)) {
    return true;
  }
  const size_t a1 = (size_t)a.off;
  const size_t b1 = (size_t)b.off;
  return (a1 < b2) && (b1 < a2);
}

static zr_result_t zr_dl_span_read_host(const uint8_t* p, zr_dl_span_t* out) {
  if (!p || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  out->off = zr_load_u32le(p + 0);
  out->len = zr_load_u32le(p + 4);
  return ZR_OK;
}

typedef struct zr_dl_v1_ranges_t {
  zr_dl_range_t header;
  zr_dl_range_t cmd;
  zr_dl_range_t strings_spans;
  zr_dl_range_t strings_bytes;
  zr_dl_range_t blobs_spans;
  zr_dl_range_t blobs_bytes;
} zr_dl_v1_ranges_t;

/* Validate drawlist header: magic, version, alignment, caps, and section offsets. */
static zr_result_t zr_dl_validate_header(const zr_dl_header_t* hdr, size_t bytes_len, const zr_limits_t* lim) {
  if (!hdr || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (hdr->magic != ZR_DL_MAGIC) {
    return ZR_ERR_FORMAT;
  }
  if (!zr_dl_version_supported(hdr->version)) {
    return ZR_ERR_UNSUPPORTED;
  }
  if (hdr->header_size != (uint32_t)sizeof(zr_dl_header_t)) {
    return ZR_ERR_FORMAT;
  }
  if (hdr->total_size != (uint32_t)bytes_len) {
    return ZR_ERR_FORMAT;
  }
  if (!zr_is_aligned4_u32(hdr->total_size) || !zr_is_aligned4_u32(hdr->cmd_bytes) ||
      !zr_is_aligned4_u32(hdr->strings_bytes_len) || !zr_is_aligned4_u32(hdr->blobs_bytes_len)) {
    return ZR_ERR_FORMAT;
  }

  if (hdr->reserved0 != 0u) {
    return ZR_ERR_FORMAT;
  }

  if (hdr->cmd_count > lim->dl_max_cmds) {
    return ZR_ERR_LIMIT;
  }

  if (hdr->strings_count != 0u || hdr->strings_span_offset != 0u || hdr->strings_bytes_offset != 0u ||
      hdr->strings_bytes_len != 0u) {
    return ZR_ERR_FORMAT;
  }
  if (hdr->blobs_count != 0u || hdr->blobs_span_offset != 0u || hdr->blobs_bytes_offset != 0u ||
      hdr->blobs_bytes_len != 0u) {
    return ZR_ERR_FORMAT;
  }

  if (!zr_is_aligned4_u32(hdr->cmd_offset) || !zr_is_aligned4_u32(hdr->strings_span_offset) ||
      !zr_is_aligned4_u32(hdr->strings_bytes_offset) || !zr_is_aligned4_u32(hdr->blobs_span_offset) ||
      !zr_is_aligned4_u32(hdr->blobs_bytes_offset)) {
    return ZR_ERR_FORMAT;
  }

  if (hdr->cmd_count == 0u) {
    if (hdr->cmd_offset != 0u || hdr->cmd_bytes != 0u) {
      return ZR_ERR_FORMAT;
    }
  }

  return ZR_OK;
}

/* Build the set of byte ranges for each drawlist section from the header. */
static zr_result_t zr_dl_build_ranges_v1(const zr_dl_header_t* hdr, uint32_t strings_span_bytes,
                                         uint32_t blobs_span_bytes, zr_dl_v1_ranges_t* out) {
  if (!hdr || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  out->header.off = 0u;
  out->header.len = (uint32_t)sizeof(zr_dl_header_t);

  out->cmd.off = hdr->cmd_offset;
  out->cmd.len = hdr->cmd_bytes;

  out->strings_spans.off = hdr->strings_span_offset;
  out->strings_spans.len = strings_span_bytes;

  out->strings_bytes.off = hdr->strings_bytes_offset;
  out->strings_bytes.len = hdr->strings_bytes_len;

  out->blobs_spans.off = hdr->blobs_span_offset;
  out->blobs_spans.len = blobs_span_bytes;

  out->blobs_bytes.off = hdr->blobs_bytes_offset;
  out->blobs_bytes.len = hdr->blobs_bytes_len;

  return ZR_OK;
}

/* Ensure all section ranges fit in buffer and none overlap with each other. */
static zr_result_t zr_dl_validate_ranges_v1(const zr_dl_v1_ranges_t* r, size_t bytes_len) {
  if (!r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (zr_dl_range_validate(r->cmd, bytes_len) != ZR_OK || zr_dl_range_validate(r->strings_spans, bytes_len) != ZR_OK ||
      zr_dl_range_validate(r->strings_bytes, bytes_len) != ZR_OK ||
      zr_dl_range_validate(r->blobs_spans, bytes_len) != ZR_OK ||
      zr_dl_range_validate(r->blobs_bytes, bytes_len) != ZR_OK) {
    return ZR_ERR_FORMAT;
  }

  /* --- Header vs section overlap checks --- */
  const zr_dl_range_t non_header[] = {r->cmd, r->strings_spans, r->strings_bytes, r->blobs_spans, r->blobs_bytes};
  for (size_t i = 0u; i < ZR_ARRAYLEN(non_header); i++) {
    if (zr_dl_ranges_overlap(r->header, non_header[i])) {
      return ZR_ERR_FORMAT;
    }
  }

  /* --- Pairwise section overlap checks --- */
  for (size_t i = 0u; i < ZR_ARRAYLEN(non_header); i++) {
    for (size_t j = i + 1u; j < ZR_ARRAYLEN(non_header); j++) {
      if (zr_dl_ranges_overlap(non_header[i], non_header[j])) {
        return ZR_ERR_FORMAT;
      }
    }
  }

  return ZR_OK;
}

/* Validate that all spans in a span table fit within the payload section. */
static zr_result_t zr_dl_validate_span_table_v1(const uint8_t* bytes, uint32_t span_table_offset, uint32_t span_count,
                                                uint32_t payload_bytes_len) {
  if (!bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  for (uint32_t i = 0u; i < span_count; i++) {
    const size_t span_off = (size_t)i * sizeof(zr_dl_span_t);
    zr_dl_span_t span;
    if (zr_dl_span_read_host(bytes + span_table_offset + span_off, &span) != ZR_OK) {
      return ZR_ERR_FORMAT;
    }
    size_t end = 0u;
    if (!zr_checked_add_u32_to_size(span.off, span.len, &end)) {
      return ZR_ERR_FORMAT;
    }
    if (end > (size_t)payload_bytes_len) {
      return ZR_ERR_FORMAT;
    }
  }
  return ZR_OK;
}

/* Initialize a validated view structure with pointers into the drawlist buffer. */
static void zr_dl_view_init(zr_dl_view_t* view, const zr_dl_header_t* hdr, const uint8_t* bytes, size_t bytes_len) {
  memset(view, 0, sizeof(*view));
  view->hdr = *hdr;
  view->bytes = bytes;
  view->bytes_len = bytes_len;
  view->cmd_bytes = (hdr->cmd_bytes != 0u) ? (bytes + hdr->cmd_offset) : NULL;
  view->cmd_bytes_len = (size_t)hdr->cmd_bytes;
  view->strings_span_bytes = (hdr->strings_count != 0u) ? (bytes + hdr->strings_span_offset) : NULL;
  view->strings_count = (size_t)hdr->strings_count;
  view->strings_bytes = (hdr->strings_count != 0u) ? (bytes + hdr->strings_bytes_offset) : NULL;
  view->strings_bytes_len = (size_t)hdr->strings_bytes_len;
  view->blobs_span_bytes = (hdr->blobs_count != 0u) ? (bytes + hdr->blobs_span_offset) : NULL;
  view->blobs_count = (size_t)hdr->blobs_count;
  view->blobs_bytes = (hdr->blobs_count != 0u) ? (bytes + hdr->blobs_bytes_offset) : NULL;
  view->blobs_bytes_len = (size_t)hdr->blobs_bytes_len;
}

static zr_result_t zr_dl_validate_cmd_clear(const zr_dl_cmd_header_t* ch) {
  if (!ch) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)sizeof(zr_dl_cmd_header_t)) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_style(const zr_dl_view_t* view, const zr_dl_style_wire_t* style, uint32_t version) {
  (void)version;
  if (!view || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_fill_rect(const zr_dl_view_t* view, const zr_dl_cmd_header_t* ch,
                                                zr_byte_reader_t* r) {
  if (!view || !ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != zr_dl_cmd_fill_rect_size()) {
    return ZR_ERR_FORMAT;
  }

  zr_dl_cmd_fill_rect_wire_t cmd;
  zr_result_t rc = zr_dl_read_cmd_fill_rect(r, view->hdr.version, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_dl_validate_style(view, &cmd.style, view->hdr.version);
}

static zr_result_t zr_dl_validate_cmd_draw_text(const zr_dl_view_t* view, const zr_dl_cmd_header_t* ch,
                                                zr_byte_reader_t* r) {
  if (!view || !ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != zr_dl_cmd_draw_text_size()) {
    return ZR_ERR_FORMAT;
  }

  zr_dl_cmd_draw_text_wire_t cmd;
  zr_result_t rc = zr_dl_read_cmd_draw_text(r, view->hdr.version, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.reserved0 != 0u || cmd.string_id == 0u) {
    return ZR_ERR_FORMAT;
  }
  return zr_dl_validate_style(view, &cmd.style, view->hdr.version);
}

static zr_result_t zr_dl_validate_cmd_push_clip(const zr_dl_cmd_header_t* ch, zr_byte_reader_t* r,
                                                const zr_limits_t* lim, uint32_t* clip_depth) {
  if (!ch || !r || !lim || !clip_depth) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_push_clip_t))) {
    return ZR_ERR_FORMAT;
  }
  zr_dl_cmd_push_clip_t cmd;
  zr_result_t rc = zr_dl_read_cmd_push_clip(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  (void)cmd;
  (*clip_depth)++;
  if (*clip_depth > lim->dl_max_clip_depth) {
    return ZR_ERR_LIMIT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_blit_rect(const zr_dl_cmd_header_t* ch, zr_byte_reader_t* r) {
  if (!ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_blit_rect_t))) {
    return ZR_ERR_FORMAT;
  }
  zr_dl_cmd_blit_rect_t cmd;
  zr_result_t rc = zr_dl_read_cmd_blit_rect(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.w <= 0 || cmd.h <= 0) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_pop_clip(const zr_dl_cmd_header_t* ch, uint32_t* clip_depth) {
  if (!ch || !clip_depth) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)sizeof(zr_dl_cmd_header_t) || *clip_depth == 0u) {
    return ZR_ERR_FORMAT;
  }
  (*clip_depth)--;
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_draw_text_run(const zr_dl_view_t* view, const zr_dl_cmd_header_t* ch,
                                                    zr_byte_reader_t* r, const zr_limits_t* lim) {
  if (!view || !ch || !r || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_draw_text_run_t))) {
    return ZR_ERR_FORMAT;
  }
  zr_dl_cmd_draw_text_run_t cmd;
  zr_result_t rc = zr_dl_read_cmd_draw_text_run(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.reserved0 != 0u) {
    return ZR_ERR_FORMAT;
  }
  if (cmd.blob_id == 0u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_set_cursor(const zr_dl_cmd_header_t* ch, zr_byte_reader_t* r) {
  if (!ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_set_cursor_t))) {
    return ZR_ERR_FORMAT;
  }
  zr_dl_cmd_set_cursor_t cmd;
  zr_result_t rc = zr_dl_read_cmd_set_cursor(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.reserved0 != 0u || cmd.x < -1 || cmd.y < -1) {
    return ZR_ERR_FORMAT;
  }
  if (cmd.shape > ZR_CURSOR_SHAPE_BAR || cmd.visible > 1u || cmd.blink > 1u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static uint8_t zr_dl_canvas_blitter_valid(uint8_t blitter) {
  return blitter <= (uint8_t)ZR_BLIT_ASCII;
}

static uint8_t zr_dl_image_protocol_valid(uint8_t protocol) {
  return protocol <= (uint8_t)ZR_IMG_PROTO_ITERM2;
}

static uint8_t zr_dl_image_format_valid(uint8_t format) {
  return format <= (uint8_t)ZR_IMAGE_FORMAT_PNG;
}

static uint8_t zr_dl_image_fit_mode_valid(uint8_t fit_mode) {
  return fit_mode <= (uint8_t)ZR_IMAGE_FIT_COVER;
}

static zr_result_t zr_dl_validate_cmd_draw_canvas(const zr_dl_view_t* view, const zr_dl_cmd_header_t* ch,
                                                  zr_byte_reader_t* r) {
  zr_dl_cmd_draw_canvas_t cmd;
  uint32_t row_bytes = 0u;

  if (!view || !ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_draw_canvas_t))) {
    return ZR_ERR_FORMAT;
  }

  zr_result_t rc = zr_dl_read_cmd_draw_canvas(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  if (cmd.flags != 0u || cmd.reserved != 0u || cmd.reserved0 != 0u || cmd.blob_id == 0u || cmd.dst_cols == 0u ||
      cmd.dst_rows == 0u || cmd.px_width == 0u || cmd.px_height == 0u ||
      zr_dl_canvas_blitter_valid(cmd.blitter) == 0u) {
    return ZR_ERR_FORMAT;
  }

  if (!zr_checked_mul_u32((uint32_t)cmd.px_width, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &row_bytes)) {
    return ZR_ERR_FORMAT;
  }
  if (row_bytes > UINT16_MAX) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_draw_image(const zr_dl_view_t* view, const zr_dl_cmd_header_t* ch,
                                                 zr_byte_reader_t* r) {
  zr_dl_cmd_draw_image_t cmd;

  if (!view || !ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != (uint32_t)(sizeof(zr_dl_cmd_header_t) + sizeof(zr_dl_cmd_draw_image_t))) {
    return ZR_ERR_FORMAT;
  }

  zr_result_t rc = zr_dl_read_cmd_draw_image(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  if (cmd.flags != 0u || cmd.reserved0 != 0u || cmd.reserved1 != 0u || cmd.reserved_blob != 0u || cmd.blob_id == 0u ||
      cmd.dst_cols == 0u || cmd.dst_rows == 0u || cmd.px_width == 0u || cmd.px_height == 0u ||
      zr_dl_image_protocol_valid(cmd.protocol) == 0u || zr_dl_image_format_valid(cmd.format) == 0u ||
      zr_dl_image_fit_mode_valid(cmd.fit_mode) == 0u || cmd.z_layer < -1 || cmd.z_layer > 1) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_def_resource(const zr_dl_cmd_header_t* ch, zr_byte_reader_t* r) {
  zr_dl_cmd_def_resource_t cmd;
  const uint8_t* bytes = NULL;
  uint32_t padded_len = 0u;
  zr_result_t rc = ZR_OK;
  if (!ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_cmd_def_resource(r, ch, &cmd, &bytes, &padded_len);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.id == 0u) {
    return ZR_ERR_FORMAT;
  }
  for (uint32_t i = cmd.byte_len; i < padded_len; i++) {
    if (bytes[i] != 0u) {
      return ZR_ERR_FORMAT;
    }
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_free_resource(const zr_dl_cmd_header_t* ch, zr_byte_reader_t* r) {
  zr_dl_cmd_free_resource_t cmd;
  zr_result_t rc = ZR_OK;
  if (!ch || !r) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != ((uint32_t)sizeof(zr_dl_cmd_header_t) + (uint32_t)sizeof(zr_dl_cmd_free_resource_t))) {
    return ZR_ERR_FORMAT;
  }
  rc = zr_dl_read_cmd_free_resource(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.id == 0u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_validate_cmd_payload(const zr_dl_view_t* view, const zr_limits_t* lim, zr_byte_reader_t* r,
                                              const zr_dl_cmd_header_t* ch, uint32_t* clip_depth) {
  if (!view || !lim || !r || !ch || !clip_depth) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  switch ((zr_dl_opcode_t)ch->opcode) {
  case ZR_DL_OP_CLEAR:
    return zr_dl_validate_cmd_clear(ch);
  case ZR_DL_OP_FILL_RECT:
    return zr_dl_validate_cmd_fill_rect(view, ch, r);
  case ZR_DL_OP_DRAW_TEXT:
    return zr_dl_validate_cmd_draw_text(view, ch, r);
  case ZR_DL_OP_PUSH_CLIP:
    return zr_dl_validate_cmd_push_clip(ch, r, lim, clip_depth);
  case ZR_DL_OP_BLIT_RECT:
    if (!zr_dl_version_supports_blit_rect(view->hdr.version)) {
      return ZR_ERR_UNSUPPORTED;
    }
    return zr_dl_validate_cmd_blit_rect(ch, r);
  case ZR_DL_OP_POP_CLIP:
    return zr_dl_validate_cmd_pop_clip(ch, clip_depth);
  case ZR_DL_OP_DRAW_TEXT_RUN:
    return zr_dl_validate_cmd_draw_text_run(view, ch, r, lim);
  case ZR_DL_OP_SET_CURSOR:
    return zr_dl_validate_cmd_set_cursor(ch, r);
  case ZR_DL_OP_DRAW_CANVAS:
    return zr_dl_validate_cmd_draw_canvas(view, ch, r);
  case ZR_DL_OP_DRAW_IMAGE:
    return zr_dl_validate_cmd_draw_image(view, ch, r);
  case ZR_DL_OP_DEF_STRING:
  case ZR_DL_OP_DEF_BLOB:
    return zr_dl_validate_cmd_def_resource(ch, r);
  case ZR_DL_OP_FREE_STRING:
  case ZR_DL_OP_FREE_BLOB:
    return zr_dl_validate_cmd_free_resource(ch, r);
  default:
    return ZR_ERR_UNSUPPORTED;
  }
}

static zr_result_t zr_dl_validate_cmd_stream_common(const zr_dl_view_t* view, const zr_limits_t* lim) {
  if (!view || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_byte_reader_t r;
  zr_byte_reader_init(&r, view->cmd_bytes, view->cmd_bytes_len);
  uint32_t clip_depth = 0u;

  for (uint32_t ci = 0u; ci < view->hdr.cmd_count; ci++) {
    zr_dl_cmd_header_t ch;
    zr_result_t rc = zr_dl_read_cmd_header(&r, &ch);
    if (rc != ZR_OK) {
      return rc;
    }
    if (ch.flags != 0u || ch.size < (uint32_t)sizeof(zr_dl_cmd_header_t) || (ch.size & 3u) != 0u) {
      return ZR_ERR_FORMAT;
    }
    const size_t payload = (size_t)ch.size - sizeof(zr_dl_cmd_header_t);
    if (zr_byte_reader_remaining(&r) < payload) {
      return ZR_ERR_FORMAT;
    }

    rc = zr_dl_validate_cmd_payload(view, lim, &r, &ch, &clip_depth);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  if (zr_byte_reader_remaining(&r) != 0u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

/* Walk and validate every command in the command stream (framing/opcodes/fields). */
static zr_result_t zr_dl_validate_cmd_stream_v6(const zr_dl_view_t* view, const zr_limits_t* lim) {
  return zr_dl_validate_cmd_stream_common(view, lim);
}

static zr_result_t zr_dl_read_text_run_segment(zr_byte_reader_t* r, uint32_t version,
                                               zr_dl_text_run_segment_wire_t* out) {
  zr_result_t rc = ZR_OK;
  if (!r || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_dl_read_style_wire(r, version, &out->style);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_byte_reader_read_u32le(r, &out->string_id) || !zr_byte_reader_read_u32le(r, &out->byte_off) ||
      !zr_byte_reader_read_u32le(r, &out->byte_len)) {
    return ZR_ERR_FORMAT;
  }

  return ZR_OK;
}

static zr_result_t zr_dl_text_run_expected_bytes(uint32_t seg_count, uint32_t version, size_t* out_expected) {
  if (!out_expected) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  size_t expected = 0u;
  (void)version;
  const size_t seg_bytes = zr_dl_text_run_segment_bytes();
  if (!zr_checked_mul_size((size_t)seg_count, seg_bytes, &expected)) {
    return ZR_ERR_FORMAT;
  }
  if (!zr_checked_add_size(expected, ZR_DL_TEXT_RUN_HEADER_BYTES, &expected)) {
    return ZR_ERR_FORMAT;
  }

  *out_expected = expected;
  return ZR_OK;
}

/* Fully validate a drawlist buffer and produce a view for execution.
 * Checks header, section ranges, span tables, and all command stream contents. */
zr_result_t zr_dl_validate(const uint8_t* bytes, size_t bytes_len, const zr_limits_t* lim, zr_dl_view_t* out_view) {
  if (!bytes || !lim || !out_view) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  memset(out_view, 0, sizeof(*out_view));

  if (bytes_len > (size_t)lim->dl_max_total_bytes) {
    return ZR_ERR_LIMIT;
  }

  zr_dl_header_t hdr;
  zr_result_t rc = zr_dl_read_header(bytes, bytes_len, &hdr);
  if (rc != ZR_OK) {
    return rc;
  }

  rc = zr_dl_validate_header(&hdr, bytes_len, lim);
  if (rc != ZR_OK) {
    return rc;
  }

  uint32_t str_span_bytes = 0u;
  if (!zr_checked_mul_u32_to_u32(hdr.strings_count, (uint32_t)sizeof(zr_dl_span_t), &str_span_bytes)) {
    return ZR_ERR_FORMAT;
  }
  uint32_t blob_span_bytes = 0u;
  if (!zr_checked_mul_u32_to_u32(hdr.blobs_count, (uint32_t)sizeof(zr_dl_span_t), &blob_span_bytes)) {
    return ZR_ERR_FORMAT;
  }

  zr_dl_v1_ranges_t ranges;
  rc = zr_dl_build_ranges_v1(&hdr, str_span_bytes, blob_span_bytes, &ranges);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_validate_ranges_v1(&ranges, bytes_len);
  if (rc != ZR_OK) {
    return rc;
  }

  /* Span tables. */
  rc = zr_dl_validate_span_table_v1(bytes, hdr.strings_span_offset, hdr.strings_count, hdr.strings_bytes_len);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_validate_span_table_v1(bytes, hdr.blobs_span_offset, hdr.blobs_count, hdr.blobs_bytes_len);
  if (rc != ZR_OK) {
    return rc;
  }

  /* Command stream framing + opcode validation. */
  zr_dl_view_t view;
  zr_dl_view_init(&view, &hdr, bytes, bytes_len);
  rc = zr_dl_validate_cmd_stream_v6(&view, lim);
  if (rc != ZR_OK) {
    return rc;
  }

  *out_view = view;
  return ZR_OK;
}

static zr_result_t zr_dl_validate_span_slice_u32(uint32_t byte_off, uint32_t byte_len, uint32_t span_len) {
  uint32_t slice_end = 0u;
  if (!zr_checked_add_u32(byte_off, byte_len, &slice_end)) {
    return ZR_ERR_FORMAT;
  }
  if (slice_end > span_len) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_resolve_string_slice(const zr_dl_resource_store_t* strings, uint32_t string_id,
                                              uint32_t byte_off, uint32_t byte_len, const uint8_t** out_bytes) {
  const uint8_t* bytes = NULL;
  uint32_t total_len = 0u;
  static const uint8_t kEmptySlice[1] = {0u};
  zr_result_t rc = ZR_OK;
  if (!strings || !out_bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_store_lookup(strings, string_id, &bytes, &total_len);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_validate_span_slice_u32(byte_off, byte_len, total_len);
  if (rc != ZR_OK) {
    return rc;
  }
  if (byte_len == 0u) {
    *out_bytes = kEmptySlice;
    return ZR_OK;
  }
  if (!bytes) {
    return ZR_ERR_FORMAT;
  }
  *out_bytes = bytes + byte_off;
  return ZR_OK;
}

static zr_result_t zr_dl_style_resolve_link(const zr_dl_resource_store_t* strings, zr_fb_t* fb, uint32_t link_uri_ref,
                                            uint32_t link_id_ref, uint32_t* out_fb_link_ref) {
  const uint8_t* uri = NULL;
  const uint8_t* id = NULL;
  uint32_t uri_len = 0u;
  uint32_t id_len = 0u;
  zr_result_t rc = ZR_OK;

  if (!strings || !fb || !out_fb_link_ref) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_fb_link_ref = 0u;

  if (link_uri_ref == 0u) {
    return ZR_OK;
  }

  rc = zr_dl_store_lookup(strings, link_uri_ref, &uri, &uri_len);
  if (rc != ZR_OK) {
    return rc;
  }
  if (uri_len == 0u || uri_len > (uint32_t)ZR_FB_LINK_URI_MAX_BYTES) {
    return ZR_ERR_FORMAT;
  }
  if (link_id_ref != 0u) {
    rc = zr_dl_store_lookup(strings, link_id_ref, &id, &id_len);
    if (rc != ZR_OK) {
      return rc;
    }
    if (id_len > (uint32_t)ZR_FB_LINK_ID_MAX_BYTES) {
      return ZR_ERR_FORMAT;
    }
  }

  return zr_fb_link_intern(fb, uri, (size_t)uri_len, id, (size_t)id_len, out_fb_link_ref);
}

static zr_result_t zr_dl_preflight_style_links(const zr_dl_resource_store_t* strings, zr_fb_t* fb,
                                               const zr_dl_style_wire_t* style) {
  uint32_t link_ref = 0u;
  if (!strings || !fb || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return zr_dl_style_resolve_link(strings, fb, style->link_uri_ref, style->link_id_ref, &link_ref);
}

static zr_result_t zr_style_from_dl(const zr_dl_resource_store_t* strings, zr_fb_t* fb, const zr_dl_style_wire_t* in,
                                    zr_style_t* out) {
  zr_result_t rc = ZR_OK;
  if (!strings || !fb || !in || !out) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  out->fg_rgb = in->fg;
  out->bg_rgb = in->bg;
  out->attrs = in->attrs;
  out->reserved = in->reserved0;
  out->underline_rgb = in->underline_rgb;
  out->link_ref = 0u;

  rc = zr_dl_style_resolve_link(strings, fb, in->link_uri_ref, in->link_id_ref, &out->link_ref);
  if (rc != ZR_OK) {
    return rc;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_preflight_draw_text_run_links(const zr_dl_view_t* v, zr_fb_t* fb,
                                                       const zr_dl_resource_store_t* strings,
                                                       const zr_dl_resource_store_t* blobs, uint32_t blob_id,
                                                       const zr_limits_t* lim) {
  const uint8_t* blob = NULL;
  uint32_t blob_len = 0u;
  zr_byte_reader_t br;
  uint32_t seg_count = 0u;
  size_t expected = 0u;
  zr_result_t rc = ZR_OK;

  if (!v || !fb || !strings || !blobs || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_dl_store_lookup(blobs, blob_id, &blob, &blob_len);
  if (rc != ZR_OK) {
    return rc;
  }

  zr_byte_reader_init(&br, blob, (size_t)blob_len);
  if (!zr_byte_reader_read_u32le(&br, &seg_count)) {
    return ZR_ERR_FORMAT;
  }
  if (seg_count > lim->dl_max_text_run_segments) {
    return ZR_ERR_LIMIT;
  }

  rc = zr_dl_text_run_expected_bytes(seg_count, v->hdr.version, &expected);
  if (rc != ZR_OK) {
    return rc;
  }
  if (expected != (size_t)blob_len) {
    return ZR_ERR_FORMAT;
  }

  for (uint32_t si = 0u; si < seg_count; si++) {
    zr_dl_text_run_segment_wire_t seg;
    rc = zr_dl_read_text_run_segment(&br, v->hdr.version, &seg);
    if (rc != ZR_OK) {
      return rc;
    }
    rc = zr_dl_preflight_style_links(strings, fb, &seg.style);
    if (rc != ZR_OK) {
      return rc;
    }
    const uint8_t* sbytes = NULL;
    rc = zr_dl_resolve_string_slice(strings, seg.string_id, seg.byte_off, seg.byte_len, &sbytes);
    if (rc != ZR_OK) {
      return rc;
    }
    (void)sbytes;
  }

  if (zr_byte_reader_remaining(&br) != 0u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_apply_def_resource(zr_dl_resource_store_t* store, uint32_t max_items, const zr_limits_t* lim,
                                            zr_byte_reader_t* r, const zr_dl_cmd_header_t* ch) {
  zr_dl_cmd_def_resource_t cmd;
  const uint8_t* bytes = NULL;
  uint32_t padded_len = 0u;
  uint32_t old_len = 0u;
  uint32_t base_total = 0u;
  int32_t idx = -1;
  zr_result_t rc = ZR_OK;

  if (!store || !lim || !r || !ch) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_read_cmd_def_resource(r, ch, &cmd, &bytes, &padded_len);
  if (rc != ZR_OK) {
    return rc;
  }
  if (cmd.id == 0u) {
    return ZR_ERR_FORMAT;
  }
  for (uint32_t i = cmd.byte_len; i < padded_len; i++) {
    if (bytes[i] != 0u) {
      return ZR_ERR_FORMAT;
    }
  }

  idx = zr_dl_store_find_index(store, cmd.id);
  if (idx < 0 && store->len >= max_items) {
    return ZR_ERR_LIMIT;
  }
  if (idx >= 0) {
    old_len = store->entries[(uint32_t)idx].len;
    if (old_len > store->total_bytes) {
      return ZR_ERR_LIMIT;
    }
  }
  base_total = store->total_bytes - old_len;
  if (base_total > lim->dl_max_total_bytes) {
    return ZR_ERR_LIMIT;
  }
  if (cmd.byte_len > (lim->dl_max_total_bytes - base_total)) {
    return ZR_ERR_LIMIT;
  }

  return zr_dl_store_define(store, cmd.id, bytes, cmd.byte_len);
}

static zr_result_t zr_dl_apply_free_resource(zr_dl_resource_store_t* store, zr_byte_reader_t* r,
                                             const zr_dl_cmd_header_t* ch) {
  zr_dl_cmd_free_resource_t cmd;
  zr_result_t rc = ZR_OK;
  if (!store || !r || !ch) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (ch->size != ((uint32_t)sizeof(zr_dl_cmd_header_t) + (uint32_t)sizeof(zr_dl_cmd_free_resource_t))) {
    return ZR_ERR_FORMAT;
  }
  rc = zr_dl_read_cmd_free_resource(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_dl_store_free_id(store, cmd.id);
}

static zr_result_t zr_dl_validate_blit_rect_bounds(const zr_fb_t* fb, const zr_dl_cmd_blit_rect_t* cmd) {
  uint32_t src_x_end = 0u;
  uint32_t src_y_end = 0u;
  uint32_t dst_x_end = 0u;
  uint32_t dst_y_end = 0u;

  if (!fb || !cmd) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (cmd->w <= 0 || cmd->h <= 0 || cmd->src_x < 0 || cmd->src_y < 0 || cmd->dst_x < 0 || cmd->dst_y < 0) {
    return ZR_ERR_FORMAT;
  }

  if (!zr_checked_add_u32((uint32_t)cmd->src_x, (uint32_t)cmd->w, &src_x_end) ||
      !zr_checked_add_u32((uint32_t)cmd->src_y, (uint32_t)cmd->h, &src_y_end) ||
      !zr_checked_add_u32((uint32_t)cmd->dst_x, (uint32_t)cmd->w, &dst_x_end) ||
      !zr_checked_add_u32((uint32_t)cmd->dst_y, (uint32_t)cmd->h, &dst_y_end)) {
    return ZR_ERR_FORMAT;
  }
  if (src_x_end > fb->cols || src_y_end > fb->rows || dst_x_end > fb->cols || dst_y_end > fb->rows) {
    return ZR_ERR_FORMAT;
  }

  return ZR_OK;
}

zr_result_t zr_dl_preflight_resources(const zr_dl_view_t* v, zr_fb_t* fb, zr_image_frame_t* image_stage,
                                      const zr_limits_t* lim, const zr_terminal_profile_t* term_profile,
                                      zr_dl_resources_t* resources) {
  zr_result_t rc = ZR_OK;
  uint32_t image_cmd_count = 0u;
  uint32_t image_blob_total_bytes = 0u;

  if (!v || !fb || !image_stage || !lim || !resources) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_byte_reader_t r;
  zr_byte_reader_init(&r, v->cmd_bytes, v->cmd_bytes_len);

  for (uint32_t ci = 0u; ci < v->hdr.cmd_count; ci++) {
    zr_dl_cmd_header_t ch;
    rc = zr_dl_read_cmd_header(&r, &ch);
    if (rc != ZR_OK) {
      return rc;
    }

    switch ((zr_dl_opcode_t)ch.opcode) {
    case ZR_DL_OP_CLEAR:
      break;
    case ZR_DL_OP_DEF_STRING:
      rc = zr_dl_apply_def_resource(&resources->strings, lim->dl_max_strings, lim, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    case ZR_DL_OP_FREE_STRING:
      rc = zr_dl_apply_free_resource(&resources->strings, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    case ZR_DL_OP_DEF_BLOB:
      rc = zr_dl_apply_def_resource(&resources->blobs, lim->dl_max_blobs, lim, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    case ZR_DL_OP_FREE_BLOB:
      rc = zr_dl_apply_free_resource(&resources->blobs, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    case ZR_DL_OP_FILL_RECT: {
      zr_dl_cmd_fill_rect_wire_t cmd;
      rc = zr_dl_read_cmd_fill_rect(&r, v->hdr.version, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_preflight_style_links(&resources->strings, fb, &cmd.style);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_TEXT: {
      zr_dl_cmd_draw_text_wire_t cmd;
      rc = zr_dl_read_cmd_draw_text(&r, v->hdr.version, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_preflight_style_links(&resources->strings, fb, &cmd.style);
      if (rc != ZR_OK) {
        return rc;
      }
      const uint8_t* sbytes = NULL;
      rc = zr_dl_resolve_string_slice(&resources->strings, cmd.string_id, cmd.byte_off, cmd.byte_len, &sbytes);
      if (rc != ZR_OK) {
        return rc;
      }
      (void)sbytes;
      break;
    }
    case ZR_DL_OP_PUSH_CLIP: {
      zr_dl_cmd_push_clip_t cmd;
      rc = zr_dl_read_cmd_push_clip(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_BLIT_RECT: {
      if (!zr_dl_version_supports_blit_rect(v->hdr.version)) {
        return ZR_ERR_UNSUPPORTED;
      }
      zr_dl_cmd_blit_rect_t cmd;
      rc = zr_dl_read_cmd_blit_rect(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_validate_blit_rect_bounds(fb, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_POP_CLIP:
      break;
    case ZR_DL_OP_DRAW_TEXT_RUN: {
      zr_dl_cmd_draw_text_run_t cmd;
      rc = zr_dl_read_cmd_draw_text_run(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_preflight_draw_text_run_links(v, fb, &resources->strings, &resources->blobs, cmd.blob_id, lim);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_SET_CURSOR: {
      zr_dl_cmd_set_cursor_t cmd;
      rc = zr_dl_read_cmd_set_cursor(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_CANVAS: {
      zr_dl_cmd_draw_canvas_t cmd;
      const uint8_t* blob = NULL;
      uint32_t blob_len = 0u;
      uint32_t px_count = 0u;
      uint32_t expected_len = 0u;
      uint32_t row_bytes = 0u;
      rc = zr_dl_read_cmd_draw_canvas(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_store_lookup(&resources->blobs, cmd.blob_id, &blob, &blob_len);
      if (rc != ZR_OK) {
        return rc;
      }
      if (!zr_checked_mul_u32((uint32_t)cmd.px_width, (uint32_t)cmd.px_height, &px_count) ||
          !zr_checked_mul_u32(px_count, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &expected_len) ||
          !zr_checked_mul_u32((uint32_t)cmd.px_width, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &row_bytes)) {
        return ZR_ERR_FORMAT;
      }
      if (blob_len != expected_len || row_bytes > UINT16_MAX) {
        return ZR_ERR_FORMAT;
      }
      (void)blob;
      break;
    }
    case ZR_DL_OP_DRAW_IMAGE: {
      zr_dl_cmd_draw_image_t cmd;
      const uint8_t* blob = NULL;
      uint32_t blob_len = 0u;
      uint32_t px_count = 0u;
      uint32_t expected_len = 0u;
      rc = zr_dl_read_cmd_draw_image(&r, &cmd);
      if (rc != ZR_OK) {
        return rc;
      }
      rc = zr_dl_store_lookup(&resources->blobs, cmd.blob_id, &blob, &blob_len);
      if (rc != ZR_OK) {
        return rc;
      }
      if (cmd.format == (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
        if (!zr_checked_mul_u32((uint32_t)cmd.px_width, (uint32_t)cmd.px_height, &px_count) ||
            !zr_checked_mul_u32(px_count, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &expected_len)) {
          return ZR_ERR_FORMAT;
        }
        if (blob_len != expected_len) {
          return ZR_ERR_FORMAT;
        }
      } else if (blob_len == 0u) {
        return ZR_ERR_FORMAT;
      }

      const zr_image_protocol_t proto = zr_image_select_protocol(cmd.protocol, term_profile);
      if (proto != ZR_IMG_PROTO_NONE) {
        if (!zr_checked_add_u32(image_cmd_count, 1u, &image_cmd_count) ||
            !zr_checked_add_u32(image_blob_total_bytes, blob_len, &image_blob_total_bytes)) {
          return ZR_ERR_LIMIT;
        }
        if (image_cmd_count > lim->dl_max_cmds || image_blob_total_bytes > lim->dl_max_total_bytes) {
          return ZR_ERR_LIMIT;
        }
      }
      (void)blob;
      break;
    }
    default:
      return ZR_ERR_UNSUPPORTED;
    }
  }

  if (zr_byte_reader_remaining(&r) != 0u) {
    return ZR_ERR_FORMAT;
  }
  return zr_image_frame_reserve(image_stage, image_cmd_count, image_blob_total_bytes);
}

static zr_result_t zr_dl_exec_clear(zr_fb_t* dst) {
  return zr_fb_clear(dst, NULL);
}

static bool zr_dl_is_tab_grapheme(const uint8_t* bytes, size_t len) {
  zr_utf8_decode_result_t d = zr_utf8_decode_one(bytes, len);
  return d.valid != 0u && d.scalar == 0x09u;
}

static uint32_t zr_dl_tab_advance(int32_t col, uint32_t tab_width) {
  const uint32_t safe_col = (col <= 0) ? 0u : (uint32_t)col;
  const uint32_t rem = safe_col % tab_width;
  return (rem == 0u) ? tab_width : (tab_width - rem);
}

static zr_result_t zr_dl_draw_tab_spaces(zr_fb_painter_t* p, int32_t y, int32_t* inout_x, uint32_t tab_width,
                                         const zr_style_t* style) {
  if (!p || !inout_x || tab_width == 0u || !style) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  const uint8_t space = (uint8_t)' ';
  int32_t cx = *inout_x;
  const uint32_t adv = zr_dl_tab_advance(cx, tab_width);
  for (uint32_t i = 0u; i < adv; i++) {
    (void)zr_fb_put_grapheme(p, cx, y, &space, 1u, 1u, style);
    if (cx > (INT32_MAX - 1)) {
      return ZR_ERR_LIMIT;
    }
    cx += 1;
  }

  *inout_x = cx;
  return ZR_OK;
}

/*
 * Draw UTF-8 bytes into the framebuffer by grapheme iteration.
 *
 * Why: The framebuffer primitive is zr_fb_put_grapheme (already segmented,
 * width provided). Drawlist execution owns segmentation and deterministic width.
 */
static zr_result_t zr_dl_draw_text_utf8(zr_fb_painter_t* p, int32_t y, int32_t* inout_x, const uint8_t* bytes,
                                        size_t len, uint32_t tab_width, uint32_t width_policy,
                                        const zr_style_t* style) {
  if (!p || !inout_x || !bytes || !style || tab_width == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  int32_t cx = *inout_x;
  zr_grapheme_iter_t it;
  zr_grapheme_iter_init(&it, bytes, len);

  zr_grapheme_t g;
  while (zr_grapheme_next(&it, &g)) {
    const uint8_t* gb = bytes + g.offset;
    const size_t gl = g.size;

    /* --- Tab expansion (policy: spaces to the next tab stop) --- */
    if (zr_dl_is_tab_grapheme(gb, gl)) {
      zr_result_t rc = zr_dl_draw_tab_spaces(p, y, &cx, tab_width, style);
      if (rc != ZR_OK) {
        return rc;
      }
      continue;
    }

    /* --- Grapheme width and write --- */
    const uint8_t w = zr_width_grapheme_utf8(gb, gl, (zr_width_policy_t)width_policy);
    if (w == 0u) {
      continue;
    }

    /*
      Important: cursor advancement must not depend on clipping. The framebuffer
      primitive handles "no half glyph" replacement internally; drawlist text
      maintains logical positions by always advancing by the original width.
    */
    (void)zr_fb_put_grapheme(p, cx, y, gb, gl, w, style);
    if (cx > (INT32_MAX - (int32_t)w)) {
      return ZR_ERR_LIMIT;
    }
    cx += (int32_t)w;
  }

  *inout_x = cx;
  return ZR_OK;
}

static zr_result_t zr_dl_exec_fill_rect(zr_byte_reader_t* r, const zr_dl_view_t* v,
                                        const zr_dl_resource_store_t* strings, zr_fb_painter_t* p) {
  zr_dl_cmd_fill_rect_wire_t cmd;
  zr_result_t rc = zr_dl_read_cmd_fill_rect(r, v->hdr.version, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  zr_rect_t rr = {cmd.x, cmd.y, cmd.w, cmd.h};
  zr_style_t s;
  rc = zr_style_from_dl(strings, p->fb, &cmd.style, &s);
  if (rc != ZR_OK) {
    return rc;
  }
  return zr_fb_fill_rect(p, rr, &s);
}

static zr_result_t zr_dl_exec_draw_text(zr_byte_reader_t* r, const zr_dl_view_t* v,
                                        const zr_dl_resource_store_t* strings, zr_fb_painter_t* p) {
  zr_dl_cmd_draw_text_wire_t cmd;
  zr_result_t rc = zr_dl_read_cmd_draw_text(r, v->hdr.version, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  const uint8_t* sbytes = NULL;
  rc = zr_dl_resolve_string_slice(strings, cmd.string_id, cmd.byte_off, cmd.byte_len, &sbytes);
  if (rc != ZR_OK) {
    return rc;
  }
  zr_style_t s;
  rc = zr_style_from_dl(strings, p->fb, &cmd.style, &s);
  if (rc != ZR_OK) {
    return rc;
  }
  int32_t cx = cmd.x;
  return zr_dl_draw_text_utf8(p, cmd.y, &cx, sbytes, (size_t)cmd.byte_len, v->text.tab_width, v->text.width_policy, &s);
}

static zr_result_t zr_dl_exec_blit_rect(zr_byte_reader_t* r, zr_fb_painter_t* p) {
  zr_dl_cmd_blit_rect_t cmd;
  zr_result_t rc = zr_dl_read_cmd_blit_rect(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_validate_blit_rect_bounds(p->fb, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  zr_rect_t src = {cmd.src_x, cmd.src_y, cmd.w, cmd.h};
  zr_rect_t dst = {cmd.dst_x, cmd.dst_y, cmd.w, cmd.h};
  return zr_fb_blit_rect(p, dst, src);
}

static zr_result_t zr_dl_exec_push_clip(zr_byte_reader_t* r, zr_fb_painter_t* p) {
  zr_dl_cmd_push_clip_t cmd;
  zr_result_t rc = zr_dl_read_cmd_push_clip(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  zr_rect_t next = {cmd.x, cmd.y, cmd.w, cmd.h};
  return zr_fb_clip_push(p, next);
}

static zr_result_t zr_dl_exec_pop_clip(zr_fb_painter_t* p) {
  zr_result_t rc = zr_fb_clip_pop(p);
  if (rc == ZR_ERR_LIMIT) {
    return ZR_ERR_FORMAT;
  }
  return rc;
}

static zr_result_t zr_dl_exec_draw_text_run_segment(const zr_dl_view_t* v, const zr_dl_resource_store_t* strings,
                                                    zr_byte_reader_t* br, zr_fb_painter_t* p, int32_t y,
                                                    int32_t* inout_x) {
  zr_dl_text_run_segment_wire_t seg;
  zr_result_t rc = zr_dl_read_text_run_segment(br, v->hdr.version, &seg);
  if (rc != ZR_OK) {
    return rc;
  }

  const uint8_t* sbytes = NULL;
  rc = zr_dl_resolve_string_slice(strings, seg.string_id, seg.byte_off, seg.byte_len, &sbytes);
  if (rc != ZR_OK) {
    return rc;
  }
  zr_style_t s;
  rc = zr_style_from_dl(strings, p->fb, &seg.style, &s);
  if (rc != ZR_OK) {
    return rc;
  }

  return zr_dl_draw_text_utf8(p, y, inout_x, sbytes, (size_t)seg.byte_len, v->text.tab_width, v->text.width_policy, &s);
}

static zr_result_t zr_dl_exec_draw_text_run(zr_byte_reader_t* r, const zr_dl_view_t* v,
                                            const zr_dl_resources_t* resources, const zr_limits_t* lim,
                                            zr_fb_painter_t* p) {
  zr_dl_cmd_draw_text_run_t cmd;
  const uint8_t* blob = NULL;
  uint32_t blob_len = 0u;
  size_t expected = 0u;
  uint32_t seg_count = 0u;
  zr_byte_reader_t br;
  zr_result_t rc = zr_dl_read_cmd_draw_text_run(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!resources || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  rc = zr_dl_store_lookup(&resources->blobs, cmd.blob_id, &blob, &blob_len);
  if (rc != ZR_OK) {
    return rc;
  }

  zr_byte_reader_init(&br, blob, (size_t)blob_len);
  if (!zr_byte_reader_read_u32le(&br, &seg_count)) {
    return ZR_ERR_FORMAT;
  }
  if (seg_count > lim->dl_max_text_run_segments) {
    return ZR_ERR_LIMIT;
  }
  rc = zr_dl_text_run_expected_bytes(seg_count, v->hdr.version, &expected);
  if (rc != ZR_OK) {
    return rc;
  }
  if (expected != (size_t)blob_len) {
    return ZR_ERR_FORMAT;
  }

  int32_t cx = cmd.x;
  for (uint32_t si = 0u; si < seg_count; si++) {
    rc = zr_dl_exec_draw_text_run_segment(v, &resources->strings, &br, p, cmd.y, &cx);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  if (zr_byte_reader_remaining(&br) != 0u) {
    return ZR_ERR_FORMAT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_exec_set_cursor(zr_byte_reader_t* r, zr_cursor_state_t* inout_cursor_state) {
  if (!r || !inout_cursor_state) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_dl_cmd_set_cursor_t cmd;
  zr_result_t rc = zr_dl_read_cmd_set_cursor(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  /* Assumes validation has enforced enum/boolean/rsvd constraints. */
  zr_cursor_state_t s;
  s.x = cmd.x;
  s.y = cmd.y;
  s.shape = cmd.shape;
  s.visible = cmd.visible;
  s.blink = cmd.blink;
  s.reserved0 = 0u;
  *inout_cursor_state = s;

  return ZR_OK;
}

static zr_result_t zr_dl_exec_canvas_bounds(const zr_fb_t* fb, const zr_dl_cmd_draw_canvas_t* cmd) {
  uint32_t col_end = 0u;
  uint32_t row_end = 0u;
  if (!fb || !cmd) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_add_u32((uint32_t)cmd->dst_col, (uint32_t)cmd->dst_cols, &col_end) ||
      !zr_checked_add_u32((uint32_t)cmd->dst_row, (uint32_t)cmd->dst_rows, &row_end)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (col_end > fb->cols || row_end > fb->rows) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return ZR_OK;
}

/* Execute DRAW_CANVAS by routing RGBA bytes through the selected sub-cell blitter. */
static zr_result_t zr_dl_exec_draw_canvas(zr_byte_reader_t* r, const zr_dl_resources_t* resources, zr_fb_painter_t* p,
                                          const zr_blit_caps_t* blit_caps) {
  zr_dl_cmd_draw_canvas_t cmd;
  zr_blit_caps_t default_caps;
  zr_blitter_t effective = ZR_BLIT_ASCII;
  const uint8_t* blob = NULL;
  uint32_t blob_len = 0u;
  uint32_t px_count = 0u;
  uint32_t expected_len = 0u;
  uint32_t stride_bytes = 0u;
  zr_blit_input_t input;
  zr_rect_t dst_rect;
  zr_result_t rc = zr_dl_read_cmd_draw_canvas(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!resources) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_dl_exec_canvas_bounds(p->fb, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_dl_store_lookup(&resources->blobs, cmd.blob_id, &blob, &blob_len);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_checked_mul_u32((uint32_t)cmd.px_width, (uint32_t)cmd.px_height, &px_count) ||
      !zr_checked_mul_u32(px_count, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &expected_len) ||
      !zr_checked_mul_u32((uint32_t)cmd.px_width, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &stride_bytes) ||
      stride_bytes > UINT16_MAX || expected_len != blob_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  input.pixels = blob;
  input.px_width = cmd.px_width;
  input.px_height = cmd.px_height;
  input.stride = (uint16_t)stride_bytes;

  dst_rect.x = (int32_t)cmd.dst_col;
  dst_rect.y = (int32_t)cmd.dst_row;
  dst_rect.w = (int32_t)cmd.dst_cols;
  dst_rect.h = (int32_t)cmd.dst_rows;

  if (!blit_caps) {
    memset(&default_caps, 0, sizeof(default_caps));
    default_caps.supports_unicode = 1u;
    default_caps.supports_halfblock = 1u;
    default_caps.supports_quadrant = 1u;
    default_caps.supports_braille = 1u;
    blit_caps = &default_caps;
  }

  return zr_blit_dispatch(p, dst_rect, &input, (zr_blitter_t)cmd.blitter, blit_caps, &effective);
}

static zr_result_t zr_dl_exec_image_bounds(const zr_fb_t* fb, const zr_dl_cmd_draw_image_t* cmd) {
  uint32_t col_end = 0u;
  uint32_t row_end = 0u;
  if (!fb || !cmd) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_add_u32((uint32_t)cmd->dst_col, (uint32_t)cmd->dst_cols, &col_end) ||
      !zr_checked_add_u32((uint32_t)cmd->dst_row, (uint32_t)cmd->dst_rows, &row_end)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (col_end > fb->cols || row_end > fb->rows) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return ZR_OK;
}

static zr_result_t zr_dl_exec_draw_image_fallback_rgba(const zr_dl_cmd_draw_image_t* cmd, const uint8_t* blob,
                                                       uint32_t blob_len, zr_fb_painter_t* p,
                                                       const zr_blit_caps_t* blit_caps) {
  zr_blit_caps_t default_caps;
  zr_blitter_t effective = ZR_BLIT_ASCII;
  zr_blit_input_t input;
  zr_rect_t dst_rect;
  uint32_t stride_bytes = 0u;
  uint32_t px_count = 0u;
  uint32_t expected_len = 0u;
  zr_result_t rc = ZR_OK;

  if (!cmd || !blob || !p) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_dl_exec_image_bounds(p->fb, cmd);
  if (rc != ZR_OK) {
    return rc;
  }
  if (!zr_checked_mul_u32((uint32_t)cmd->px_width, (uint32_t)cmd->px_height, &px_count) ||
      !zr_checked_mul_u32(px_count, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &expected_len) || expected_len != blob_len) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!zr_checked_mul_u32((uint32_t)cmd->px_width, ZR_BLIT_RGBA_BYTES_PER_PIXEL, &stride_bytes) ||
      stride_bytes > UINT16_MAX) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  input.pixels = blob;
  input.px_width = cmd->px_width;
  input.px_height = cmd->px_height;
  input.stride = (uint16_t)stride_bytes;

  dst_rect.x = (int32_t)cmd->dst_col;
  dst_rect.y = (int32_t)cmd->dst_row;
  dst_rect.w = (int32_t)cmd->dst_cols;
  dst_rect.h = (int32_t)cmd->dst_rows;

  if (!blit_caps) {
    memset(&default_caps, 0, sizeof(default_caps));
    default_caps.supports_unicode = 1u;
    default_caps.supports_halfblock = 1u;
    default_caps.supports_quadrant = 1u;
    default_caps.supports_braille = 1u;
    blit_caps = &default_caps;
  }

  return zr_blit_dispatch(p, dst_rect, &input, ZR_BLIT_AUTO, blit_caps, &effective);
}

/* Execute DRAW_IMAGE by staging protocol payloads or falling back to sub-cell blit. */
static zr_result_t zr_dl_exec_draw_image(zr_byte_reader_t* r, const zr_dl_resources_t* resources, zr_fb_painter_t* p,
                                         const zr_blit_caps_t* blit_caps, const zr_terminal_profile_t* term_profile,
                                         zr_image_frame_t* image_frame_stage) {
  zr_dl_cmd_draw_image_t cmd;
  zr_image_protocol_t proto = ZR_IMG_PROTO_NONE;
  const uint8_t* blob = NULL;
  uint32_t blob_len = 0u;
  zr_result_t rc = ZR_OK;

  if (!r || !resources || !p) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  rc = zr_dl_read_cmd_draw_image(r, &cmd);
  if (rc != ZR_OK) {
    return rc;
  }

  rc = zr_dl_store_lookup(&resources->blobs, cmd.blob_id, &blob, &blob_len);
  if (rc != ZR_OK) {
    return rc;
  }
  proto = zr_image_select_protocol(cmd.protocol, term_profile);

  if (proto == ZR_IMG_PROTO_NONE) {
    if (cmd.format != (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
      return ZR_ERR_UNSUPPORTED;
    }
    return zr_dl_exec_draw_image_fallback_rgba(&cmd, blob, blob_len, p, blit_caps);
  }

  if ((proto == ZR_IMG_PROTO_KITTY || proto == ZR_IMG_PROTO_SIXEL) && cmd.format != (uint8_t)ZR_IMAGE_FORMAT_RGBA) {
    return ZR_ERR_UNSUPPORTED;
  }
  if (!image_frame_stage) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_image_cmd_t staged;
  memset(&staged, 0, sizeof(staged));
  staged.dst_col = cmd.dst_col;
  staged.dst_row = cmd.dst_row;
  staged.dst_cols = cmd.dst_cols;
  staged.dst_rows = cmd.dst_rows;
  staged.px_width = cmd.px_width;
  staged.px_height = cmd.px_height;
  staged.blob_off = 0u;
  staged.blob_len = blob_len;
  staged.image_id = cmd.image_id;
  staged.format = cmd.format;
  /*
    Freeze protocol choice at submit time.

    Why: Present should emit the protocol resolved during drawlist execution,
    not re-negotiate from AUTO requests.
  */
  staged.protocol = (uint8_t)proto;
  staged.z_layer = cmd.z_layer;
  staged.fit_mode = cmd.fit_mode;

  return zr_image_frame_push_copy(image_frame_stage, &staged, blob);
}

/* Execute a validated drawlist into the framebuffer; assumes view came from zr_dl_validate. */
zr_result_t zr_dl_execute(const zr_dl_view_t* v, zr_fb_t* dst, const zr_limits_t* lim, uint32_t tab_width,
                          uint32_t width_policy, const zr_blit_caps_t* blit_caps,
                          const zr_terminal_profile_t* term_profile, zr_image_frame_t* image_frame_stage,
                          zr_dl_resources_t* resources, zr_cursor_state_t* inout_cursor_state) {
  if (!v || !dst || !lim) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!resources) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!inout_cursor_state) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (tab_width == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (width_policy != (uint32_t)ZR_WIDTH_EMOJI_NARROW && width_policy != (uint32_t)ZR_WIDTH_EMOJI_WIDE) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_dl_view_t view = *v;
  view.text.tab_width = tab_width;
  view.text.width_policy = width_policy;

  enum { kMaxClip = 64 };
  if (lim->dl_max_clip_depth > kMaxClip) {
    return ZR_ERR_LIMIT;
  }

  zr_rect_t clip_stack[kMaxClip + 1];
  zr_fb_painter_t painter;
  zr_result_t prc = zr_fb_painter_begin(&painter, dst, clip_stack, lim->dl_max_clip_depth + 1u);
  if (prc != ZR_OK) {
    return prc;
  }

  zr_byte_reader_t r;
  zr_byte_reader_init(&r, view.cmd_bytes, view.cmd_bytes_len);

  for (uint32_t ci = 0u; ci < view.hdr.cmd_count; ci++) {
    zr_dl_cmd_header_t ch;
    zr_result_t rc = zr_dl_read_cmd_header(&r, &ch);
    if (rc != ZR_OK) {
      return rc;
    }

    /* Assumes `v` came from zr_dl_validate(): framing/sizes/flags are already verified. */
    switch ((zr_dl_opcode_t)ch.opcode) {
    case ZR_DL_OP_CLEAR: {
      rc = zr_dl_exec_clear(dst);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DEF_STRING: {
      rc = zr_dl_apply_def_resource(&resources->strings, lim->dl_max_strings, lim, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_FREE_STRING: {
      rc = zr_dl_apply_free_resource(&resources->strings, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DEF_BLOB: {
      rc = zr_dl_apply_def_resource(&resources->blobs, lim->dl_max_blobs, lim, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_FREE_BLOB: {
      rc = zr_dl_apply_free_resource(&resources->blobs, &r, &ch);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_FILL_RECT: {
      rc = zr_dl_exec_fill_rect(&r, &view, &resources->strings, &painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_TEXT: {
      rc = zr_dl_exec_draw_text(&r, &view, &resources->strings, &painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_PUSH_CLIP: {
      rc = zr_dl_exec_push_clip(&r, &painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_BLIT_RECT: {
      if (!zr_dl_version_supports_blit_rect(view.hdr.version)) {
        return ZR_ERR_UNSUPPORTED;
      }
      rc = zr_dl_exec_blit_rect(&r, &painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_POP_CLIP: {
      rc = zr_dl_exec_pop_clip(&painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_TEXT_RUN: {
      rc = zr_dl_exec_draw_text_run(&r, &view, resources, lim, &painter);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_SET_CURSOR: {
      rc = zr_dl_exec_set_cursor(&r, inout_cursor_state);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_CANVAS: {
      rc = zr_dl_exec_draw_canvas(&r, resources, &painter, blit_caps);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    case ZR_DL_OP_DRAW_IMAGE: {
      rc = zr_dl_exec_draw_image(&r, resources, &painter, blit_caps, term_profile, image_frame_stage);
      if (rc != ZR_OK) {
        return rc;
      }
      break;
    }
    default: {
      return ZR_ERR_UNSUPPORTED;
    }
    }
  }

  return ZR_OK;
}
