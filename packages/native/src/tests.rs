use crate::debug::parse_debug_query_bigint_u64;
use crate::ffi;

const ATTR_BOLD: u32 = 1 << 0;
const ATTR_UNDERLINE: u32 = 1 << 2;
const ATTR_DIM: u32 = 1 << 4;

fn contains_subsequence(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn style_with_attrs(attrs: u32) -> ffi::zr_style_t {
    ffi::zr_style_t {
        fg_rgb: 0,
        bg_rgb: 0,
        attrs,
        reserved: 0,
        underline_rgb: 0,
        link_ref: 0,
    }
}

fn style_plain() -> ffi::zr_style_t {
    ffi::zr_style_t {
        fg_rgb: 0,
        bg_rgb: 0,
        attrs: 0,
        reserved: 0,
        underline_rgb: 0,
        link_ref: 0,
    }
}

struct SingleCellFramebuffer {
    raw: ffi::zr_fb_t,
}

impl SingleCellFramebuffer {
    fn with_attrs(attrs: u32) -> Self {
        let mut raw = ffi::zr_fb_t {
            cols: 0,
            rows: 0,
            cells: std::ptr::null_mut(),
            links: std::ptr::null_mut(),
            links_len: 0,
            links_cap: 0,
            link_bytes: std::ptr::null_mut(),
            link_bytes_len: 0,
            link_bytes_cap: 0,
        };

        let rc = unsafe { ffi::zr_fb_init(&mut raw as *mut _, 1, 1) };
        assert_eq!(
            rc,
            ffi::ZR_OK,
            "zr_fb_init must succeed for test framebuffer"
        );

        let cell = unsafe { ffi::zr_fb_cell(&mut raw as *mut _, 0, 0) };
        assert!(
            !cell.is_null(),
            "zr_fb_cell(0,0) must return a valid pointer"
        );
        unsafe {
            (*cell).glyph = [0; 32];
            (*cell).glyph[0] = b'X';
            (*cell).glyph_len = 1;
            (*cell).width = 1;
            (*cell)._pad0 = 0;
            (*cell).style = style_with_attrs(attrs);
        }

        Self { raw }
    }
}

impl Drop for SingleCellFramebuffer {
    fn drop(&mut self) {
        unsafe { ffi::zr_fb_release(&mut self.raw as *mut _) };
    }
}

struct TestFramebuffer {
    raw: ffi::zr_fb_t,
}

impl TestFramebuffer {
    fn new(cols: u32, rows: u32) -> Self {
        let mut raw = ffi::zr_fb_t {
            cols: 0,
            rows: 0,
            cells: std::ptr::null_mut(),
            links: std::ptr::null_mut(),
            links_len: 0,
            links_cap: 0,
            link_bytes: std::ptr::null_mut(),
            link_bytes_len: 0,
            link_bytes_cap: 0,
        };
        let rc = unsafe { ffi::zr_fb_init(&mut raw as *mut _, cols, rows) };
        assert_eq!(
            rc,
            ffi::ZR_OK,
            "zr_fb_init must succeed for test framebuffer"
        );
        let rc_clear = unsafe { ffi::zr_fb_clear(&mut raw as *mut _, &style_plain() as *const _) };
        assert_eq!(
            rc_clear,
            ffi::ZR_OK,
            "zr_fb_clear must succeed for test framebuffer"
        );
        Self { raw }
    }

    fn set_cell(&mut self, x: u32, y: u32, glyph: &[u8], width: u8, style: ffi::zr_style_t) {
        assert!(
            glyph.len() <= 32,
            "glyph length must fit ZR_CELL_GLYPH_MAX (got {})",
            glyph.len()
        );
        let cell = unsafe { ffi::zr_fb_cell(&mut self.raw as *mut _, x, y) };
        assert!(
            !cell.is_null(),
            "zr_fb_cell({x},{y}) must return a valid pointer"
        );
        unsafe {
            (*cell).glyph = [0; 32];
            for (i, byte) in glyph.iter().copied().enumerate() {
                (*cell).glyph[i] = byte;
            }
            (*cell).glyph_len = glyph.len() as u8;
            (*cell).width = width;
            (*cell)._pad0 = 0;
            (*cell).style = style;
        }
    }

    fn set_cell_link_ref(&mut self, x: u32, y: u32, link_ref: u32) {
        let cell = unsafe { ffi::zr_fb_cell(&mut self.raw as *mut _, x, y) };
        assert!(
            !cell.is_null(),
            "zr_fb_cell({x},{y}) must return a valid pointer"
        );
        unsafe {
            (*cell).style.link_ref = link_ref;
        }
    }

    fn cell_link_ref(&mut self, x: u32, y: u32) -> u32 {
        let cell = unsafe { ffi::zr_fb_cell(&mut self.raw as *mut _, x, y) };
        assert!(
            !cell.is_null(),
            "zr_fb_cell({x},{y}) must return a valid pointer"
        );
        unsafe { (*cell).style.link_ref }
    }
}

impl Drop for TestFramebuffer {
    fn drop(&mut self) {
        unsafe { ffi::zr_fb_release(&mut self.raw as *mut _) };
    }
}

fn render_diff_bytes(
    prev: &ffi::zr_fb_t,
    next: &ffi::zr_fb_t,
    initial_style: ffi::zr_style_t,
) -> Vec<u8> {
    let caps = ffi::plat_caps_t {
        color_mode: 3,
        supports_mouse: 0,
        supports_bracketed_paste: 0,
        supports_focus_events: 0,
        supports_osc52: 0,
        supports_sync_update: 0,
        supports_scroll_region: 0,
        supports_cursor_shape: 1,
        supports_output_wait_writable: 0,
        supports_underline_styles: 0,
        supports_colored_underlines: 0,
        supports_hyperlinks: 0,
        sgr_attrs_supported: u32::MAX,
    };
    let limits = unsafe { ffi::zr_engine_config_default() }.limits;
    let initial_term_state = ffi::zr_term_state_t {
        cursor_x: 0,
        cursor_y: 0,
        cursor_visible: 1,
        cursor_shape: 0,
        cursor_blink: 0,
        flags: 0,
        style: initial_style,
    };
    let desired_cursor_state = ffi::zr_cursor_state_t {
        x: -1,
        y: -1,
        shape: 0,
        visible: 1,
        blink: 0,
        reserved0: 0,
    };

    let mut scratch_damage_rects = vec![
        ffi::zr_damage_rect_t {
            x0: 0,
            y0: 0,
            x1: 0,
            y1: 0,
        };
        limits.diff_max_damage_rects as usize
    ];
    let mut out = [0u8; 1024];
    let mut out_len = 0usize;
    let mut out_final_term_state: ffi::zr_term_state_t = unsafe { std::mem::zeroed() };
    let mut out_stats: ffi::zr_diff_stats_t = unsafe { std::mem::zeroed() };

    let rc = unsafe {
        ffi::zr_diff_render(
            prev as *const _,
            next as *const _,
            &caps as *const _,
            &initial_term_state as *const _,
            &desired_cursor_state as *const _,
            &limits as *const _,
            scratch_damage_rects.as_mut_ptr(),
            scratch_damage_rects.len() as u32,
            0,
            out.as_mut_ptr(),
            out.len(),
            &mut out_len as *mut _,
            &mut out_final_term_state as *mut _,
            &mut out_stats as *mut _,
        )
    };
    assert_eq!(rc, ffi::ZR_OK, "zr_diff_render must succeed");
    assert!(out_len > 0, "zr_diff_render must emit output");
    out[..out_len].to_vec()
}

fn render_style_transition(current_attrs: u32, desired_attrs: u32) -> Vec<u8> {
    let prev = SingleCellFramebuffer::with_attrs(current_attrs);
    let next = SingleCellFramebuffer::with_attrs(desired_attrs);
    render_diff_bytes(&prev.raw, &next.raw, style_with_attrs(current_attrs))
}

fn cell_snapshot(fb: &mut ffi::zr_fb_t, x: u32, y: u32) -> (u8, u8) {
    let cell = unsafe { ffi::zr_fb_cell(fb as *mut _, x, y) };
    assert!(!cell.is_null(), "cell must exist at ({x},{y})");
    unsafe { ((*cell).glyph[0], (*cell).width) }
}

#[test]
fn fb_links_clone_from_failure_has_no_partial_effects() {
    let mut dst = TestFramebuffer::new(2, 1);
    let uri = b"https://example.test/rezi";
    let mut link_ref = 0u32;
    let intern_rc = unsafe {
        ffi::zr_fb_link_intern(
            &mut dst.raw as *mut _,
            uri.as_ptr(),
            uri.len(),
            std::ptr::null(),
            0,
            &mut link_ref as *mut _,
        )
    };
    assert_eq!(
        intern_rc,
        ffi::ZR_OK,
        "zr_fb_link_intern must seed destination link state"
    );
    assert_eq!(link_ref, 1u32);

    let before_links_ptr = dst.raw.links;
    let before_links_len = dst.raw.links_len;
    let before_links_cap = dst.raw.links_cap;
    let before_link_bytes_ptr = dst.raw.link_bytes;
    let before_link_bytes_len = dst.raw.link_bytes_len;
    let before_link_bytes_cap = dst.raw.link_bytes_cap;
    assert!(
        !before_links_ptr.is_null(),
        "seeded links pointer must be non-null"
    );
    assert!(
        !before_link_bytes_ptr.is_null(),
        "seeded link-bytes pointer must be non-null"
    );

    let before_first_link = unsafe { *before_links_ptr };
    let before_link_bytes = unsafe {
        std::slice::from_raw_parts(before_link_bytes_ptr, before_link_bytes_len as usize).to_vec()
    };

    let invalid_src = ffi::zr_fb_t {
        cols: dst.raw.cols,
        rows: dst.raw.rows,
        cells: dst.raw.cells,
        links: std::ptr::null_mut(),
        links_len: 1,
        links_cap: 0,
        link_bytes: std::ptr::null_mut(),
        link_bytes_len: before_link_bytes_len,
        link_bytes_cap: 0,
    };
    let clone_rc =
        unsafe { ffi::zr_fb_links_clone_from(&mut dst.raw as *mut _, &invalid_src as *const _) };
    assert_eq!(clone_rc, ffi::ZR_ERR_INVALID_ARGUMENT);

    assert_eq!(dst.raw.links, before_links_ptr);
    assert_eq!(dst.raw.links_len, before_links_len);
    assert_eq!(dst.raw.links_cap, before_links_cap);
    assert_eq!(dst.raw.link_bytes, before_link_bytes_ptr);
    assert_eq!(dst.raw.link_bytes_len, before_link_bytes_len);
    assert_eq!(dst.raw.link_bytes_cap, before_link_bytes_cap);

    let after_first_link = unsafe { *dst.raw.links };
    assert_eq!(after_first_link.uri_off, before_first_link.uri_off);
    assert_eq!(after_first_link.uri_len, before_first_link.uri_len);
    assert_eq!(after_first_link.id_off, before_first_link.id_off);
    assert_eq!(after_first_link.id_len, before_first_link.id_len);

    let after_link_bytes =
        unsafe { std::slice::from_raw_parts(dst.raw.link_bytes, dst.raw.link_bytes_len as usize) };
    assert_eq!(after_link_bytes, before_link_bytes.as_slice());
}

#[test]
fn fb_link_intern_compacts_stale_refs_and_bounds_growth() {
    const LINK_ENTRY_MAX_BYTES: u32 = 2083 + 2083;
    let mut fb = TestFramebuffer::new(2, 1);
    let persistent_uri = b"https://example.test/persistent";

    let mut persistent_ref = 0u32;
    let seed_rc = unsafe {
        ffi::zr_fb_link_intern(
            &mut fb.raw as *mut _,
            persistent_uri.as_ptr(),
            persistent_uri.len(),
            std::ptr::null(),
            0,
            &mut persistent_ref as *mut _,
        )
    };
    assert_eq!(seed_rc, ffi::ZR_OK);
    assert_ne!(persistent_ref, 0);
    fb.set_cell_link_ref(0, 0, persistent_ref);

    let mut peak_links_len = fb.raw.links_len;
    let mut peak_link_bytes_len = fb.raw.link_bytes_len;

    for i in 0..64u32 {
        let uri = format!("https://example.test/ephemeral/{i}");
        let mut ref_i = 0u32;
        let rc = unsafe {
            ffi::zr_fb_link_intern(
                &mut fb.raw as *mut _,
                uri.as_ptr(),
                uri.len(),
                std::ptr::null(),
                0,
                &mut ref_i as *mut _,
            )
        };
        assert_eq!(rc, ffi::ZR_OK, "zr_fb_link_intern failed at iteration {i}");
        assert!(ref_i >= 1 && ref_i <= fb.raw.links_len);

        fb.set_cell_link_ref(1, 0, ref_i);

        let live_ref0 = fb.cell_link_ref(0, 0);
        let live_ref1 = fb.cell_link_ref(1, 0);
        assert!(
            live_ref0 >= 1 && live_ref0 <= fb.raw.links_len,
            "cell(0,0) link_ref must remain valid"
        );
        assert!(
            live_ref1 >= 1 && live_ref1 <= fb.raw.links_len,
            "cell(1,0) link_ref must remain valid"
        );

        peak_links_len = peak_links_len.max(fb.raw.links_len);
        peak_link_bytes_len = peak_link_bytes_len.max(fb.raw.link_bytes_len);
    }

    assert!(
        peak_links_len <= 5,
        "link table must stay bounded for 2-cell framebuffer (peak={peak_links_len})",
    );
    assert!(
        peak_link_bytes_len <= 5 * LINK_ENTRY_MAX_BYTES,
        "link byte arena must stay bounded for 2-cell framebuffer (peak={peak_link_bytes_len})",
    );

    let mut uri_ptr: *const u8 = std::ptr::null();
    let mut uri_len: usize = 0;
    let mut id_ptr: *const u8 = std::ptr::null();
    let mut id_len: usize = 0;
    let persistent_cell_ref = fb.cell_link_ref(0, 0);
    let lookup_rc = unsafe {
        ffi::zr_fb_link_lookup(
            &fb.raw as *const _,
            persistent_cell_ref,
            &mut uri_ptr as *mut _,
            &mut uri_len as *mut _,
            &mut id_ptr as *mut _,
            &mut id_len as *mut _,
        )
    };
    assert_eq!(lookup_rc, ffi::ZR_OK);
    assert_eq!(id_len, 0);
    assert!(id_ptr.is_null());
    assert!(!uri_ptr.is_null());

    let resolved_uri = unsafe { std::slice::from_raw_parts(uri_ptr, uri_len) };
    assert_eq!(resolved_uri, persistent_uri);
}

#[test]
fn ffi_layout_matches_vendored_headers() {
    use std::mem::{align_of, size_of};
    use std::ptr::addr_of;

    assert_eq!(size_of::<ffi::zr_style_t>(), 24);
    assert_eq!(align_of::<ffi::zr_style_t>(), 4);
    assert_eq!(size_of::<ffi::zr_cell_t>(), 60);
    assert_eq!(size_of::<ffi::zr_term_state_t>(), 36);
    assert_eq!(size_of::<ffi::plat_caps_t>(), 16);
    assert_eq!(align_of::<ffi::plat_caps_t>(), 4);

    let caps = std::mem::MaybeUninit::<ffi::plat_caps_t>::uninit();
    let base = caps.as_ptr();
    unsafe {
        assert_eq!(addr_of!((*base).color_mode) as usize - base as usize, 0);
        assert_eq!(
            addr_of!((*base).supports_output_wait_writable) as usize - base as usize,
            8
        );
        assert_eq!(
            addr_of!((*base).supports_underline_styles) as usize - base as usize,
            9
        );
        assert_eq!(
            addr_of!((*base).supports_colored_underlines) as usize - base as usize,
            10
        );
        assert_eq!(
            addr_of!((*base).supports_hyperlinks) as usize - base as usize,
            11
        );
        assert_eq!(
            addr_of!((*base).sgr_attrs_supported) as usize - base as usize,
            12
        );
    }

    if cfg!(target_pointer_width = "64") {
        assert_eq!(size_of::<ffi::zr_fb_t>(), 48);
        assert_eq!(align_of::<ffi::zr_fb_t>(), 8);
    } else if cfg!(target_pointer_width = "32") {
        assert_eq!(size_of::<ffi::zr_fb_t>(), 36);
        assert_eq!(align_of::<ffi::zr_fb_t>(), 4);
    }
}

#[test]
fn clip_edge_write_over_continuation_cleans_lead_pair() {
    let mut fb = ffi::zr_fb_t {
        cols: 0,
        rows: 0,
        cells: std::ptr::null_mut(),
        links: std::ptr::null_mut(),
        links_len: 0,
        links_cap: 0,
        link_bytes: std::ptr::null_mut(),
        link_bytes_len: 0,
        link_bytes_cap: 0,
    };
    let init_rc = unsafe { ffi::zr_fb_init(&mut fb as *mut _, 4, 1) };
    assert_eq!(init_rc, ffi::ZR_OK);

    let clear_rc = unsafe { ffi::zr_fb_clear(&mut fb as *mut _, &style_plain() as *const _) };
    assert_eq!(clear_rc, ffi::ZR_OK);

    let mut clip_stack = [
        ffi::zr_rect_t {
            x: 0,
            y: 0,
            w: 4,
            h: 1,
        },
        ffi::zr_rect_t {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        },
    ];
    let mut painter = ffi::zr_fb_painter_t {
        fb: std::ptr::null_mut(),
        clip_stack: std::ptr::null_mut(),
        clip_cap: 0,
        clip_len: 0,
    };
    let begin_rc = unsafe {
        ffi::zr_fb_painter_begin(
            &mut painter as *mut _,
            &mut fb as *mut _,
            clip_stack.as_mut_ptr(),
            clip_stack.len() as u32,
        )
    };
    assert_eq!(begin_rc, ffi::ZR_OK);

    let wide_bytes = b"W";
    let write_wide_rc = unsafe {
        ffi::zr_fb_put_grapheme(
            &mut painter as *mut _,
            1,
            0,
            wide_bytes.as_ptr(),
            wide_bytes.len(),
            2,
            &style_plain() as *const _,
        )
    };
    assert_eq!(write_wide_rc, ffi::ZR_OK);

    let push_rc = unsafe {
        ffi::zr_fb_clip_push(
            &mut painter as *mut _,
            ffi::zr_rect_t {
                x: 2,
                y: 0,
                w: 1,
                h: 1,
            },
        )
    };
    assert_eq!(push_rc, ffi::ZR_OK);

    let a_bytes = b"A";
    let write_a_rc = unsafe {
        ffi::zr_fb_put_grapheme(
            &mut painter as *mut _,
            2,
            0,
            a_bytes.as_ptr(),
            a_bytes.len(),
            1,
            &style_plain() as *const _,
        )
    };
    assert_eq!(write_a_rc, ffi::ZR_OK);

    let pop_rc = unsafe { ffi::zr_fb_clip_pop(&mut painter as *mut _) };
    assert_eq!(pop_rc, ffi::ZR_OK);

    let (x1_ch, x1_w) = cell_snapshot(&mut fb, 1, 0);
    let (x2_ch, x2_w) = cell_snapshot(&mut fb, 2, 0);
    assert_eq!(x1_ch, b' ');
    assert_eq!(
        x1_w, 1,
        "wide lead should be cleared when continuation is overwritten"
    );
    assert_eq!(x2_ch, b'A');
    assert_eq!(x2_w, 1);

    unsafe { ffi::zr_fb_release(&mut fb as *mut _) };
}

#[test]
fn clip_edge_write_over_wide_lead_cleans_hidden_continuation() {
    let mut fb = ffi::zr_fb_t {
        cols: 0,
        rows: 0,
        cells: std::ptr::null_mut(),
        links: std::ptr::null_mut(),
        links_len: 0,
        links_cap: 0,
        link_bytes: std::ptr::null_mut(),
        link_bytes_len: 0,
        link_bytes_cap: 0,
    };
    let init_rc = unsafe { ffi::zr_fb_init(&mut fb as *mut _, 4, 1) };
    assert_eq!(init_rc, ffi::ZR_OK);

    let clear_rc = unsafe { ffi::zr_fb_clear(&mut fb as *mut _, &style_plain() as *const _) };
    assert_eq!(clear_rc, ffi::ZR_OK);

    let mut clip_stack = [
        ffi::zr_rect_t {
            x: 0,
            y: 0,
            w: 4,
            h: 1,
        },
        ffi::zr_rect_t {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        },
    ];
    let mut painter = ffi::zr_fb_painter_t {
        fb: std::ptr::null_mut(),
        clip_stack: std::ptr::null_mut(),
        clip_cap: 0,
        clip_len: 0,
    };
    let begin_rc = unsafe {
        ffi::zr_fb_painter_begin(
            &mut painter as *mut _,
            &mut fb as *mut _,
            clip_stack.as_mut_ptr(),
            clip_stack.len() as u32,
        )
    };
    assert_eq!(begin_rc, ffi::ZR_OK);

    let wide_bytes = b"W";
    let write_wide_rc = unsafe {
        ffi::zr_fb_put_grapheme(
            &mut painter as *mut _,
            1,
            0,
            wide_bytes.as_ptr(),
            wide_bytes.len(),
            2,
            &style_plain() as *const _,
        )
    };
    assert_eq!(write_wide_rc, ffi::ZR_OK);

    let push_rc = unsafe {
        ffi::zr_fb_clip_push(
            &mut painter as *mut _,
            ffi::zr_rect_t {
                x: 1,
                y: 0,
                w: 1,
                h: 1,
            },
        )
    };
    assert_eq!(push_rc, ffi::ZR_OK);

    let b_bytes = b"B";
    let write_b_rc = unsafe {
        ffi::zr_fb_put_grapheme(
            &mut painter as *mut _,
            1,
            0,
            b_bytes.as_ptr(),
            b_bytes.len(),
            1,
            &style_plain() as *const _,
        )
    };
    assert_eq!(write_b_rc, ffi::ZR_OK);

    let pop_rc = unsafe { ffi::zr_fb_clip_pop(&mut painter as *mut _) };
    assert_eq!(pop_rc, ffi::ZR_OK);

    let (x1_ch, x1_w) = cell_snapshot(&mut fb, 1, 0);
    let (x2_ch, x2_w) = cell_snapshot(&mut fb, 2, 0);
    assert_eq!(x1_ch, b'B');
    assert_eq!(x1_w, 1);
    assert_eq!(x2_ch, b' ');
    assert_eq!(x2_w, 1, "continuation outside clip should be cleaned");

    unsafe { ffi::zr_fb_release(&mut fb as *mut _) };
}

#[test]
fn diff_reanchors_cursor_after_non_ascii_cell() {
    let prev = TestFramebuffer::new(2, 1);
    let mut next = TestFramebuffer::new(2, 1);
    next.set_cell(0, 0, "✓".as_bytes(), 1, style_plain());
    next.set_cell(1, 0, b"A", 1, style_plain());

    let out = render_diff_bytes(&prev.raw, &next.raw, style_plain());
    assert!(
        contains_subsequence(&out, b"\x1b[1;2H"),
        "expected explicit CUP for second cell after non-ascii glyph: {:?}",
        String::from_utf8_lossy(&out),
    );
}

#[test]
fn debug_query_bigint_u64_accepts_in_range_values() {
    assert_eq!(parse_debug_query_bigint_u64(false, &[]), Ok(0));
    assert_eq!(parse_debug_query_bigint_u64(false, &[0]), Ok(0));
    assert_eq!(parse_debug_query_bigint_u64(false, &[123]), Ok(123));
    assert_eq!(
        parse_debug_query_bigint_u64(false, &[u64::MAX]),
        Ok(u64::MAX)
    );
}

#[test]
fn debug_query_bigint_u64_rejects_negative_values() {
    assert!(parse_debug_query_bigint_u64(true, &[1]).is_err());
    assert!(parse_debug_query_bigint_u64(true, &[u64::MAX]).is_err());
}

#[test]
fn debug_query_bigint_u64_rejects_overflow_values() {
    assert!(parse_debug_query_bigint_u64(false, &[0, 1]).is_err());
    assert!(parse_debug_query_bigint_u64(false, &[u64::MAX, 1]).is_err());
}

#[test]
fn diff_emits_dim_and_normal_intensity_sequences() {
    let to_dim = render_style_transition(0, ATTR_DIM);
    assert!(
        contains_subsequence(&to_dim, b"\x1b[0;2;"),
        "expected dim SGR sequence in output: {:?}",
        String::from_utf8_lossy(&to_dim),
    );

    let to_normal = render_style_transition(ATTR_DIM, 0);
    assert!(
        contains_subsequence(&to_normal, b"\x1b[0;38;"),
        "expected normal-intensity SGR sequence in output: {:?}",
        String::from_utf8_lossy(&to_normal),
    );
}

#[test]
fn diff_reapplies_intensity_when_switching_bold_and_dim() {
    let dim_to_bold = render_style_transition(ATTR_DIM, ATTR_BOLD);
    assert!(
        contains_subsequence(&dim_to_bold, b"\x1b[0;1;"),
        "expected dim->bold transition to emit bold SGR: {:?}",
        String::from_utf8_lossy(&dim_to_bold),
    );

    let bold_to_dim = render_style_transition(ATTR_BOLD, ATTR_DIM);
    assert!(
        contains_subsequence(&bold_to_dim, b"\x1b[0;2;"),
        "expected bold->dim transition to emit dim SGR: {:?}",
        String::from_utf8_lossy(&bold_to_dim),
    );
}

#[test]
fn diff_preserves_non_intensity_attr_delta_path() {
    let dim_to_dim_underline = render_style_transition(ATTR_DIM, ATTR_DIM | ATTR_UNDERLINE);
    assert!(
        contains_subsequence(&dim_to_dim_underline, b"\x1b[0;2;4;"),
        "expected underline+dim sequence in output: {:?}",
        String::from_utf8_lossy(&dim_to_dim_underline),
    );
}
