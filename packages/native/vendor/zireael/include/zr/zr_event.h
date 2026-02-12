/*
  include/zr/zr_event.h — Packed event batch v1 ABI types.

  Why: Defines the versioned, little-endian, self-framed event batch format
  that the engine writes into caller-provided buffers (wrapper consumption).
*/

#ifndef ZR_ZR_EVENT_H_INCLUDED
#define ZR_ZR_EVENT_H_INCLUDED

#include "zr/zr_version.h"

#include <stddef.h>
#include <stdint.h>

/* Little-endian u32 for bytes {'Z','R','E','V'}. */
#define ZR_EV_MAGIC (0x5645525Au)

/* zr_evbatch_header_t.flags bits. */
#define ZR_EV_BATCH_TRUNCATED (1u << 0u)

/*
  ABI-facing types (little-endian on-wire).

  Layout invariants (v1):
    - Batch begins with zr_evbatch_header_t.
    - Records are self-framed by zr_ev_record_header_t.size (bytes).
    - Record sizes are 4-byte aligned.
*/
typedef struct zr_evbatch_header_t {
  uint32_t magic;
  uint32_t version;
  uint32_t total_size;
  uint32_t event_count;
  uint32_t flags;
  uint32_t reserved0; /* must be 0 in v1 */
} zr_evbatch_header_t;

typedef struct zr_ev_record_header_t {
  uint32_t type;
  uint32_t size;
  uint32_t time_ms;
  uint32_t flags;
} zr_ev_record_header_t;

typedef enum zr_event_type_t {
  ZR_EV_INVALID = 0,
  ZR_EV_KEY = 1,
  ZR_EV_TEXT = 2,
  ZR_EV_PASTE = 3,
  ZR_EV_MOUSE = 4,
  ZR_EV_RESIZE = 5,
  ZR_EV_TICK = 6,
  ZR_EV_USER = 7
} zr_event_type_t;

/* Modifier bitmask. */
#define ZR_MOD_SHIFT (1u << 0u)
#define ZR_MOD_CTRL (1u << 1u)
#define ZR_MOD_ALT (1u << 2u)
#define ZR_MOD_META (1u << 3u)

typedef enum zr_key_t {
  ZR_KEY_UNKNOWN = 0,

  ZR_KEY_ESCAPE = 1,
  ZR_KEY_ENTER = 2,
  ZR_KEY_TAB = 3,
  ZR_KEY_BACKSPACE = 4,

  ZR_KEY_INSERT = 10,
  ZR_KEY_DELETE = 11,
  ZR_KEY_HOME = 12,
  ZR_KEY_END = 13,
  ZR_KEY_PAGE_UP = 14,
  ZR_KEY_PAGE_DOWN = 15,

  ZR_KEY_UP = 20,
  ZR_KEY_DOWN = 21,
  ZR_KEY_LEFT = 22,
  ZR_KEY_RIGHT = 23,
  ZR_KEY_FOCUS_IN = 30,
  ZR_KEY_FOCUS_OUT = 31,

  ZR_KEY_F1 = 100,
  ZR_KEY_F2 = 101,
  ZR_KEY_F3 = 102,
  ZR_KEY_F4 = 103,
  ZR_KEY_F5 = 104,
  ZR_KEY_F6 = 105,
  ZR_KEY_F7 = 106,
  ZR_KEY_F8 = 107,
  ZR_KEY_F9 = 108,
  ZR_KEY_F10 = 109,
  ZR_KEY_F11 = 110,
  ZR_KEY_F12 = 111
} zr_key_t;

typedef enum zr_key_action_t {
  ZR_KEY_ACTION_INVALID = 0,
  ZR_KEY_ACTION_DOWN = 1,
  ZR_KEY_ACTION_UP = 2,
  ZR_KEY_ACTION_REPEAT = 3
} zr_key_action_t;

typedef struct zr_ev_key_t {
  uint32_t key;    /* zr_key_t */
  uint32_t mods;   /* ZR_MOD_* bitmask */
  uint32_t action; /* zr_key_action_t */
  uint32_t reserved0;
} zr_ev_key_t;

typedef struct zr_ev_text_t {
  /*
    Unicode scalar value (U+0000..U+10FFFF, excluding surrogates).
    Engine input parsing decodes UTF-8 and emits U+FFFD for invalid sequences.
  */
  uint32_t codepoint;
  uint32_t reserved0;
} zr_ev_text_t;

/*
  zr_ev_paste_t payload:
    - header fields below
    - followed by `byte_len` bytes of UTF-8
    - followed by zero padding to 4-byte alignment
*/
typedef struct zr_ev_paste_t {
  uint32_t byte_len;
  uint32_t reserved0;
} zr_ev_paste_t;

typedef enum zr_mouse_kind_t {
  ZR_MOUSE_INVALID = 0,
  ZR_MOUSE_MOVE = 1,
  ZR_MOUSE_DRAG = 2,
  ZR_MOUSE_DOWN = 3,
  ZR_MOUSE_UP = 4,
  ZR_MOUSE_WHEEL = 5
} zr_mouse_kind_t;

typedef struct zr_ev_mouse_t {
  int32_t x;
  int32_t y;
  uint32_t kind;    /* zr_mouse_kind_t */
  uint32_t mods;    /* ZR_MOD_* bitmask */
  uint32_t buttons; /* bitmask, implementation-defined */
  int32_t wheel_x;
  int32_t wheel_y;
  uint32_t reserved0;
} zr_ev_mouse_t;

typedef struct zr_ev_resize_t {
  uint32_t cols;
  uint32_t rows;
  uint32_t reserved0;
  uint32_t reserved1;
} zr_ev_resize_t;

typedef struct zr_ev_tick_t {
  uint32_t dt_ms;
  uint32_t reserved0;
  uint32_t reserved1;
  uint32_t reserved2;
} zr_ev_tick_t;

/*
  zr_ev_user_t payload:
    - header fields below
    - followed by `byte_len` bytes (opaque to the engine)
    - followed by zero padding to 4-byte alignment
*/
typedef struct zr_ev_user_t {
  uint32_t tag;
  uint32_t byte_len;
  uint32_t reserved0;
  uint32_t reserved1;
} zr_ev_user_t;

#endif /* ZR_ZR_EVENT_H_INCLUDED */
