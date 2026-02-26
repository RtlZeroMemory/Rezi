/*
  src/core/zr_event_pack.c — Packed event batch v1 serializer implementation.

  Why: Produces a deterministic, cap-bounded on-wire event batch where
  truncation never produces partial records.
*/

#include "core/zr_event_pack.h"

#include "util/zr_bytes.h"
#include "util/zr_checked.h"

#include <string.h>

static size_t zr__align4(size_t v) {
  size_t out = 0u;
  if (!zr_checked_align_up_size(v, 4u, &out)) {
    return 0u;
  }
  return out;
}

static bool zr__can_write(const zr_evpack_writer_t* w, size_t n) {
  if (!w) {
    return false;
  }
  if ((!w->out_buf && w->out_cap != 0u) || w->len > w->out_cap) {
    return false;
  }
  if (n > (w->out_cap - w->len)) {
    return false;
  }
  return true;
}

static bool zr__write_bytes(zr_evpack_writer_t* w, const void* bytes, size_t n) {
  if (!w || (!bytes && n != 0u)) {
    return false;
  }
  if (!zr__can_write(w, n)) {
    return false;
  }
  if (n != 0u) {
    memcpy(w->out_buf + w->len, bytes, n);
  }
  w->len += n;
  return true;
}

static bool zr__write_u32le(zr_evpack_writer_t* w, uint32_t v) {
  uint8_t tmp[4];
  zr_store_u32le(tmp, v);
  return zr__write_bytes(w, tmp, sizeof(tmp));
}

/* Begin writing an event batch; writes placeholder header to be patched by finish. */
zr_result_t zr_evpack_begin(zr_evpack_writer_t* w, uint8_t* out_buf, size_t out_cap) {
  if (!w) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  memset(w, 0, sizeof(*w));
  w->out_buf = out_buf;
  w->out_cap = out_cap;

  if (!out_buf && out_cap != 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_cap < sizeof(zr_evbatch_header_t)) {
    return ZR_ERR_LIMIT;
  }

  /* Write placeholder header; patched by zr_evpack_finish(). */
  if (!zr__write_u32le(w, ZR_EV_MAGIC) || !zr__write_u32le(w, ZR_EVENT_BATCH_VERSION_V1) ||
      !zr__write_u32le(w, 0u) || !zr__write_u32le(w, 0u) || !zr__write_u32le(w, 0u) ||
      !zr__write_u32le(w, 0u)) {
    /* Should be unreachable due to pre-check. */
    memset(w, 0, sizeof(*w));
    return ZR_ERR_LIMIT;
  }

  w->started = true;
  return ZR_OK;
}

bool zr_evpack_append_record(zr_evpack_writer_t* w, zr_event_type_t type, uint32_t time_ms,
                             uint32_t flags, const void* payload, size_t payload_len) {
  return zr_evpack_append_record2(w, type, time_ms, flags, payload, payload_len, NULL, 0u);
}

/* Append event record with two payload chunks; sets TRUNCATED flag if no space. */
bool zr_evpack_append_record2(zr_evpack_writer_t* w, zr_event_type_t type, uint32_t time_ms,
                              uint32_t flags, const void* p1, size_t n1, const void* p2,
                              size_t n2) {
  if (!w || !w->started) {
    return false;
  }
  if (w->truncated) {
    return false;
  }
  if ((!p1 && n1 != 0u) || (!p2 && n2 != 0u)) {
    w->truncated = true;
    w->batch_flags |= ZR_EV_BATCH_TRUNCATED;
    return false;
  }

  size_t rec_unaligned = 0u;
  if (!zr_checked_add_size(sizeof(zr_ev_record_header_t), n1, &rec_unaligned)) {
    w->truncated = true;
    w->batch_flags |= ZR_EV_BATCH_TRUNCATED;
    return false;
  }
  if (!zr_checked_add_size(rec_unaligned, n2, &rec_unaligned)) {
    w->truncated = true;
    w->batch_flags |= ZR_EV_BATCH_TRUNCATED;
    return false;
  }
  const size_t rec_size = zr__align4(rec_unaligned);
  if (rec_size == 0u || rec_size > (size_t)UINT32_MAX) {
    w->truncated = true;
    w->batch_flags |= ZR_EV_BATCH_TRUNCATED;
    return false;
  }

  if (!zr__can_write(w, rec_size)) {
    w->truncated = true;
    w->batch_flags |= ZR_EV_BATCH_TRUNCATED;
    return false;
  }

  const size_t pad = rec_size - rec_unaligned;
  const uint8_t zero_pad[4] = {0u, 0u, 0u, 0u};

  /* Now that we know it fits, writes must not fail. */
  (void)zr__write_u32le(w, (uint32_t)type);
  (void)zr__write_u32le(w, (uint32_t)rec_size);
  (void)zr__write_u32le(w, time_ms);
  (void)zr__write_u32le(w, flags);
  (void)zr__write_bytes(w, p1, n1);
  (void)zr__write_bytes(w, p2, n2);
  if (pad != 0u) {
    (void)zr__write_bytes(w, zero_pad, pad);
  }

  w->event_count++;
  return true;
}

/* Finalize batch header (total_size, event_count, flags) and return total length. */
size_t zr_evpack_finish(zr_evpack_writer_t* w) {
  if (!w || !w->started) {
    return 0u;
  }

  /* Patch header fields at fixed offsets (u32 words). */
  if (w->out_buf && w->len >= sizeof(zr_evbatch_header_t)) {
    zr_store_u32le(w->out_buf + 2u * 4u, (uint32_t)w->len); /* total_size */
    zr_store_u32le(w->out_buf + 3u * 4u, w->event_count);   /* event_count */
    zr_store_u32le(w->out_buf + 4u * 4u, w->batch_flags);   /* flags */
  }
  return w->len;
}
