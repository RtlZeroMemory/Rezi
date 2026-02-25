/*
  include/zr/zr_debug.h — Public debug trace API for diagnostics and verification.

  Why: Provides a stable, buffer-oriented API for capturing and querying diagnostic
  records without per-frame heap churn. Enables wrappers to inspect frame state,
  event routing, and error conditions for debugging rendering issues.

  Design:
    - Records are stored in a fixed-capacity ring buffer (no allocations in hot paths).
    - Callers can query recent records by category or dump all for offline analysis.
    - All record types are POD with fixed-width integers for ABI stability.
*/

#ifndef ZR_ZR_DEBUG_H_INCLUDED
#define ZR_ZR_DEBUG_H_INCLUDED

#include "zr/zr_result.h"

#include <stdint.h>

#define ZR_DEBUG_SOURCE_FILE_LEN 32u
#define ZR_DEBUG_MESSAGE_LEN 64u

/*
  Debug record categories.

  Why: Allows filtering records by subsystem when querying the trace buffer.
*/
typedef enum zr_debug_category_t {
  ZR_DEBUG_CAT_NONE = 0,
  ZR_DEBUG_CAT_FRAME = 1,    /* Frame lifecycle (submit, present) */
  ZR_DEBUG_CAT_EVENT = 2,    /* Event processing (poll, parse, route) */
  ZR_DEBUG_CAT_DRAWLIST = 3, /* Drawlist validation and execution */
  ZR_DEBUG_CAT_ERROR = 4,    /* Errors and warnings */
  ZR_DEBUG_CAT_STATE = 5,    /* State transitions */
  ZR_DEBUG_CAT_PERF = 6,     /* Performance measurements */
} zr_debug_category_t;

/*
  Debug severity levels.

  Why: Allows filtering by importance and enables warning aggregation.
*/
typedef enum zr_debug_severity_t {
  ZR_DEBUG_SEV_TRACE = 0, /* Verbose tracing (disabled by default) */
  ZR_DEBUG_SEV_INFO = 1,  /* Informational (frame boundaries, etc.) */
  ZR_DEBUG_SEV_WARN = 2,  /* Warnings (recoverable issues) */
  ZR_DEBUG_SEV_ERROR = 3, /* Errors (operation failed) */
} zr_debug_severity_t;

/*
  Debug record header (common to all record types).

  Why: Provides a uniform prefix for indexing, filtering, and correlation.
*/
typedef struct zr_debug_record_header_t {
  uint64_t record_id;    /* Monotonic record counter */
  uint64_t timestamp_us; /* Microseconds since engine_debug_enable() */
  uint64_t frame_id;     /* Associated frame (0 if not applicable) */
  uint32_t category;     /* zr_debug_category_t */
  uint32_t severity;     /* zr_debug_severity_t */
  uint32_t code;         /* Subsystem-specific code */
  uint32_t payload_size; /* Size of payload following header */
} zr_debug_record_header_t;

/*
  Frame record payload — captures per-frame diagnostics.

  Why: Enables frame-by-frame comparison to identify rendering regressions.
*/
typedef struct zr_debug_frame_record_t {
  uint64_t frame_id;
  uint32_t cols;
  uint32_t rows;
  uint32_t drawlist_bytes;
  uint32_t drawlist_cmds;
  uint32_t diff_bytes_emitted;
  uint32_t dirty_lines;
  uint32_t dirty_cells;
  uint32_t damage_rects;
  uint32_t us_drawlist; /* Microseconds for drawlist execution */
  uint32_t us_diff;     /* Microseconds for diff rendering */
  uint32_t us_write;    /* Microseconds for platform write */
  uint32_t _pad0;
} zr_debug_frame_record_t;

/*
  Event record payload — captures event processing details.

  Why: Enables tracing of event flow from terminal input to handler dispatch.
*/
typedef struct zr_debug_event_record_t {
  uint64_t frame_id;
  uint32_t event_type; /* zr_event_type_t */
  uint32_t event_flags;
  uint32_t time_ms;
  uint32_t raw_bytes_len; /* Length of raw input bytes (if captured) */
  uint32_t parse_result;  /* ZR_OK or error code */
  uint32_t _pad0;
} zr_debug_event_record_t;

/*
  Error record payload — captures error context for diagnostics.

  Why: Aggregates errors with context for post-mortem analysis.
*/
typedef struct zr_debug_error_record_t {
  uint64_t frame_id;
  uint32_t error_code;       /* zr_result_t value */
  uint32_t source_line;      /* Source line (0 if not available) */
  uint32_t occurrence_count; /* Times this error has occurred */
  uint32_t _pad0;
  /*
    source_file: 32-byte fixed buffer for source file name (truncated).
    Why: Avoids pointer indirection while providing actionable context.
  */
  char source_file[ZR_DEBUG_SOURCE_FILE_LEN];
  /*
    message: 64-byte fixed buffer for error message (truncated).
  */
  char message[ZR_DEBUG_MESSAGE_LEN];
} zr_debug_error_record_t;

/*
  Drawlist record payload — captures drawlist execution details.

  Why: Enables verification of drawlist commands and their effects.
*/
typedef struct zr_debug_drawlist_record_t {
  uint64_t frame_id;
  uint32_t total_bytes;
  uint32_t cmd_count;
  uint32_t version;           /* Drawlist version (1 or 2) */
  uint32_t validation_result; /* ZR_OK or error code */
  uint32_t execution_result;  /* ZR_OK or error code */
  uint32_t clip_stack_max_depth;
  uint32_t text_runs;
  uint32_t fill_rects;
  uint32_t _pad0;
  uint32_t _pad1;
} zr_debug_drawlist_record_t;

/*
  Performance record payload — captures timing measurements.

  Why: Enables identification of performance bottlenecks.
*/
typedef struct zr_debug_perf_record_t {
  uint64_t frame_id;
  uint32_t phase;           /* 0=poll, 1=submit, 2=present */
  uint32_t us_elapsed;      /* Microseconds for this phase */
  uint32_t bytes_processed; /* Bytes read/written */
  uint32_t _pad0;
} zr_debug_perf_record_t;

/*
  Debug configuration.

  Why: Controls which categories and severity levels are captured.
*/
typedef struct zr_debug_config_t {
  uint32_t enabled;                /* Master enable flag (0/1) */
  uint32_t ring_capacity;          /* Max records in ring buffer (0 = default) */
  uint32_t min_severity;           /* Minimum severity to capture */
  uint32_t category_mask;          /* Bitmask of enabled categories */
  uint32_t capture_raw_events;     /* Capture raw event bytes (0/1) */
  uint32_t capture_drawlist_bytes; /* Capture drawlist bytes (0/1) */
  uint32_t _pad0;
  uint32_t _pad1;
} zr_debug_config_t;

/*
  Debug query filter.

  Why: Allows callers to filter records when querying the trace buffer.
*/
typedef struct zr_debug_query_t {
  uint64_t min_record_id; /* Start at this record ID (0 = oldest) */
  uint64_t max_record_id; /* End at this record ID (0 = newest) */
  uint64_t min_frame_id;  /* Filter by frame range (0 = no filter) */
  uint64_t max_frame_id;
  uint32_t category_mask; /* Bitmask of categories to include */
  uint32_t min_severity;  /* Minimum severity to include */
  uint32_t max_records;   /* Maximum records to return (0 = no limit) */
  uint32_t _pad0;
} zr_debug_query_t;

/*
  Debug query result.

  Why: Returns query statistics along with record count.
*/
typedef struct zr_debug_query_result_t {
  uint32_t records_returned;  /* Number of records copied */
  uint32_t records_available; /* Total matching records in buffer */
  uint64_t oldest_record_id;  /* Oldest record ID still in buffer */
  uint64_t newest_record_id;  /* Newest record ID in buffer */
  uint32_t records_dropped;   /* Total records overwritten since enable/reset (best-effort; may clamp) */
  uint32_t _pad0;
} zr_debug_query_result_t;

/*
  Debug statistics snapshot.

  Why: Provides aggregate counts for monitoring without querying individual records.
*/
typedef struct zr_debug_stats_t {
  uint64_t total_records;      /* Total records ever written */
  uint64_t total_dropped;      /* Records dropped due to ring overflow */
  uint32_t error_count;        /* Total error records */
  uint32_t warn_count;         /* Total warning records */
  uint32_t current_ring_usage; /* Records currently in ring */
  uint32_t ring_capacity;      /* Ring buffer capacity */
} zr_debug_stats_t;

/*
  zr_debug_config_default:
    - Returns a default debug configuration with reasonable settings.
    - Category mask enables all categories by default.
*/
zr_debug_config_t zr_debug_config_default(void);

#endif /* ZR_ZR_DEBUG_H_INCLUDED */
