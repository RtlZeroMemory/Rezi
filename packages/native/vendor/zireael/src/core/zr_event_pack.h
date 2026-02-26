/*
  src/core/zr_event_pack.h — Packed event batch v1 serializer.

  Why: Writes a self-framed event batch into a caller-provided buffer with
  deterministic truncation and without partial record writes.
*/

#ifndef ZR_CORE_ZR_EVENT_PACK_H_INCLUDED
#define ZR_CORE_ZR_EVENT_PACK_H_INCLUDED

#include "core/zr_event.h"
#include "util/zr_result.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct zr_evpack_writer_t {
  uint8_t* out_buf;
  size_t out_cap;

  size_t len;
  uint32_t event_count;
  uint32_t batch_flags;

  bool started;
  bool truncated;
} zr_evpack_writer_t;

/*
  zr_evpack_begin:
    - Writes the batch header with placeholder fields.
    - On success, subsequent appends will either write whole records or set
      TRUNCATED and write nothing.

  Returns:
    - ZR_OK on success
    - ZR_ERR_LIMIT if out_cap < sizeof(zr_evbatch_header_t) (writes nothing)
    - ZR_ERR_INVALID_ARGUMENT on invalid args
*/
zr_result_t zr_evpack_begin(zr_evpack_writer_t* w, uint8_t* out_buf, size_t out_cap);

/*
  zr_evpack_append_record:
    - Attempts to append exactly one complete record (header + payload + pad).
    - If the record does not fit, the writer becomes truncated, no bytes are
      written for this record, and false is returned.

  Requirements:
    - zr_evpack_begin() must have succeeded.
    - payload may be NULL only if payload_len == 0.
*/
bool zr_evpack_append_record(zr_evpack_writer_t* w, zr_event_type_t type, uint32_t time_ms,
                             uint32_t flags, const void* payload, size_t payload_len);

/*
  zr_evpack_append_record2:
    - Like zr_evpack_append_record(), but payload is two contiguous parts.
    - Useful for variable-length payload records like PASTE and USER
      ({hdr}{bytes}).
*/
bool zr_evpack_append_record2(zr_evpack_writer_t* w, zr_event_type_t type, uint32_t time_ms,
                              uint32_t flags, const void* p1, size_t n1, const void* p2,
                              size_t n2);

/*
  zr_evpack_finish:
    - Patches the batch header in-place (total_size/event_count/flags).
    - Returns the final bytes written (>= header size on success).
*/
size_t zr_evpack_finish(zr_evpack_writer_t* w);

static inline bool zr_evpack_truncated(const zr_evpack_writer_t* w) {
  return w ? w->truncated : true;
}

#endif /* ZR_CORE_ZR_EVENT_PACK_H_INCLUDED */
