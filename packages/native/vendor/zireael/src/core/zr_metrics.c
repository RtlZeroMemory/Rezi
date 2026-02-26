/*
  src/core/zr_metrics.c — ABI-safe metrics snapshot storage and copy-out.

  Why: Centralizes metrics snapshot storage so engine_get_metrics can perform
  safe prefix-copy without allocations or platform dependencies.
*/

#include "core/zr_metrics_internal.h"

#include "core/zr_version.h"

#include <stddef.h>
#include <string.h>

zr_metrics_t zr_metrics__default_snapshot(void) {
  zr_metrics_t m;
  memset(&m, 0, sizeof(m));
  m.struct_size = (uint32_t)sizeof(zr_metrics_t);

  m.negotiated_engine_abi_major = (uint32_t)ZR_ENGINE_ABI_MAJOR;
  m.negotiated_engine_abi_minor = (uint32_t)ZR_ENGINE_ABI_MINOR;
  m.negotiated_engine_abi_patch = (uint32_t)ZR_ENGINE_ABI_PATCH;
  m.negotiated_drawlist_version = (uint32_t)ZR_DRAWLIST_VERSION_V1;
  m.negotiated_event_batch_version = (uint32_t)ZR_EVENT_BATCH_VERSION_V1;
  return m;
}

static size_t zr_min_size(size_t a, size_t b) { return (a < b) ? a : b; }

/* Prefix-copy a snapshot into out_metrics without overruns (append-only ABI). */
zr_result_t zr_metrics__copy_out(zr_metrics_t* out_metrics, const zr_metrics_t* snapshot) {
  if (!out_metrics || !snapshot) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (out_metrics->struct_size != 0u && out_metrics->struct_size < (uint32_t)sizeof(uint32_t)) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_metrics_t snap = *snapshot;
  snap.struct_size = (uint32_t)sizeof(zr_metrics_t);

  size_t n = 0u;
  if (out_metrics->struct_size != 0u) {
    n = (size_t)out_metrics->struct_size;
  }
  n = zr_min_size(n, sizeof(zr_metrics_t));

  if (n != 0u) {
    memcpy(out_metrics, &snap, n);
  }
  return ZR_OK;
}
