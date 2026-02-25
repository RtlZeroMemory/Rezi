/*
  src/core/zr_event_queue.c — Normalized event queue implementation.

  Why: Provides bounded FIFO storage with deterministic coalescing and drop
  behavior. User events are injectible from any thread and are copied into
  bounded storage without logging.
*/

#include "core/zr_event_queue.h"

#include "util/zr_assert.h"
#include "util/zr_thread_yield.h"

#include <string.h>

enum {
  ZR_EVQ_LOCK_YIELD_MASK = 63u,
};

/* Lock accepts NULL to simplify error paths (becomes no-op). */
static void zr_evq_lock(zr_event_queue_t* q) {
  if (!q) {
    return;
  }
  uint32_t spins = 0u;
  while (atomic_flag_test_and_set_explicit(&q->lock, memory_order_acquire)) {
    spins++;
    if ((spins & ZR_EVQ_LOCK_YIELD_MASK) == 0u) {
      zr_thread_yield();
    }
  }
}

static void zr_evq_unlock(zr_event_queue_t* q) {
  if (!q) {
    return;
  }
  atomic_flag_clear_explicit(&q->lock, memory_order_release);
}

static uint32_t zr_evq_index(const zr_event_queue_t* q, uint32_t i) {
  if (!q || q->cap == 0u) {
    return 0u;
  }
  return (q->head + i) % q->cap;
}

static bool zr_evq_is_resize(const zr_event_t* ev) {
  return ev && ev->type == ZR_EV_RESIZE;
}

static bool zr_evq_is_mouse_coalescible(const zr_event_t* ev) {
  if (!ev || ev->type != ZR_EV_MOUSE) {
    return false;
  }
  return (ev->u.mouse.kind == (uint32_t)ZR_MOUSE_MOVE) || (ev->u.mouse.kind == (uint32_t)ZR_MOUSE_DRAG);
}

/*
 * Event coalescing: replace the last matching event rather than appending.
 *
 * Coalesced event types:
 *   - RESIZE: Only the final terminal size matters; intermediate sizes
 *     are stale by the time they're processed.
 *   - MOUSE MOVE/DRAG: Position updates can collapse; only latest matters
 *     for hover/drag tracking.
 *
 * Returns true if the event was coalesced (caller should NOT push).
 * Returns false if no coalescible match found (caller should push normally).
 */
static bool zr_evq_try_coalesce_locked(zr_event_queue_t* q, const zr_event_t* ev) {
  if (!q || !ev || q->count == 0u) {
    return false;
  }

  const bool want_resize = zr_evq_is_resize(ev);
  const bool want_mouse = zr_evq_is_mouse_coalescible(ev);
  if (!want_resize && !want_mouse) {
    return false;
  }

  int found_at = -1;
  for (uint32_t i = 0u; i < q->count; i++) {
    const uint32_t idx = zr_evq_index(q, i);
    const zr_event_t* cur = &q->events[idx];
    if (want_resize && zr_evq_is_resize(cur)) {
      found_at = (int)idx;
    } else if (want_mouse && zr_evq_is_mouse_coalescible(cur)) {
      found_at = (int)idx;
    }
  }

  if (found_at < 0) {
    return false;
  }

  q->events[(uint32_t)found_at] = *ev;
  q->dropped_coalesce_candidates++;
  return true;
}

/*
 * Ring buffer allocation for user event payloads.
 *
 * Layout based on head/tail positions:
 *
 *   Case 1: tail >= head (normal or empty)
 *     [....head=====tail....]
 *           ^         ^
 *           |         +-- write here first
 *           +-- read from here
 *     Try space at end, then wrap to start if needed.
 *
 *   Case 2: tail < head (wrapped)
 *     [====tail......head====]
 *          ^          ^
 *          |          +-- read from here
 *          +-- write here
 *     Contiguous space between tail and head only.
 *
 * Returns true and sets *out_off on success; false if insufficient space.
 */
static bool zr_evq_user_alloc_locked(zr_event_queue_t* q, uint32_t n, uint32_t* out_off) {
  if (!q || !out_off) {
    return false;
  }
  if (n == 0u) {
    *out_off = q->user_tail;
    return true;
  }
  if (!q->user_bytes || q->user_bytes_cap == 0u) {
    return false;
  }
  if (n > (q->user_bytes_cap - q->user_used)) {
    return false;
  }

  if (q->user_used == 0u) {
    q->user_head = q->user_tail;
    q->user_pad_end = 0u;
  }

  /*
    This ring stores variable-sized, contiguous payload slices in FIFO order.
    When a write cannot fit at the end, we may wrap to 0. Any remaining bytes at
    the end become "pad" that is temporarily unusable until the read head wraps.

    We track that pad explicitly (user_pad_end) so allocations remain correct and
    freeing can advance over the pad deterministically.
  */
  if (q->user_tail >= q->user_head) {
    const uint32_t space_end = q->user_bytes_cap - q->user_tail;
    if (n <= space_end) {
      *out_off = q->user_tail;
      q->user_tail += n;
      if (q->user_tail == q->user_bytes_cap) {
        q->user_tail = 0u;
      }
      q->user_used += n;
      return true;
    }

    /* Wrap to 0 if there is space before head and we can afford the end pad. */
    const uint32_t pad = space_end;
    if (q->user_pad_end != 0u) {
      return false;
    }
    if (n > q->user_head) {
      return false;
    }
    if (pad > (q->user_bytes_cap - q->user_used - n)) {
      return false;
    }

    q->user_pad_end = pad;
    q->user_used += pad;
    q->user_tail = 0u;

    *out_off = 0u;
    q->user_tail = n;
    q->user_used += n;
    return true;
  }

  /* tail < head: contiguous space between them (end pad, if any, is already accounted for in user_used). */
  const uint32_t space_mid = q->user_head - q->user_tail;
  if (n > space_mid) {
    return false;
  }
  *out_off = q->user_tail;
  q->user_tail += n;
  q->user_used += n;
  return true;
}

/* Free user payload bytes at ring buffer head when an event is consumed. */
static void zr_evq_user_free_head_locked(zr_event_queue_t* q, uint32_t off, uint32_t n) {
  if (!q || n == 0u) {
    return;
  }
  ZR_ASSERT(q->user_used >= n);
  ZR_ASSERT(off == q->user_head);

  q->user_head += n;
  if (q->user_head >= q->user_bytes_cap) {
    q->user_head -= q->user_bytes_cap;
  }
  q->user_used -= n;

  /*
    If we wrapped during allocation, bytes at the end are marked as pad until
    the read head reaches them. Once the head hits the pad start, drop the pad
    and wrap the head to 0 so the next payload offset matches.
  */
  if (q->user_pad_end != 0u) {
    const uint32_t pad_start = q->user_bytes_cap - q->user_pad_end;
    if (q->user_head == pad_start) {
      ZR_ASSERT(q->user_used >= q->user_pad_end);
      q->user_used -= q->user_pad_end;
      q->user_pad_end = 0u;
      q->user_head = 0u;
    }
  }
  if (q->user_used == 0u) {
    q->user_head = 0u;
    q->user_tail = 0u;
    q->user_pad_end = 0u;
  }
}

/* Drop the oldest event when the queue is full; frees any user payload. */
static void zr_evq_drop_head_locked(zr_event_queue_t* q) {
  if (!q || q->count == 0u) {
    return;
  }

  zr_event_t* head_ev = &q->events[q->head];
  if (head_ev->type == ZR_EV_USER) {
    const uint32_t off = head_ev->u.user.payload_off;
    const uint32_t n = head_ev->u.user.hdr.byte_len;
    zr_evq_user_free_head_locked(q, off, n);
    q->dropped_user_due_to_full++;
  } else if (head_ev->type == ZR_EV_PASTE) {
    const uint32_t off = head_ev->u.paste.payload_off;
    const uint32_t n = head_ev->u.paste.hdr.byte_len;
    zr_evq_user_free_head_locked(q, off, n);
  }

  q->head = (q->head + 1u) % q->cap;
  q->count--;

  q->dropped_total++;
  q->dropped_due_to_full++;
}

/*
  Check whether a paste payload can be enqueued without mutating the queue.

  Why: Paste enqueue may drop the oldest event when full. We avoid dropping an
  event if the payload ring cannot accept this paste anyway.
*/
static bool zr_evq_can_enqueue_paste_locked(const zr_event_queue_t* q, uint32_t byte_len) {
  if (!q) {
    return false;
  }

  /*
    Probe on a stack copy so this capacity check never mutates live queue state.
    Why: callers need a yes/no decision before deciding whether to drop events.
  */
  zr_event_queue_t probe;
  memset(&probe, 0, sizeof(probe));

  probe.events = q->events;
  probe.cap = q->cap;
  probe.head = q->head;
  probe.count = q->count;

  probe.user_bytes = q->user_bytes;
  probe.user_bytes_cap = q->user_bytes_cap;
  probe.user_head = q->user_head;
  probe.user_tail = q->user_tail;
  probe.user_used = q->user_used;
  probe.user_pad_end = q->user_pad_end;

  if (probe.count == probe.cap) {
    zr_evq_drop_head_locked(&probe);
  }

  uint32_t off_tmp = 0u;
  return zr_evq_user_alloc_locked(&probe, byte_len, &off_tmp);
}

zr_result_t zr_event_queue_init(zr_event_queue_t* q, zr_event_t* events, uint32_t events_cap, uint8_t* user_bytes,
                                uint32_t user_bytes_cap) {
  if (!q || !events || events_cap == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (!user_bytes && user_bytes_cap != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  memset(q, 0, sizeof(*q));
  q->events = events;
  q->cap = events_cap;
  q->user_bytes = user_bytes;
  q->user_bytes_cap = user_bytes_cap;
  atomic_flag_clear(&q->lock);

  return ZR_OK;
}

/* Push an event, coalescing RESIZE/MOUSE_MOVE if possible, or dropping oldest if full. */
zr_result_t zr_event_queue_push(zr_event_queue_t* q, const zr_event_t* ev) {
  if (!q || !ev || !q->events || q->cap == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_evq_lock(q);

  if (zr_evq_try_coalesce_locked(q, ev)) {
    zr_evq_unlock(q);
    return ZR_OK;
  }

  if (q->count == q->cap) {
    zr_evq_drop_head_locked(q);
  }

  const uint32_t tail = zr_evq_index(q, q->count);
  q->events[tail] = *ev;
  q->count++;

  zr_evq_unlock(q);
  return ZR_OK;
}

zr_result_t zr_event_queue_try_push_no_drop(zr_event_queue_t* q, const zr_event_t* ev) {
  if (!q || !ev || !q->events || q->cap == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_evq_lock(q);

  if (zr_evq_try_coalesce_locked(q, ev)) {
    zr_evq_unlock(q);
    return ZR_OK;
  }

  if (q->count == q->cap) {
    q->dropped_total++;
    q->dropped_due_to_full++;
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  const uint32_t tail = zr_evq_index(q, q->count);
  q->events[tail] = *ev;
  q->count++;

  zr_evq_unlock(q);
  return ZR_OK;
}

/* Post a user-defined event with optional payload; returns ZR_ERR_LIMIT if no space. */
zr_result_t zr_event_queue_post_user(zr_event_queue_t* q, uint32_t time_ms, uint32_t tag, const uint8_t* payload,
                                     uint32_t payload_len) {
  if (!q || !q->events || q->cap == 0u || (!payload && payload_len != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_evq_lock(q);

  if (q->count == q->cap) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }
  if (payload_len > q->user_bytes_cap) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  uint32_t off = 0u;
  if (!zr_evq_user_alloc_locked(q, payload_len, &off)) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  if (payload_len != 0u) {
    memcpy(q->user_bytes + off, payload, payload_len);
  }

  zr_event_t ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = ZR_EV_USER;
  ev.time_ms = time_ms;
  ev.flags = 0u;
  ev.u.user.hdr.tag = tag;
  ev.u.user.hdr.byte_len = payload_len;
  ev.u.user.hdr.reserved0 = 0u;
  ev.u.user.hdr.reserved1 = 0u;
  ev.u.user.payload_off = off;
  ev.u.user.reserved0 = 0u;

  const uint32_t tail = zr_evq_index(q, q->count);
  q->events[tail] = ev;
  q->count++;

  zr_evq_unlock(q);
  return ZR_OK;
}

/*
  Post a bracketed paste event from the engine thread.

  Why: Bracketed paste can deliver large payloads (including newlines) that
  wrappers need as a single byte slice, not as per-byte text events. Payload is
  copied into bounded storage; on queue-full we drop the oldest event to
  preserve forward progress.
*/
zr_result_t zr_event_queue_post_paste(zr_event_queue_t* q, uint32_t time_ms, const uint8_t* bytes, uint32_t byte_len) {
  if (!q || !q->events || q->cap == 0u || (!bytes && byte_len != 0u)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_evq_lock(q);

  if (byte_len > q->user_bytes_cap) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  if (!zr_evq_can_enqueue_paste_locked(q, byte_len)) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  if (q->count == q->cap) {
    zr_evq_drop_head_locked(q);
  }

  uint32_t off = 0u;
  if (!zr_evq_user_alloc_locked(q, byte_len, &off)) {
    zr_evq_unlock(q);
    return ZR_ERR_LIMIT;
  }

  if (byte_len != 0u) {
    memcpy(q->user_bytes + off, bytes, byte_len);
  }

  zr_event_t ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = ZR_EV_PASTE;
  ev.time_ms = time_ms;
  ev.flags = 0u;
  ev.u.paste.hdr.byte_len = byte_len;
  ev.u.paste.hdr.reserved0 = 0u;
  ev.u.paste.payload_off = off;
  ev.u.paste.reserved0 = 0u;

  const uint32_t tail = zr_evq_index(q, q->count);
  q->events[tail] = ev;
  q->count++;

  zr_evq_unlock(q);
  return ZR_OK;
}

bool zr_event_queue_peek(const zr_event_queue_t* q, zr_event_t* out_ev) {
  if (!q || !out_ev || !q->events || q->cap == 0u) {
    return false;
  }

  /* Cast away const for locking only; state is not modified. */
  zr_evq_lock((zr_event_queue_t*)q);
  if (q->count == 0u) {
    zr_evq_unlock((zr_event_queue_t*)q);
    return false;
  }
  *out_ev = q->events[q->head];
  zr_evq_unlock((zr_event_queue_t*)q);
  return true;
}

bool zr_event_queue_pop(zr_event_queue_t* q, zr_event_t* out_ev) {
  if (!q || !out_ev || !q->events || q->cap == 0u) {
    return false;
  }

  zr_evq_lock(q);
  if (q->count == 0u) {
    zr_evq_unlock(q);
    return false;
  }

  zr_event_t ev = q->events[q->head];
  q->head = (q->head + 1u) % q->cap;
  q->count--;

  if (ev.type == ZR_EV_USER) {
    zr_evq_user_free_head_locked(q, ev.u.user.payload_off, ev.u.user.hdr.byte_len);
  } else if (ev.type == ZR_EV_PASTE) {
    zr_evq_user_free_head_locked(q, ev.u.paste.payload_off, ev.u.paste.hdr.byte_len);
  }

  zr_evq_unlock(q);
  *out_ev = ev;
  return true;
}

/* Return a synchronized snapshot of queue depth for concurrent poll/post usage. */
uint32_t zr_event_queue_count(const zr_event_queue_t* q) {
  if (!q || !q->events || q->cap == 0u) {
    return 0u;
  }

  zr_event_queue_t* mutable_q = (zr_event_queue_t*)q;
  zr_evq_lock(mutable_q);
  const uint32_t count = mutable_q->count;
  zr_evq_unlock(mutable_q);
  return count;
}

/* Get a read-only view into a user event's payload bytes; valid until event is popped. */
bool zr_event_queue_user_payload_view(const zr_event_queue_t* q, const zr_event_t* ev, const uint8_t** out_bytes,
                                      uint32_t* out_len) {
  if (!q || !q->events || q->cap == 0u || !ev || !out_bytes || !out_len) {
    return false;
  }
  if (ev->type != ZR_EV_USER) {
    return false;
  }

  *out_len = ev->u.user.hdr.byte_len;
  if (*out_len == 0u) {
    *out_bytes = NULL;
    return true;
  }

  if (!q->user_bytes || q->user_bytes_cap == 0u) {
    return false;
  }
  if (ev->u.user.payload_off > q->user_bytes_cap) {
    return false;
  }
  if (*out_len > (q->user_bytes_cap - ev->u.user.payload_off)) {
    return false;
  }

  *out_bytes = q->user_bytes + ev->u.user.payload_off;
  return true;
}

/* Get a read-only view into a paste event's payload bytes; valid until event is popped. */
bool zr_event_queue_paste_payload_view(const zr_event_queue_t* q, const zr_event_t* ev, const uint8_t** out_bytes,
                                       uint32_t* out_len) {
  if (!q || !q->events || q->cap == 0u || !ev || !out_bytes || !out_len) {
    return false;
  }
  if (ev->type != ZR_EV_PASTE) {
    return false;
  }

  *out_len = ev->u.paste.hdr.byte_len;
  if (*out_len == 0u) {
    *out_bytes = NULL;
    return true;
  }

  if (!q->user_bytes || q->user_bytes_cap == 0u) {
    return false;
  }
  if (ev->u.paste.payload_off > q->user_bytes_cap) {
    return false;
  }
  if (*out_len > (q->user_bytes_cap - ev->u.paste.payload_off)) {
    return false;
  }

  *out_bytes = q->user_bytes + ev->u.paste.payload_off;
  return true;
}
