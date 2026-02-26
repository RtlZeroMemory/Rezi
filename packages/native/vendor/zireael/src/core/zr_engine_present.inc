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

  zr_result_t rc = zr_engine_fb_copy(&e->fb_next, &e->fb_stage);
  if (rc != ZR_OK) {
    return rc;
  }
  rc = zr_debug_overlay_render(&e->fb_stage, &e->metrics);
  if (rc != ZR_OK) {
    return rc;
  }

  *out_present_fb = &e->fb_stage;
  *out_presented_stage = true;
  return ZR_OK;
}

static zr_result_t zr_engine_present_append_images(zr_engine_t* e, size_t* inout_out_len,
                                                   zr_image_state_t* inout_image_state_stage) {
  zr_sb_t sb;
  zr_image_emit_ctx_t image_ctx;
  zr_result_t rc = ZR_OK;

  if (!e || !inout_out_len || !inout_image_state_stage) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (*inout_out_len > e->out_cap) {
    return ZR_ERR_LIMIT;
  }

  zr_sb_init(&sb, e->out_buf, e->out_cap);
  /* Continue appending into the already-rendered diff payload. */
  sb.len = *inout_out_len;

  memset(&image_ctx, 0, sizeof(image_ctx));
  image_ctx.frame = &e->image_frame_next;
  image_ctx.profile = &e->term_profile;
  image_ctx.opts.cell_width_px = e->term_profile.cell_width_px;
  image_ctx.opts.cell_height_px = e->term_profile.cell_height_px;
  image_ctx.arena = &e->arena_frame;
  image_ctx.state = inout_image_state_stage;
  image_ctx.out = &sb;

  rc = zr_image_emit_frame(&image_ctx);
  if (rc != ZR_OK) {
    return rc;
  }
  if (zr_sb_truncated(&sb)) {
    return ZR_ERR_LIMIT;
  }

  *inout_out_len = zr_sb_len(&sb);
  return ZR_OK;
}

static size_t zr_engine_present_u32_dec_len(uint32_t v) {
  size_t len = 1u;
  while (v >= 10u) {
    v /= 10u;
    len++;
  }
  return len;
}

static void zr_engine_present_write_u32_dec(uint8_t* dst, size_t len, uint32_t v) {
  if (!dst || len == 0u) {
    return;
  }
  size_t i = len;
  while (i != 0u) {
    i--;
    dst[i] = (uint8_t)((uint32_t)'0' + (v % 10u));
    v /= 10u;
  }
}

/*
  Re-anchor cursor after image sideband emission.

  Why: Image protocol bytes can move the terminal cursor. Re-emitting the
  diff's final cursor position keeps present deterministic for the next frame.
*/
static zr_result_t zr_engine_present_append_cursor_restore(zr_engine_t* e, size_t* inout_out_len,
                                                           const zr_term_state_t* final_ts) {
  enum {
    /* ESC '[' + ';' + 'H' around decimal row/col parameters. */
    ZR_CUP_FIXED_BYTES = 4u,
  };

  uint32_t row_1based = 0u;
  uint32_t col_1based = 0u;
  size_t row_digits = 0u;
  size_t col_digits = 0u;
  size_t cup_len = 0u;
  size_t next_len = 0u;
  size_t at = 0u;

  if (!e || !inout_out_len || !final_ts) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  if (*inout_out_len > e->out_cap) {
    return ZR_ERR_LIMIT;
  }
  if ((final_ts->flags & ZR_TERM_STATE_CURSOR_POS_VALID) == 0u) {
    return ZR_OK;
  }
  /* CUP is 1-based in VT/ANSI, while framebuffer coordinates are 0-based. */
  if (!zr_checked_add_u32(final_ts->cursor_y, 1u, &row_1based) ||
      !zr_checked_add_u32(final_ts->cursor_x, 1u, &col_1based)) {
    return ZR_ERR_LIMIT;
  }

  row_digits = zr_engine_present_u32_dec_len(row_1based);
  col_digits = zr_engine_present_u32_dec_len(col_1based);
  if (!zr_checked_add_size(row_digits, col_digits, &cup_len) ||
      !zr_checked_add_size(cup_len, (size_t)ZR_CUP_FIXED_BYTES, &cup_len) ||
      !zr_checked_add_size(*inout_out_len, cup_len, &next_len) || next_len > e->out_cap) {
    return ZR_ERR_LIMIT;
  }

  at = *inout_out_len;
  e->out_buf[at++] = (uint8_t)0x1Bu;
  e->out_buf[at++] = (uint8_t)'[';
  zr_engine_present_write_u32_dec(e->out_buf + at, row_digits, row_1based);
  at += row_digits;
  e->out_buf[at++] = (uint8_t)';';
  zr_engine_present_write_u32_dec(e->out_buf + at, col_digits, col_1based);
  at += col_digits;
  e->out_buf[at++] = (uint8_t)'H';

  *inout_out_len = at;
  return ZR_OK;
}

static void zr_engine_present_wrap_sync(zr_engine_t* e, size_t* inout_out_len, zr_diff_stats_t* stats) {
  if (!e || !inout_out_len || !stats) {
    return;
  }
  if (e->caps.supports_sync_update != 0u) {
    /* Wrap output in DEC synchronized-update delimiters (CSI ? 2026 h/l). */
    const size_t prefix_len = sizeof(ZR_SYNC_BEGIN) - 1u;
    const size_t suffix_len = sizeof(ZR_SYNC_END) - 1u;
    const size_t overhead = prefix_len + suffix_len;
    if ((*inout_out_len + overhead) <= e->out_cap) {
      memmove(e->out_buf + prefix_len, e->out_buf, *inout_out_len);
      memcpy(e->out_buf, ZR_SYNC_BEGIN, prefix_len);
      memcpy(e->out_buf + prefix_len + *inout_out_len, ZR_SYNC_END, suffix_len);
      *inout_out_len += overhead;
    }
  }
  stats->bytes_emitted = *inout_out_len;
}

static zr_result_t zr_engine_present_render(zr_engine_t* e, const zr_fb_t* present_fb, size_t* out_len,
                                            zr_term_state_t* final_ts, zr_diff_stats_t* stats,
                                            zr_image_state_t* out_image_state_stage) {
  /* --- Validate inputs --- */
  if (!e || !present_fb || !out_len || !final_ts || !stats || !out_image_state_stage) {
    return ZR_ERR_INVALID_ARGUMENT;
  }

  /* --- Configure diff scratch buffers --- */
  zr_diff_scratch_t scratch;
  memset(&scratch, 0, sizeof(scratch));
  scratch.prev_row_hashes = e->diff_prev_row_hashes;
  scratch.next_row_hashes = e->diff_next_row_hashes;
  scratch.dirty_rows = e->diff_dirty_rows;
  scratch.row_cap = e->diff_row_cap;
  scratch.prev_hashes_valid = e->diff_prev_hashes_valid;

  /* --- Render framebuffer diff into out_buf --- */
  zr_result_t rc =
      zr_diff_render_ex(&e->fb_prev, present_fb, &e->caps, &e->term_state, &e->cursor_desired, &e->cfg_runtime.limits,
                        e->damage_rects, e->damage_rect_cap, &scratch, e->cfg_runtime.enable_scroll_optimizations,
                        e->out_buf, e->out_cap, out_len, final_ts, stats);
  if (rc != ZR_OK) {
    return rc;
  }

  /* --- Append optional image sideband bytes --- */
  *out_image_state_stage = e->image_state;
  const size_t out_len_before_images = *out_len;
  rc = zr_engine_present_append_images(e, out_len, out_image_state_stage);
  if (rc != ZR_OK) {
    return rc;
  }
  if (*out_len != out_len_before_images) {
    rc = zr_engine_present_append_cursor_restore(e, out_len, final_ts);
    if (rc != ZR_OK) {
      return rc;
    }
  }

  /* --- Optionally wrap in synchronized-update delimiters --- */
  zr_engine_present_wrap_sync(e, out_len, stats);

  /* --- Final safety clamp for plat_write_output(int32_t) --- */
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
                                     const zr_term_state_t* final_ts, const zr_diff_stats_t* stats,
                                     const zr_image_state_t* image_state_stage, uint32_t diff_us, uint32_t write_us) {
  if (!e || !final_ts || !stats || !image_state_stage) {
    return;
  }

  const uint64_t frame_id_presented = zr_engine_trace_frame_id(e);
  const zr_fb_t* presented_fb = presented_stage ? &e->fb_stage : &e->fb_next;
  const bool use_damage_rect_copy =
      (stats->path_damage_used != 0u) && (stats->damage_full_frame == 0u) && (stats->damage_rects <= e->damage_rect_cap);

  /*
    Resync fb_prev to the framebuffer that was actually presented.

    Why: Keep fb_next as the mutable next-frame target and avoid full-frame
    clones in steady-state by copying only damage rects when possible.
  */
  if (!e->fb_prev.cells || !presented_fb->cells || e->fb_prev.cols != presented_fb->cols ||
      e->fb_prev.rows != presented_fb->rows) {
    e->diff_prev_hashes_valid = 0u;
  } else {
    if (!use_damage_rect_copy) {
      const size_t n = zr_engine_cells_bytes(presented_fb);
      if (n != 0u) {
        memcpy(e->fb_prev.cells, presented_fb->cells, n);
      }
    } else {
      const zr_result_t rc =
          zr_fb_copy_damage_rects(&e->fb_prev, presented_fb, e->damage_rects, stats->damage_rects);
      if (rc != ZR_OK) {
        const size_t n = zr_engine_cells_bytes(presented_fb);
        if (n != 0u) {
          memcpy(e->fb_prev.cells, presented_fb->cells, n);
        }
        e->diff_prev_hashes_valid = 0u;
      }
    }

    zr_fb_links_reset(&e->fb_prev);
    if (zr_fb_links_clone_from(&e->fb_prev, presented_fb) != ZR_OK) {
      e->diff_prev_hashes_valid = 0u;
    }
  }

  zr_engine_swap_diff_hashes_on_commit(e);
  e->term_state = *final_ts;
  e->image_state = *image_state_stage;

  /* --- Update public metrics snapshot --- */
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

  /* --- Update cumulative diff telemetry --- */
  e->diff_sweep_frames_total += (uint64_t)stats->path_sweep_used;
  e->diff_damage_frames_total += (uint64_t)stats->path_damage_used;
  e->diff_scroll_attempts_total += (uint64_t)stats->scroll_opt_attempted;
  e->diff_scroll_hits_total += (uint64_t)stats->scroll_opt_hit;
  e->diff_collision_guard_hits_total += (uint64_t)stats->collision_guard_hits;

  /* --- Emit debug trace records --- */
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
  zr_image_state_t image_state_stage;
  const zr_fb_t* present_fb = NULL;
  bool presented_stage = false;
  uint32_t diff_us = 0u;
  uint32_t write_us = 0u;

  zr_result_t rc = zr_engine_present_pick_fb(e, &present_fb, &presented_stage);
  if (rc != ZR_OK) {
    return rc;
  }

  const uint64_t diff_start_us = zr_engine_now_us();
  rc = zr_engine_present_render(e, present_fb, &out_len, &final_ts, &stats, &image_state_stage);
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

  zr_engine_present_commit(e, presented_stage, out_len, &final_ts, &stats, &image_state_stage, diff_us, write_us);
  return ZR_OK;
}
