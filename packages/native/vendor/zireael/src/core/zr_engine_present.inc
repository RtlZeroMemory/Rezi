/*
  src/core/zr_engine_present.inc — engine_present() pipeline helpers.

  Why: Keeps the present-path logic physically separated from input/poll/teardown
  orchestration to reduce `zr_engine.c` surface area while preserving one-TU
  static helper visibility.
*/

typedef struct zr_diff_telemetry_record_t {
  uint64_t frame_id;
  uint64_t sweep_frames_total;
  uint64_t damage_frames_total;
  uint64_t scroll_attempts_total;
  uint64_t scroll_hits_total;
  uint64_t collision_guard_hits_total;
  uint8_t path_sweep_used;
  uint8_t path_damage_used;
  uint8_t scroll_opt_attempted;
  uint8_t scroll_opt_hit;
  uint32_t collision_guard_hits_last;
  uint32_t _pad0;
} zr_diff_telemetry_record_t;

/*
  Select the framebuffer to present for this frame.

  Why: The debug overlay is a presentation-time concern. It must not pollute
  fb_next (the logical app framebuffer), so overlay composition happens on
  fb_stage and only affects what diff/present sees for this frame.
*/
static zr_result_t zr_engine_present_pick_fb(zr_engine_t* e, const zr_fb_t** out_present_fb,
                                             bool* out_presented_stage) {
  if (!e || !out_present_fb || !out_presented_stage) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  if (e->cfg_runtime.enable_debug_overlay == 0u) {
    *out_present_fb = &e->fb_next;
    *out_presented_stage = false;
    return ZR_OK;
  }

  if (!e->fb_next.cells || !e->fb_stage.cells || e->fb_next.cols != e->fb_stage.cols ||
      e->fb_next.rows != e->fb_stage.rows) {
    return ZR_ERR_PLATFORM;
  }

  zr_engine_fb_copy(&e->fb_next, &e->fb_stage);
  zr_result_t rc = zr_debug_overlay_render(&e->fb_stage, &e->metrics);
  if (rc != ZR_OK) {
    return rc;
  }

  *out_present_fb = &e->fb_stage;
  *out_presented_stage = true;
  return ZR_OK;
}

static zr_result_t zr_engine_present_render(zr_engine_t* e, const zr_fb_t* present_fb, size_t* out_len,
                                            zr_term_state_t* final_ts, zr_diff_stats_t* stats) {
  if (!e || !present_fb || !out_len || !final_ts || !stats) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  zr_diff_scratch_t scratch;
  memset(&scratch, 0, sizeof(scratch));
  scratch.prev_row_hashes = e->diff_prev_row_hashes;
  scratch.next_row_hashes = e->diff_next_row_hashes;
  scratch.dirty_rows = e->diff_dirty_rows;
  scratch.row_cap = e->diff_row_cap;
  scratch.prev_hashes_valid = e->diff_prev_hashes_valid;

  zr_result_t rc =
      zr_diff_render_ex(&e->fb_prev, present_fb, &e->caps, &e->term_state, &e->cursor_desired, &e->cfg_runtime.limits,
                        e->damage_rects, e->damage_rect_cap, &scratch, e->cfg_runtime.enable_scroll_optimizations,
                        e->out_buf, e->out_cap, out_len, final_ts, stats);
  if (rc != ZR_OK) {
    return rc;
  }

  if (e->caps.supports_sync_update != 0u) {
    const size_t prefix_len = sizeof(ZR_SYNC_BEGIN) - 1u;
    const size_t suffix_len = sizeof(ZR_SYNC_END) - 1u;
    const size_t overhead = prefix_len + suffix_len;
    if ((*out_len + overhead) <= e->out_cap) {
      memmove(e->out_buf + prefix_len, e->out_buf, *out_len);
      memcpy(e->out_buf, ZR_SYNC_BEGIN, prefix_len);
      memcpy(e->out_buf + prefix_len + *out_len, ZR_SYNC_END, suffix_len);
      *out_len += overhead;
      stats->bytes_emitted = *out_len;
    }
  }

  if (*out_len > (size_t)INT32_MAX) {
    *out_len = 0u;
    memset(final_ts, 0, sizeof(*final_ts));
    memset(stats, 0, sizeof(*stats));
    return ZR_ERR_LIMIT;
  }
  return ZR_OK;
}

static zr_result_t zr_engine_present_write(zr_engine_t* e, size_t out_len) {
  if (!e || !e->plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  return plat_write_output(e->plat, e->out_buf, (int32_t)out_len);
}

static void zr_engine_swap_diff_hashes_on_commit(zr_engine_t* e) {
  if (!e || !e->diff_prev_row_hashes || !e->diff_next_row_hashes || e->diff_row_cap == 0u) {
    if (e) {
      e->diff_prev_hashes_valid = 0u;
    }
    return;
  }

  uint64_t* tmp = e->diff_prev_row_hashes;
  e->diff_prev_row_hashes = e->diff_next_row_hashes;
  e->diff_next_row_hashes = tmp;
  e->diff_prev_hashes_valid = 1u;
}

/* Record a frame debug trace after present commits. */
static void zr_engine_trace_frame(zr_engine_t* e, uint64_t frame_id, size_t out_len, const zr_diff_stats_t* stats) {
  if (!e || !e->debug_trace || !stats) {
    return;
  }
  if (!zr_debug_trace_enabled(e->debug_trace, ZR_DEBUG_CAT_FRAME, ZR_DEBUG_SEV_INFO)) {
    return;
  }

  zr_debug_trace_set_frame(e->debug_trace, frame_id);

  zr_debug_frame_record_t rec;
  memset(&rec, 0, sizeof(rec));
  rec.frame_id = frame_id;
  rec.cols = e->fb_next.cols;
  rec.rows = e->fb_next.rows;
  rec.diff_bytes_emitted = (uint32_t)out_len;
  rec.dirty_lines = stats->dirty_lines;
  rec.dirty_cells = stats->dirty_cells;
  rec.damage_rects = stats->damage_rects;

  (void)zr_debug_trace_frame(e->debug_trace, ZR_DEBUG_CODE_FRAME_PRESENT, zr_engine_now_us(), &rec);
}

static void zr_engine_trace_diff_telemetry(zr_engine_t* e, uint64_t frame_id, const zr_diff_stats_t* stats) {
  if (!e || !e->debug_trace || !stats) {
    return;
  }
  if (!zr_debug_trace_enabled(e->debug_trace, ZR_DEBUG_CAT_PERF, ZR_DEBUG_SEV_INFO)) {
    return;
  }

  zr_diff_telemetry_record_t rec;
  memset(&rec, 0, sizeof(rec));
  rec.frame_id = frame_id;
  rec.sweep_frames_total = e->diff_sweep_frames_total;
  rec.damage_frames_total = e->diff_damage_frames_total;
  rec.scroll_attempts_total = e->diff_scroll_attempts_total;
  rec.scroll_hits_total = e->diff_scroll_hits_total;
  rec.collision_guard_hits_total = e->diff_collision_guard_hits_total;
  rec.path_sweep_used = stats->path_sweep_used;
  rec.path_damage_used = stats->path_damage_used;
  rec.scroll_opt_attempted = stats->scroll_opt_attempted;
  rec.scroll_opt_hit = stats->scroll_opt_hit;
  rec.collision_guard_hits_last = stats->collision_guard_hits;
  rec._pad0 = 0u;

  (void)zr_debug_trace_record(e->debug_trace, ZR_DEBUG_CAT_PERF, ZR_DEBUG_SEV_INFO, ZR_DEBUG_CODE_PERF_DIFF_PATH,
                              zr_engine_now_us(), &rec, (uint32_t)sizeof(rec));
}

static void zr_engine_present_commit(zr_engine_t* e, bool presented_stage, size_t out_len,
                                     const zr_term_state_t* final_ts, const zr_diff_stats_t* stats, uint32_t diff_us,
                                     uint32_t write_us) {
  if (!e || !final_ts || !stats) {
    return;
  }

  const uint64_t frame_id_presented = zr_engine_trace_frame_id(e);

  if (presented_stage) {
    zr_engine_fb_swap(&e->fb_prev, &e->fb_stage);
  } else {
    zr_engine_fb_swap(&e->fb_prev, &e->fb_next);
    /*
      Keep fb_next synchronized with the last committed app frame.

      Why: Incremental drawlists apply against fb_next in engine_submit_drawlist().
      If fb_next is left as the pre-swap "old prev" frame, incremental updates
      are applied on a stale base and can oscillate full-screen output.
    */
    zr_engine_fb_copy(&e->fb_prev, &e->fb_next);
  }
  zr_engine_swap_diff_hashes_on_commit(e);
  e->term_state = *final_ts;

  e->metrics.frame_index++;
  e->metrics.bytes_emitted_total += (uint64_t)out_len;
  e->metrics.bytes_emitted_last_frame = (uint32_t)out_len;
  e->metrics.dirty_lines_last_frame = stats->dirty_lines;
  e->metrics.dirty_cols_last_frame = stats->dirty_cells;
  e->metrics.damage_rects_last_frame = stats->damage_rects;
  e->metrics.damage_cells_last_frame = stats->damage_cells;
  e->metrics.damage_full_frame = stats->damage_full_frame;
  e->metrics.us_diff_last_frame = diff_us;
  e->metrics.us_write_last_frame = write_us;
  e->metrics._pad2[0] = 0u;
  e->metrics._pad2[1] = 0u;
  e->metrics._pad2[2] = 0u;

  e->diff_sweep_frames_total += (uint64_t)stats->path_sweep_used;
  e->diff_damage_frames_total += (uint64_t)stats->path_damage_used;
  e->diff_scroll_attempts_total += (uint64_t)stats->scroll_opt_attempted;
  e->diff_scroll_hits_total += (uint64_t)stats->scroll_opt_hit;
  e->diff_collision_guard_hits_total += (uint64_t)stats->collision_guard_hits;

  /* Update debug trace frame ID and record frame data. */
  if (e->debug_trace) {
    zr_engine_trace_frame(e, frame_id_presented, out_len, stats);
    zr_engine_trace_diff_telemetry(e, frame_id_presented, stats);
    zr_debug_trace_set_frame(e->debug_trace, zr_engine_trace_frame_id(e));
  }
}

/*
  Render and flush the framebuffer diff to the platform backend.

  Why: Enforces the single-flush-per-present contract by calling plat_write_output()
  exactly once on success and never writing on failure.
*/
zr_result_t engine_present(zr_engine_t* e) {
  if (!e || !e->plat) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* Enforced contract: the per-frame arena is reset exactly once per present. */
  zr_arena_reset(&e->arena_frame);

  if (e->cfg_runtime.wait_for_output_drain != 0u) {
    const int32_t timeout_ms = zr_engine_output_wait_timeout_ms(&e->cfg_runtime);
    zr_result_t rc = plat_wait_output_writable(e->plat, timeout_ms);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  size_t out_len = 0u;
  zr_term_state_t final_ts;
  zr_diff_stats_t stats;
  const zr_fb_t* present_fb = NULL;
  bool presented_stage = false;
  uint32_t diff_us = 0u;
  uint32_t write_us = 0u;

  zr_result_t rc = zr_engine_present_pick_fb(e, &present_fb, &presented_stage);
  if (rc != ZR_OK) {
    return rc;
  }

  const uint64_t diff_start_us = zr_engine_now_us();
  rc = zr_engine_present_render(e, present_fb, &out_len, &final_ts, &stats);
  if (rc != ZR_OK) {
    /* Diff scratch may have been used as transient indexed-coalescing storage. */
    e->diff_prev_hashes_valid = 0u;
    return rc;
  }

  {
    const uint64_t diff_end_us = zr_engine_now_us();
    if (diff_end_us >= diff_start_us) {
      const uint64_t delta = diff_end_us - diff_start_us;
      diff_us = (delta > (uint64_t)UINT32_MAX) ? UINT32_MAX : (uint32_t)delta;
    }
  }

  const uint64_t write_start_us = zr_engine_now_us();
  rc = zr_engine_present_write(e, out_len);
  if (rc != ZR_OK) {
    /* Keep reuse conservative when present fails before prev/next commit. */
    e->diff_prev_hashes_valid = 0u;
    return rc;
  }
  {
    const uint64_t write_end_us = zr_engine_now_us();
    if (write_end_us >= write_start_us) {
      const uint64_t delta = write_end_us - write_start_us;
      write_us = (delta > (uint64_t)UINT32_MAX) ? UINT32_MAX : (uint32_t)delta;
    }
  }

  zr_engine_present_commit(e, presented_stage, out_len, &final_ts, &stats, diff_us, write_us);
  return ZR_OK;
}
