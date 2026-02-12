/*
  src/core/zr_engine_poll.inc — engine_poll_events() pipeline helpers.

  Why: Keeps event wait/read/pack sequencing physically separated from drawlist
  and present orchestration to reduce `zr_engine.c` maintenance burden.
*/

static int zr_engine_poll_wait_and_fill(zr_engine_t* e, int timeout_ms) {
  if (!e || !e->plat) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }

  if (zr_event_queue_count(&e->evq) != 0u) {
    return 1;
  }

  const int32_t w = plat_wait(e->plat, (int32_t)timeout_ms);
  if (w < 0) {
    return (int)w;
  }
  const uint32_t time_ms = zr_engine_now_ms_u32();
  if (w == 0) {
    /*
      Resizes must be detectable even when SIGWINCH delivery is disrupted
      (e.g. runtimes that install their own SIGWINCH handlers).

      With timeout_ms==0, plat_wait() may return 0 even if the terminal has
      resized, because there is no wake signal to make poll() ready.

      Fix: always perform a best-effort size check on timeout. This keeps
      non-blocking poll semantics while ensuring resize events are still
      generated and framebuffers resized.
    */
    zr_result_t rc = zr_engine_try_handle_resize(e, time_ms);
    if (rc != ZR_OK) {
      return (int)rc;
    }
    zr_engine_input_flush_pending(e, time_ms);
    return 0;
  }

  zr_result_t rc = zr_engine_try_handle_resize(e, time_ms);
  if (rc != ZR_OK) {
    return (int)rc;
  }
  rc = zr_engine_drain_platform_input(e, time_ms);
  if (rc != ZR_OK) {
    return (int)rc;
  }
  return 1;
}

static int zr_engine_poll_pack(zr_engine_t* e, uint8_t* out_buf, int out_cap) {
  if (!e) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }

  zr_evpack_writer_t w;
  zr_result_t rc = zr_evpack_begin(&w, out_buf, (size_t)out_cap);
  if (rc != ZR_OK) {
    return (int)rc;
  }

  zr_event_t ev;
  while (zr_event_queue_peek(&e->evq, &ev)) {
    /*
      Focus events are gated by runtime config and backend capability.

      Why: Even if raw input contains focus CSI tokens, wrappers that disable
      focus mode (or run on backends that report it unsupported) must not
      observe synthesized focus key events.
    */
    if (ev.type == ZR_EV_KEY) {
      const bool focus_enabled =
          (e->cfg_runtime.plat.enable_focus_events != 0u) && (e->caps.supports_focus_events != 0u);
      if (!focus_enabled && (ev.u.key.key == (uint32_t)ZR_KEY_FOCUS_IN || ev.u.key.key == (uint32_t)ZR_KEY_FOCUS_OUT)) {
        (void)zr_event_queue_pop(&e->evq, &ev);
        continue;
      }
    }

    if (!zr_engine_pack_one_event(&w, &e->evq, &ev)) {
      break;
    }
    (void)zr_event_queue_pop(&e->evq, &ev);
  }

  const size_t bytes_written = zr_evpack_finish(&w);
  e->metrics.events_out_last_poll = w.event_count;
  e->metrics.events_dropped_total = e->evq.dropped_total;

  if (bytes_written > (size_t)INT_MAX) {
    return (int)ZR_ERR_LIMIT;
  }
  return (int)bytes_written;
}

/*
  Poll input/events and pack a batch for the caller.

  Why: Waits only when the internal queue is empty, then emits a packed batch
  with success-mode truncation and no writes on errors.
*/
int engine_poll_events(zr_engine_t* e, int timeout_ms, uint8_t* out_buf, int out_cap) {
  if (!e || !e->plat) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }
  if (timeout_ms < 0) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_cap < 0) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }
  if (out_cap > 0 && !out_buf) {
    return (int)ZR_ERR_INVALID_ARGUMENT;
  }

  uint32_t time_ms = zr_engine_now_ms_u32();

  int wait_ms = timeout_ms;
  if (zr_event_queue_count(&e->evq) == 0u && wait_ms > 0) {
    const uint32_t until_tick_ms = zr_engine_tick_until_due_ms(e, time_ms);
    if (until_tick_ms == 0u) {
      wait_ms = 0;
    } else if (until_tick_ms < (uint32_t)wait_ms) {
      wait_ms = (int)until_tick_ms;
    }
  }

  const int ready = zr_engine_poll_wait_and_fill(e, wait_ms);
  if (ready < 0) {
    return ready;
  }

  time_ms = zr_engine_now_ms_u32();
  zr_engine_maybe_enqueue_tick(e, time_ms);

  if (zr_event_queue_count(&e->evq) == 0u) {
    return 0;
  }
  return zr_engine_poll_pack(e, out_buf, out_cap);
}
