#![allow(dead_code, non_camel_case_types)]

pub(crate) type ZrResultT = i32;

pub(crate) const ZR_OK: ZrResultT = 0;
pub(crate) const ZR_ERR_INVALID_ARGUMENT: ZrResultT = -1;
pub(crate) const ZR_ERR_LIMIT: ZrResultT = -3;
pub(crate) const ZR_ERR_PLATFORM: ZrResultT = -6;

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_limits_t {
    pub(crate) arena_max_total_bytes: u32,
    pub(crate) arena_initial_bytes: u32,
    pub(crate) out_max_bytes_per_frame: u32,
    pub(crate) dl_max_total_bytes: u32,
    pub(crate) dl_max_cmds: u32,
    pub(crate) dl_max_strings: u32,
    pub(crate) dl_max_blobs: u32,
    pub(crate) dl_max_clip_depth: u32,
    pub(crate) dl_max_text_run_segments: u32,
    pub(crate) diff_max_damage_rects: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct plat_config_t {
    pub(crate) requested_color_mode: u8,
    pub(crate) enable_mouse: u8,
    pub(crate) enable_bracketed_paste: u8,
    pub(crate) enable_focus_events: u8,
    pub(crate) enable_osc52: u8,
    pub(crate) _pad: [u8; 3],
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_engine_config_t {
    pub(crate) requested_engine_abi_major: u32,
    pub(crate) requested_engine_abi_minor: u32,
    pub(crate) requested_engine_abi_patch: u32,
    pub(crate) requested_drawlist_version: u32,
    pub(crate) requested_event_batch_version: u32,
    pub(crate) limits: zr_limits_t,
    pub(crate) plat: plat_config_t,
    pub(crate) tab_width: u32,
    pub(crate) width_policy: u32,
    pub(crate) target_fps: u32,
    pub(crate) enable_scroll_optimizations: u8,
    pub(crate) enable_debug_overlay: u8,
    pub(crate) enable_replay_recording: u8,
    pub(crate) wait_for_output_drain: u8,
    pub(crate) cap_force_flags: u32,
    pub(crate) cap_suppress_flags: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_engine_runtime_config_t {
    pub(crate) limits: zr_limits_t,
    pub(crate) plat: plat_config_t,
    pub(crate) tab_width: u32,
    pub(crate) width_policy: u32,
    pub(crate) target_fps: u32,
    pub(crate) enable_scroll_optimizations: u8,
    pub(crate) enable_debug_overlay: u8,
    pub(crate) enable_replay_recording: u8,
    pub(crate) wait_for_output_drain: u8,
    pub(crate) cap_force_flags: u32,
    pub(crate) cap_suppress_flags: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_metrics_t {
    pub(crate) struct_size: u32,
    pub(crate) negotiated_engine_abi_major: u32,
    pub(crate) negotiated_engine_abi_minor: u32,
    pub(crate) negotiated_engine_abi_patch: u32,
    pub(crate) negotiated_drawlist_version: u32,
    pub(crate) negotiated_event_batch_version: u32,
    pub(crate) frame_index: u64,
    pub(crate) fps: u32,
    pub(crate) _pad0: u32,
    pub(crate) bytes_emitted_total: u64,
    pub(crate) bytes_emitted_last_frame: u32,
    pub(crate) _pad1: u32,
    pub(crate) dirty_lines_last_frame: u32,
    pub(crate) dirty_cols_last_frame: u32,
    pub(crate) us_input_last_frame: u32,
    pub(crate) us_drawlist_last_frame: u32,
    pub(crate) us_diff_last_frame: u32,
    pub(crate) us_write_last_frame: u32,
    pub(crate) events_out_last_poll: u32,
    pub(crate) events_dropped_total: u32,
    pub(crate) arena_frame_high_water_bytes: u64,
    pub(crate) arena_persistent_high_water_bytes: u64,
    pub(crate) damage_rects_last_frame: u32,
    pub(crate) damage_cells_last_frame: u32,
    pub(crate) damage_full_frame: u8,
    pub(crate) _pad2: [u8; 3],
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_terminal_caps_t {
    pub(crate) color_mode: u8,
    pub(crate) supports_mouse: u8,
    pub(crate) supports_bracketed_paste: u8,
    pub(crate) supports_focus_events: u8,
    pub(crate) supports_osc52: u8,
    pub(crate) supports_sync_update: u8,
    pub(crate) supports_scroll_region: u8,
    pub(crate) supports_cursor_shape: u8,
    pub(crate) supports_output_wait_writable: u8,
    pub(crate) supports_underline_styles: u8,
    pub(crate) supports_colored_underlines: u8,
    pub(crate) supports_hyperlinks: u8,
    pub(crate) sgr_attrs_supported: u32,
    pub(crate) terminal_id: u32,
    pub(crate) _pad1: [u8; 3],
    pub(crate) cap_flags: u32,
    pub(crate) cap_force_flags: u32,
    pub(crate) cap_suppress_flags: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct plat_caps_t {
    pub(crate) color_mode: u8,
    pub(crate) supports_mouse: u8,
    pub(crate) supports_bracketed_paste: u8,
    pub(crate) supports_focus_events: u8,
    pub(crate) supports_osc52: u8,
    pub(crate) supports_sync_update: u8,
    pub(crate) supports_scroll_region: u8,
    pub(crate) supports_cursor_shape: u8,
    pub(crate) supports_output_wait_writable: u8,
    pub(crate) supports_underline_styles: u8,
    pub(crate) supports_colored_underlines: u8,
    pub(crate) supports_hyperlinks: u8,
    pub(crate) sgr_attrs_supported: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_style_t {
    pub(crate) fg_rgb: u32,
    pub(crate) bg_rgb: u32,
    pub(crate) attrs: u32,
    pub(crate) reserved: u32,
    pub(crate) underline_rgb: u32,
    pub(crate) link_ref: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_cell_t {
    pub(crate) glyph: [u8; 32],
    pub(crate) glyph_len: u8,
    pub(crate) width: u8,
    pub(crate) _pad0: u16,
    pub(crate) style: zr_style_t,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_rect_t {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) w: i32,
    pub(crate) h: i32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_fb_t {
    pub(crate) cols: u32,
    pub(crate) rows: u32,
    pub(crate) cells: *mut zr_cell_t,
    pub(crate) links: *mut zr_fb_link_t,
    pub(crate) links_len: u32,
    pub(crate) links_cap: u32,
    pub(crate) link_bytes: *mut u8,
    pub(crate) link_bytes_len: u32,
    pub(crate) link_bytes_cap: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_fb_link_t {
    pub(crate) uri_off: u32,
    pub(crate) uri_len: u32,
    pub(crate) id_off: u32,
    pub(crate) id_len: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_fb_painter_t {
    pub(crate) fb: *mut zr_fb_t,
    pub(crate) clip_stack: *mut zr_rect_t,
    pub(crate) clip_cap: u32,
    pub(crate) clip_len: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_cursor_state_t {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) shape: u8,
    pub(crate) visible: u8,
    pub(crate) blink: u8,
    pub(crate) reserved0: u8,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_term_state_t {
    pub(crate) cursor_x: u32,
    pub(crate) cursor_y: u32,
    pub(crate) cursor_visible: u8,
    pub(crate) cursor_shape: u8,
    pub(crate) cursor_blink: u8,
    pub(crate) flags: u8,
    pub(crate) style: zr_style_t,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_diff_stats_t {
    pub(crate) dirty_lines: u32,
    pub(crate) dirty_cells: u32,
    pub(crate) damage_rects: u32,
    pub(crate) damage_cells: u32,
    pub(crate) damage_full_frame: u8,
    pub(crate) path_sweep_used: u8,
    pub(crate) path_damage_used: u8,
    pub(crate) scroll_opt_attempted: u8,
    pub(crate) scroll_opt_hit: u8,
    pub(crate) collision_guard_hits: u32,
    pub(crate) _pad0: u32,
    pub(crate) bytes_emitted: usize,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_damage_rect_t {
    pub(crate) x0: u32,
    pub(crate) y0: u32,
    pub(crate) x1: u32,
    pub(crate) y1: u32,
}

#[repr(C)]
pub(crate) struct zr_engine_t {
    _private: [u8; 0],
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_debug_config_t {
    pub(crate) enabled: u32,
    pub(crate) ring_capacity: u32,
    pub(crate) min_severity: u32,
    pub(crate) category_mask: u32,
    pub(crate) capture_raw_events: u32,
    pub(crate) capture_drawlist_bytes: u32,
    pub(crate) _pad0: u32,
    pub(crate) _pad1: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_debug_query_t {
    pub(crate) min_record_id: u64,
    pub(crate) max_record_id: u64,
    pub(crate) min_frame_id: u64,
    pub(crate) max_frame_id: u64,
    pub(crate) category_mask: u32,
    pub(crate) min_severity: u32,
    pub(crate) max_records: u32,
    pub(crate) _pad0: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_debug_record_header_t {
    pub(crate) record_id: u64,
    pub(crate) timestamp_us: u64,
    pub(crate) frame_id: u64,
    pub(crate) category: u32,
    pub(crate) severity: u32,
    pub(crate) code: u32,
    pub(crate) payload_size: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_debug_query_result_t {
    pub(crate) records_returned: u32,
    pub(crate) records_available: u32,
    pub(crate) oldest_record_id: u64,
    pub(crate) newest_record_id: u64,
    pub(crate) records_dropped: u32,
    pub(crate) _pad0: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub(crate) struct zr_debug_stats_t {
    pub(crate) total_records: u64,
    pub(crate) total_dropped: u64,
    pub(crate) error_count: u32,
    pub(crate) warn_count: u32,
    pub(crate) current_ring_usage: u32,
    pub(crate) ring_capacity: u32,
}

unsafe extern "C" {
    pub(crate) fn zr_engine_config_default() -> zr_engine_config_t;
    pub(crate) fn zr_fb_init(fb: *mut zr_fb_t, cols: u32, rows: u32) -> ZrResultT;
    pub(crate) fn zr_fb_release(fb: *mut zr_fb_t);
    pub(crate) fn zr_fb_cell(fb: *mut zr_fb_t, x: u32, y: u32) -> *mut zr_cell_t;
    pub(crate) fn zr_fb_clear(fb: *mut zr_fb_t, style: *const zr_style_t) -> ZrResultT;
    pub(crate) fn zr_fb_links_clone_from(dst: *mut zr_fb_t, src: *const zr_fb_t) -> ZrResultT;
    pub(crate) fn zr_fb_link_intern(
        fb: *mut zr_fb_t,
        uri: *const u8,
        uri_len: usize,
        id: *const u8,
        id_len: usize,
        out_link_ref: *mut u32,
    ) -> ZrResultT;
    pub(crate) fn zr_fb_link_lookup(
        fb: *const zr_fb_t,
        link_ref: u32,
        out_uri: *mut *const u8,
        out_uri_len: *mut usize,
        out_id: *mut *const u8,
        out_id_len: *mut usize,
    ) -> ZrResultT;
    pub(crate) fn zr_fb_painter_begin(
        p: *mut zr_fb_painter_t,
        fb: *mut zr_fb_t,
        clip_stack: *mut zr_rect_t,
        clip_cap: u32,
    ) -> ZrResultT;
    pub(crate) fn zr_fb_clip_push(p: *mut zr_fb_painter_t, clip: zr_rect_t) -> ZrResultT;
    pub(crate) fn zr_fb_clip_pop(p: *mut zr_fb_painter_t) -> ZrResultT;
    pub(crate) fn zr_fb_put_grapheme(
        p: *mut zr_fb_painter_t,
        x: i32,
        y: i32,
        bytes: *const u8,
        len: usize,
        width: u8,
        style: *const zr_style_t,
    ) -> ZrResultT;
    pub(crate) fn zr_diff_render(
        prev: *const zr_fb_t,
        next: *const zr_fb_t,
        caps: *const plat_caps_t,
        initial_term_state: *const zr_term_state_t,
        desired_cursor_state: *const zr_cursor_state_t,
        lim: *const zr_limits_t,
        scratch_damage_rects: *mut zr_damage_rect_t,
        scratch_damage_rect_cap: u32,
        enable_scroll_optimizations: u8,
        out_buf: *mut u8,
        out_cap: usize,
        out_len: *mut usize,
        out_final_term_state: *mut zr_term_state_t,
        out_stats: *mut zr_diff_stats_t,
    ) -> ZrResultT;

    pub(crate) fn engine_create(
        out_engine: *mut *mut zr_engine_t,
        cfg: *const zr_engine_config_t,
    ) -> ZrResultT;
    pub(crate) fn engine_destroy(e: *mut zr_engine_t);

    pub(crate) fn engine_poll_events(
        e: *mut zr_engine_t,
        timeout_ms: i32,
        out_buf: *mut u8,
        out_cap: i32,
    ) -> i32;
    pub(crate) fn engine_post_user_event(
        e: *mut zr_engine_t,
        tag: u32,
        payload: *const u8,
        payload_len: i32,
    ) -> ZrResultT;

    pub(crate) fn engine_submit_drawlist(
        e: *mut zr_engine_t,
        bytes: *const u8,
        bytes_len: i32,
    ) -> ZrResultT;
    pub(crate) fn engine_present(e: *mut zr_engine_t) -> ZrResultT;

    pub(crate) fn engine_get_metrics(
        e: *mut zr_engine_t,
        out_metrics: *mut zr_metrics_t,
    ) -> ZrResultT;
    pub(crate) fn engine_get_caps(
        e: *mut zr_engine_t,
        out_caps: *mut zr_terminal_caps_t,
    ) -> ZrResultT;
    pub(crate) fn engine_set_config(
        e: *mut zr_engine_t,
        cfg: *const zr_engine_runtime_config_t,
    ) -> ZrResultT;

    pub(crate) fn engine_debug_enable(
        e: *mut zr_engine_t,
        config: *const zr_debug_config_t,
    ) -> ZrResultT;
    pub(crate) fn engine_debug_disable(e: *mut zr_engine_t);
    pub(crate) fn engine_debug_query(
        e: *mut zr_engine_t,
        query: *const zr_debug_query_t,
        out_headers: *mut zr_debug_record_header_t,
        out_headers_cap: u32,
        out_result: *mut zr_debug_query_result_t,
    ) -> ZrResultT;
    pub(crate) fn engine_debug_get_payload(
        e: *mut zr_engine_t,
        record_id: u64,
        out_payload: *mut u8,
        out_cap: u32,
        out_size: *mut u32,
    ) -> ZrResultT;
    pub(crate) fn engine_debug_get_stats(
        e: *mut zr_engine_t,
        out_stats: *mut zr_debug_stats_t,
    ) -> ZrResultT;
    pub(crate) fn engine_debug_export(e: *mut zr_engine_t, out_buf: *mut u8, out_cap: usize)
        -> i32;
    pub(crate) fn engine_debug_reset(e: *mut zr_engine_t);
}
