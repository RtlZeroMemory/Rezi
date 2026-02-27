/*
  include/zr/zr_drawlist.h — Drawlist ABI structs (v1/v2).

  Why: Defines the little-endian drawlist command stream used by wrappers to
  drive rendering through engine_submit_drawlist().
*/

#ifndef ZR_ZR_DRAWLIST_H_INCLUDED
#define ZR_ZR_DRAWLIST_H_INCLUDED

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

/* ABI-facing types (little-endian on-wire). */
typedef struct zr_dl_header_t {
  uint32_t magic;
  uint32_t version;
  uint32_t header_size;
  uint32_t total_size;

  uint32_t cmd_offset;
  uint32_t cmd_bytes;
  uint32_t cmd_count;

  /*
    v1 uses engine-owned persistent resources.
    These drawlist-local table fields are reserved and must be 0.
  */
  uint32_t strings_span_offset;
  uint32_t strings_count;
  uint32_t strings_bytes_offset;
  uint32_t strings_bytes_len;

  uint32_t blobs_span_offset;
  uint32_t blobs_count;
  uint32_t blobs_bytes_offset;
  uint32_t blobs_bytes_len;

  uint32_t reserved0;
} zr_dl_header_t;

typedef struct zr_dl_span_t {
  uint32_t off;
  uint32_t len;
} zr_dl_span_t;

typedef struct zr_dl_cmd_header_t {
  uint16_t opcode;
  uint16_t flags;
  uint32_t size;
} zr_dl_cmd_header_t;

typedef enum zr_dl_opcode_t {
  ZR_DL_OP_INVALID = 0,
  ZR_DL_OP_CLEAR = 1,
  ZR_DL_OP_FILL_RECT = 2,
  ZR_DL_OP_DRAW_TEXT = 3,
  ZR_DL_OP_PUSH_CLIP = 4,
  ZR_DL_OP_POP_CLIP = 5,
  ZR_DL_OP_DRAW_TEXT_RUN = 6,
  ZR_DL_OP_SET_CURSOR = 7,
  ZR_DL_OP_DRAW_CANVAS = 8,
  ZR_DL_OP_DRAW_IMAGE = 9,
  ZR_DL_OP_DEF_STRING = 10,
  ZR_DL_OP_FREE_STRING = 11,
  ZR_DL_OP_DEF_BLOB = 12,
  ZR_DL_OP_FREE_BLOB = 13,
  ZR_DL_OP_BLIT_RECT = 14
} zr_dl_opcode_t;

/*
  Sub-cell blitter selector for DRAW_CANVAS / image fallback paths.

  A "blitter" maps RGBA pixels onto terminal cell glyph/style combinations.
*/
typedef enum zr_blitter_t {
  ZR_BLIT_AUTO = 0,      /* engine selects based on capability policy */
  ZR_BLIT_PIXEL = 1,     /* reserved for graphics protocol path */
  ZR_BLIT_BRAILLE = 2,   /* 2x4, single-color dots */
  ZR_BLIT_SEXTANT = 3,   /* 2x3, two-color partition */
  ZR_BLIT_QUADRANT = 4,  /* 2x2, two-color partition */
  ZR_BLIT_HALFBLOCK = 5, /* 1x2, two-color partition */
  ZR_BLIT_ASCII = 6      /* 1x1 space+background fallback */
} zr_blitter_t;

typedef enum zr_dl_cursor_shape_t {
  ZR_DL_CURSOR_BLOCK = 0,
  ZR_DL_CURSOR_UNDERLINE = 1,
  ZR_DL_CURSOR_BAR = 2
} zr_dl_cursor_shape_t;

typedef enum zr_dl_draw_image_format_t {
  ZR_DL_DRAW_IMAGE_FORMAT_RGBA = 0,
  ZR_DL_DRAW_IMAGE_FORMAT_PNG = 1
} zr_dl_draw_image_format_t;

typedef enum zr_dl_draw_image_protocol_t {
  ZR_DL_DRAW_IMAGE_PROTOCOL_AUTO = 0,
  ZR_DL_DRAW_IMAGE_PROTOCOL_KITTY = 1,
  ZR_DL_DRAW_IMAGE_PROTOCOL_SIXEL = 2,
  ZR_DL_DRAW_IMAGE_PROTOCOL_ITERM2 = 3
} zr_dl_draw_image_protocol_t;

typedef enum zr_dl_draw_image_z_layer_t {
  ZR_DL_DRAW_IMAGE_Z_BACK = -1,
  ZR_DL_DRAW_IMAGE_Z_NORMAL = 0,
  ZR_DL_DRAW_IMAGE_Z_FRONT = 1
} zr_dl_draw_image_z_layer_t;

typedef enum zr_dl_draw_image_fit_mode_t {
  ZR_DL_DRAW_IMAGE_FIT_FILL = 0,
  ZR_DL_DRAW_IMAGE_FIT_CONTAIN = 1,
  ZR_DL_DRAW_IMAGE_FIT_COVER = 2
} zr_dl_draw_image_fit_mode_t;

typedef struct zr_dl_style_t {
  uint32_t fg;
  uint32_t bg;
  uint32_t attrs;
  uint32_t reserved0;
} zr_dl_style_t;

/*
  v1 style extension:
    - underline_rgb: 0x00RRGGBB underline color (0 means default underline color)
    - link_uri_ref: string resource id for URI; 0 means no hyperlink
    - link_id_ref: optional string resource id for OSC 8 id param
*/
typedef struct zr_dl_style_v3_ext_t {
  uint32_t underline_rgb;
  uint32_t link_uri_ref;
  uint32_t link_id_ref;
} zr_dl_style_v3_ext_t;

typedef struct zr_dl_style_v3_t {
  zr_dl_style_t base;
  zr_dl_style_v3_ext_t ext;
} zr_dl_style_v3_t;

typedef struct zr_dl_cmd_fill_rect_t {
  int32_t x;
  int32_t y;
  int32_t w;
  int32_t h;
  zr_dl_style_t style;
} zr_dl_cmd_fill_rect_t;

typedef struct zr_dl_cmd_draw_text_t {
  int32_t x;
  int32_t y;
  uint32_t string_id;
  uint32_t byte_off;
  uint32_t byte_len;
  zr_dl_style_t style;
  uint32_t reserved0; /* must be 0 */
} zr_dl_cmd_draw_text_t;

typedef struct zr_dl_cmd_fill_rect_v3_t {
  int32_t x;
  int32_t y;
  int32_t w;
  int32_t h;
  zr_dl_style_v3_t style;
} zr_dl_cmd_fill_rect_v3_t;

typedef struct zr_dl_cmd_draw_text_v3_t {
  int32_t x;
  int32_t y;
  uint32_t string_id;
  uint32_t byte_off;
  uint32_t byte_len;
  zr_dl_style_v3_t style;
  uint32_t reserved0; /* reserved; must be 0 */
} zr_dl_cmd_draw_text_v3_t;

typedef struct zr_dl_cmd_push_clip_t {
  int32_t x;
  int32_t y;
  int32_t w;
  int32_t h;
} zr_dl_cmd_push_clip_t;

typedef struct zr_dl_cmd_blit_rect_t {
  int32_t src_x;
  int32_t src_y;
  int32_t w;
  int32_t h;
  int32_t dst_x;
  int32_t dst_y;
} zr_dl_cmd_blit_rect_t;

typedef struct zr_dl_cmd_draw_text_run_t {
  int32_t x;
  int32_t y;
  uint32_t blob_id;
  uint32_t reserved0; /* must be 0 */
} zr_dl_cmd_draw_text_run_t;

typedef struct zr_dl_text_run_segment_v3_t {
  zr_dl_style_v3_t style;
  uint32_t string_id;
  uint32_t byte_off;
  uint32_t byte_len;
} zr_dl_text_run_segment_v3_t;

typedef struct zr_dl_cmd_set_cursor_t {
  int32_t x;         /* 0-based cell; -1 means "leave unchanged" */
  int32_t y;         /* 0-based cell; -1 means "leave unchanged" */
  uint8_t shape;     /* zr_dl_cursor_shape_t */
  uint8_t visible;   /* 0/1 */
  uint8_t blink;     /* 0/1 */
  uint8_t reserved0; /* must be 0 */
} zr_dl_cmd_set_cursor_t;

typedef struct zr_dl_cmd_draw_canvas_t {
  uint16_t dst_col;   /* destination cell x */
  uint16_t dst_row;   /* destination cell y */
  uint16_t dst_cols;  /* destination width in cells */
  uint16_t dst_rows;  /* destination height in cells */
  uint16_t px_width;  /* source width in RGBA pixels */
  uint16_t px_height; /* source height in RGBA pixels */
  uint32_t blob_id;   /* persistent blob resource id */
  uint32_t reserved0; /* must be 0 */
  uint8_t blitter;    /* zr_blitter_t */
  uint8_t flags;      /* reserved; must be 0 */
  uint16_t reserved;  /* reserved; must be 0 */
} zr_dl_cmd_draw_canvas_t;

typedef struct zr_dl_cmd_draw_image_t {
  uint16_t dst_col;       /* destination cell x */
  uint16_t dst_row;       /* destination cell y */
  uint16_t dst_cols;      /* destination width in cells */
  uint16_t dst_rows;      /* destination height in cells */
  uint16_t px_width;      /* source width in pixels */
  uint16_t px_height;     /* source height in pixels */
  uint32_t blob_id;       /* persistent blob resource id */
  uint32_t reserved_blob; /* must be 0 */
  uint32_t image_id;      /* stable image key for protocol cache reuse */
  uint8_t format;         /* zr_dl_draw_image_format_t */
  uint8_t protocol;       /* zr_dl_draw_image_protocol_t */
  int8_t z_layer;         /* zr_dl_draw_image_z_layer_t */
  uint8_t fit_mode;       /* zr_dl_draw_image_fit_mode_t */
  uint8_t flags;          /* reserved; must be 0 */
  uint8_t reserved0;      /* reserved; must be 0 */
  uint16_t reserved1;     /* reserved; must be 0 */
} zr_dl_cmd_draw_image_t;

/*
  DEF_* command payload format:
    - u32 id
    - u32 byte_len
    - u8 bytes[byte_len]
    - u8 pad[0..3] (must be zero) to keep cmd size 4-byte aligned
*/
typedef struct zr_dl_cmd_def_resource_t {
  uint32_t id;
  uint32_t byte_len;
} zr_dl_cmd_def_resource_t;

typedef struct zr_dl_cmd_free_resource_t {
  uint32_t id;
} zr_dl_cmd_free_resource_t;

#ifdef __cplusplus
}
#endif

#endif /* ZR_ZR_DRAWLIST_H_INCLUDED */
