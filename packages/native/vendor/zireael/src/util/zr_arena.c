/*
  src/util/zr_arena.c — Growable arena allocator implementation.

  Why: Implements bump allocation with deterministic growth and strict cap
  enforcement; uses checked arithmetic and avoids undefined behavior.
*/

#include "util/zr_arena.h"

#include "util/zr_assert.h"
#include "util/zr_checked.h"

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

/* Default base alignment for arena blocks (cache-line friendly). */
#define ZR_ARENA_BASE_ALIGN 64u

/* Maximum supported alignment for arena allocations. */
#define ZR_ARENA_MAX_ALIGN 4096u

struct zr_arena_block_t {
  struct zr_arena_block_t* next;
  uint8_t* data; /* points inside this block's allocation (not separately allocated) */
  size_t cap;
  size_t used;
};

static bool zr__is_valid_align(size_t align) {
  return align != 0u && zr_is_pow2_size(align) && align <= ZR_ARENA_MAX_ALIGN;
}

/* Allocate a single arena block with aligned payload area; returns NULL on failure. */
static zr_arena_block_t* zr__block_alloc(size_t cap, size_t base_align) {
  if (cap == 0u) {
    cap = 1u;
  }
  if (!zr__is_valid_align(base_align)) {
    return NULL;
  }

  size_t total = 0u;
  size_t header_plus = 0u;
  /*
    Block allocation layout:

      [ zr_arena_block_t header ][ pad .. ][ aligned payload bytes ... ]
                                  ^
                                  b->data

    `padding = align - 1` ensures there is always enough room to align the
    payload pointer without stepping outside the allocation.
  */
  const size_t padding = base_align - 1u;
  if (!zr_checked_add_size(sizeof(zr_arena_block_t), cap, &header_plus)) {
    return NULL;
  }
  if (!zr_checked_add_size(header_plus, padding, &total)) {
    return NULL;
  }

  void* raw = malloc(total);
  if (!raw) {
    return NULL;
  }

  zr_arena_block_t* b = (zr_arena_block_t*)raw;
  b->next = NULL;
  b->cap = cap;
  b->used = 0u;

  uint8_t* payload = (uint8_t*)(b + 1);
  size_t aligned_off = 0u;
  if (!zr_checked_align_up_size((size_t)(uintptr_t)payload, base_align, &aligned_off)) {
    free(raw);
    return NULL;
  }
  b->data = (uint8_t*)(uintptr_t)aligned_off;

  /* Ensure b->data stays within the allocation. */
  const uintptr_t start = (uintptr_t)raw;
  const uintptr_t end = start + (uintptr_t)total;
  const uintptr_t data_ptr = (uintptr_t)b->data;
  if (data_ptr < start || data_ptr > end || (end - data_ptr) < cap) {
    free(raw);
    return NULL;
  }

  return b;
}

static void zr__block_free_chain(zr_arena_block_t* b) {
  while (b) {
    zr_arena_block_t* next = b->next;
    free(b);
    b = next;
  }
}

/* Called from cleanup paths; accepts NULL for caller convenience. */
static void zr__arena_zero(zr_arena_t* a) {
  if (!a) {
    return;
  }
  a->head = NULL;
  a->cur = NULL;
  a->max_total_bytes = 0u;
  a->total_bytes = 0u;
}

zr_result_t zr_arena_init(zr_arena_t* a, size_t initial_bytes, size_t max_total_bytes) {
  if (!a) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  zr__arena_zero(a);

  if (initial_bytes == 0u) {
    initial_bytes = 1u;
  }
  if (max_total_bytes == 0u) {
    max_total_bytes = 1u;
  }
  if (initial_bytes > max_total_bytes) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_arena_block_t* b = zr__block_alloc(initial_bytes, ZR_ARENA_BASE_ALIGN);
  if (!b) {
    return ZR_ERR_OOM;
  }

  a->head = b;
  a->cur = b;
  a->max_total_bytes = max_total_bytes;
  a->total_bytes = initial_bytes;
  return ZR_OK;
}

void zr_arena_reset(zr_arena_t* a) {
  if (!a) {
    return;
  }
  if (!a->head) {
    zr__arena_zero(a);
    return;
  }

  /* Keep the first block, free the rest. */
  zr_arena_block_t* first = a->head;
  zr_arena_block_t* rest = first->next;
  first->next = NULL;
  first->used = 0u;

  zr__block_free_chain(rest);
  a->cur = first;
  a->total_bytes = first->cap;
}

void zr_arena_release(zr_arena_t* a) {
  if (!a) {
    return;
  }
  zr__block_free_chain(a->head);
  zr__arena_zero(a);
}

/* Try to allocate within an existing block; returns NULL if insufficient space. */
static void* zr__arena_alloc_in_block(zr_arena_block_t* b, size_t size, size_t align) {
  ZR_ASSERT(b);
  const uintptr_t base = (uintptr_t)b->data;
  size_t cur_ptr = 0u;
  if (!zr_checked_add_size((size_t)base, b->used, &cur_ptr)) {
    return NULL;
  }
  size_t aligned_ptr = 0u;
  if (!zr_checked_align_up_size(cur_ptr, align, &aligned_ptr)) {
    return NULL;
  }
  size_t used_aligned = 0u;
  if (!zr_checked_sub_size(aligned_ptr, (size_t)base, &used_aligned)) {
    return NULL;
  }
  size_t end = 0u;
  if (!zr_checked_add_size(used_aligned, size, &end)) {
    return NULL;
  }
  if (end > b->cap) {
    return NULL;
  }
  void* p = (void*)(b->data + used_aligned);
  b->used = end;
  return p;
}

/* Add a new block to the arena (doubling strategy) when current block is exhausted. */
static zr_result_t zr__arena_grow(zr_arena_t* a, size_t min_bytes) {
  ZR_ASSERT(a);
  if (!a->cur) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  size_t cur_cap = a->cur->cap;
  size_t next_cap = cur_cap;
  while (next_cap < min_bytes) {
    size_t doubled = 0u;
    if (!zr_checked_mul_size(next_cap, 2u, &doubled)) {
      return ZR_ERR_LIMIT;
    }
    next_cap = doubled;
  }
  if (next_cap == 0u) {
    next_cap = 1u;
  }

  size_t new_total = 0u;
  if (!zr_checked_add_size(a->total_bytes, next_cap, &new_total)) {
    return ZR_ERR_LIMIT;
  }
  if (new_total > a->max_total_bytes) {
    return ZR_ERR_LIMIT;
  }

  zr_arena_block_t* b = zr__block_alloc(next_cap, ZR_ARENA_BASE_ALIGN);
  if (!b) {
    return ZR_ERR_OOM;
  }
  a->cur->next = b;
  a->cur = b;
  a->total_bytes = new_total;
  return ZR_OK;
}

/* Allocate memory from the arena with specified alignment; grows arena if needed. */
void* zr_arena_alloc(zr_arena_t* a, size_t size, size_t align) {
  if (!a) {
    return NULL;
  }
  if (size == 0u) {
    size = 1u; /* locked policy: size==0 behaves as if size==1 */
  }
  if (!zr__is_valid_align(align)) {
    return NULL;
  }
  if (!a->cur) {
    return NULL;
  }

  void* p = zr__arena_alloc_in_block(a->cur, size, align);
  if (p) {
    return p;
  }

  /* Need a new block; ensure it can satisfy worst-case alignment padding. */
  size_t min_bytes = 0u;
  size_t pad = align - 1u;
  if (!zr_checked_add_size(size, pad, &min_bytes)) {
    return NULL;
  }
  zr_result_t gr = zr__arena_grow(a, min_bytes);
  if (gr != ZR_OK) {
    return NULL;
  }
  return zr__arena_alloc_in_block(a->cur, size, align);
}

void* zr_arena_alloc_zeroed(zr_arena_t* a, size_t size, size_t align) {
  void* p = zr_arena_alloc(a, size, align);
  if (!p) {
    return NULL;
  }
  if (size == 0u) {
    size = 1u;
  }
  memset(p, 0, size);
  return p;
}

/* Capture current allocation state for later rewind; returns zeroed mark if arena is empty. */
zr_arena_mark_t zr_arena_mark(const zr_arena_t* a) {
  zr_arena_mark_t m;
  m.block = NULL;
  m.used_in_block = 0u;
  if (!a || !a->cur) {
    return m;
  }
  m.block = a->cur;
  m.used_in_block = a->cur->used;
  return m;
}

void zr_arena_rewind(zr_arena_t* a, zr_arena_mark_t mark) {
  /*
   * Rewind arena to a previously captured mark, freeing all blocks allocated after it.
   *
   * If mark is NULL, performs a full reset. If mark is invalid (not from this
   * arena), this is a no-op.
   * After rewind, new allocations reuse the same memory addresses.
   */
  if (!a || !a->head) {
    return;
  }
  if (!mark.block) {
    /* Treat null mark as full reset. */
    zr_arena_reset(a);
    return;
  }

  /* Walk to mark.block. */
  zr_arena_block_t* cur = a->head;
  while (cur && cur != mark.block) {
    cur = cur->next;
  }
  if (!cur) {
    /* Mark not from this arena; ignore. */
    return;
  }

  if (mark.used_in_block > cur->cap) {
    return;
  }

  /* Free blocks after mark.block, and rewind the mark.block usage. */
  zr_arena_block_t* rest = cur->next;
  cur->next = NULL;
  cur->used = mark.used_in_block;
  zr__block_free_chain(rest);

  a->cur = cur;

  /* Recompute total_bytes deterministically. */
  size_t total = 0u;
  for (zr_arena_block_t* it = a->head; it; it = it->next) {
    size_t next_total = 0u;
    if (!zr_checked_add_size(total, it->cap, &next_total)) {
      /* Should not happen; fall back to conservative 0. */
      total = 0u;
      break;
    }
    total = next_total;
  }
  a->total_bytes = total;
}
