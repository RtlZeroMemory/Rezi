/*
  src/util/zr_arena.h — Growable arena allocator with cap enforcement.

  Why: Provides deterministic, bump-pointer allocations with mark/rewind for
  fast bulk allocation and reset, while enforcing a max_total_bytes cap.
*/

#ifndef ZR_UTIL_ZR_ARENA_H_INCLUDED
#define ZR_UTIL_ZR_ARENA_H_INCLUDED

#include "util/zr_result.h"

#include <stddef.h>
#include <stdint.h>

typedef struct zr_arena_block_t zr_arena_block_t;

typedef struct zr_arena_t {
  zr_arena_block_t* head;
  zr_arena_block_t* cur;
  size_t max_total_bytes;
  size_t total_bytes; /* sum of block capacities */
} zr_arena_t;

typedef struct zr_arena_mark_t {
  zr_arena_block_t* block;
  size_t used_in_block;
} zr_arena_mark_t;

/*
  zr_arena_init:
    - initial_bytes == 0 is treated as 1 byte (deterministic non-zero policy).
    - max_total_bytes == 0 is treated as 1 byte.
*/
zr_result_t zr_arena_init(zr_arena_t* a, size_t initial_bytes, size_t max_total_bytes);
void        zr_arena_reset(zr_arena_t* a);
void        zr_arena_release(zr_arena_t* a);

void* zr_arena_alloc(zr_arena_t* a, size_t size, size_t align);
void* zr_arena_alloc_zeroed(zr_arena_t* a, size_t size, size_t align);

zr_arena_mark_t zr_arena_mark(const zr_arena_t* a);
void            zr_arena_rewind(zr_arena_t* a, zr_arena_mark_t mark);

#endif /* ZR_UTIL_ZR_ARENA_H_INCLUDED */

