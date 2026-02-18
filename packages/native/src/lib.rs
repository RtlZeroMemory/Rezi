#![allow(non_snake_case)]

use napi::bindgen_prelude::{BigInt, Error, Status, Uint8Array, ValueType};
use napi::{Env, JsObject, JsUnknown};
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};

type ParseResult<T> = std::result::Result<T, ()>;

mod ffi {
  pub type ZrResultT = i32;

  pub const ZR_OK: ZrResultT = 0;
  pub const ZR_ERR_INVALID_ARGUMENT: ZrResultT = -1;
  pub const ZR_ERR_LIMIT: ZrResultT = -3;
  pub const ZR_ERR_PLATFORM: ZrResultT = -6;

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_limits_t {
    pub arena_max_total_bytes: u32,
    pub arena_initial_bytes: u32,
    pub out_max_bytes_per_frame: u32,
    pub dl_max_total_bytes: u32,
    pub dl_max_cmds: u32,
    pub dl_max_strings: u32,
    pub dl_max_blobs: u32,
    pub dl_max_clip_depth: u32,
    pub dl_max_text_run_segments: u32,
    pub diff_max_damage_rects: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct plat_config_t {
    pub requested_color_mode: u8,
    pub enable_mouse: u8,
    pub enable_bracketed_paste: u8,
    pub enable_focus_events: u8,
    pub enable_osc52: u8,
    pub _pad: [u8; 3],
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_engine_config_t {
    pub requested_engine_abi_major: u32,
    pub requested_engine_abi_minor: u32,
    pub requested_engine_abi_patch: u32,
    pub requested_drawlist_version: u32,
    pub requested_event_batch_version: u32,
    pub limits: zr_limits_t,
    pub plat: plat_config_t,
    pub tab_width: u32,
    pub width_policy: u32,
    pub target_fps: u32,
    pub enable_scroll_optimizations: u8,
    pub enable_debug_overlay: u8,
    pub enable_replay_recording: u8,
    pub wait_for_output_drain: u8,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_engine_runtime_config_t {
    pub limits: zr_limits_t,
    pub plat: plat_config_t,
    pub tab_width: u32,
    pub width_policy: u32,
    pub target_fps: u32,
    pub enable_scroll_optimizations: u8,
    pub enable_debug_overlay: u8,
    pub enable_replay_recording: u8,
    pub wait_for_output_drain: u8,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_metrics_t {
    pub struct_size: u32,
    pub negotiated_engine_abi_major: u32,
    pub negotiated_engine_abi_minor: u32,
    pub negotiated_engine_abi_patch: u32,
    pub negotiated_drawlist_version: u32,
    pub negotiated_event_batch_version: u32,
    pub frame_index: u64,
    pub fps: u32,
    pub _pad0: u32,
    pub bytes_emitted_total: u64,
    pub bytes_emitted_last_frame: u32,
    pub _pad1: u32,
    pub dirty_lines_last_frame: u32,
    pub dirty_cols_last_frame: u32,
    pub us_input_last_frame: u32,
    pub us_drawlist_last_frame: u32,
    pub us_diff_last_frame: u32,
    pub us_write_last_frame: u32,
    pub events_out_last_poll: u32,
    pub events_dropped_total: u32,
    pub arena_frame_high_water_bytes: u64,
    pub arena_persistent_high_water_bytes: u64,
    // v2 damage summary fields
    pub damage_rects_last_frame: u32,
    pub damage_cells_last_frame: u32,
    pub damage_full_frame: u8,
    pub _pad2: [u8; 3],
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_terminal_caps_t {
    pub color_mode: u8,
    pub supports_mouse: u8,
    pub supports_bracketed_paste: u8,
    pub supports_focus_events: u8,
    pub supports_osc52: u8,
    pub supports_sync_update: u8,
    pub supports_scroll_region: u8,
    pub supports_cursor_shape: u8,
    pub supports_output_wait_writable: u8,
    pub _pad0: [u8; 3],
    pub sgr_attrs_supported: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct plat_caps_t {
    pub color_mode: u8,
    pub supports_mouse: u8,
    pub supports_bracketed_paste: u8,
    pub supports_focus_events: u8,
    pub supports_osc52: u8,
    pub supports_sync_update: u8,
    pub supports_scroll_region: u8,
    pub supports_cursor_shape: u8,
    pub supports_output_wait_writable: u8,
    pub _pad0: [u8; 3],
    pub sgr_attrs_supported: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_style_t {
    pub fg_rgb: u32,
    pub bg_rgb: u32,
    pub attrs: u32,
    pub reserved: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_cell_t {
    pub glyph: [u8; 32],
    pub glyph_len: u8,
    pub width: u8,
    pub _pad0: u16,
    pub style: zr_style_t,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_rect_t {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_fb_t {
    pub cols: u32,
    pub rows: u32,
    pub cells: *mut zr_cell_t,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_fb_painter_t {
    pub fb: *mut zr_fb_t,
    pub clip_stack: *mut zr_rect_t,
    pub clip_cap: u32,
    pub clip_len: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_cursor_state_t {
    pub x: i32,
    pub y: i32,
    pub shape: u8,
    pub visible: u8,
    pub blink: u8,
    pub reserved0: u8,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_term_state_t {
    pub cursor_x: u32,
    pub cursor_y: u32,
    pub cursor_visible: u8,
    pub cursor_shape: u8,
    pub cursor_blink: u8,
    pub _pad0: u8,
    pub style: zr_style_t,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_diff_stats_t {
    pub dirty_lines: u32,
    pub dirty_cells: u32,
    pub damage_rects: u32,
    pub damage_cells: u32,
    pub damage_full_frame: u8,
    pub path_sweep_used: u8,
    pub path_damage_used: u8,
    pub scroll_opt_attempted: u8,
    pub scroll_opt_hit: u8,
    pub collision_guard_hits: u32,
    pub _pad0: u32,
    pub bytes_emitted: usize,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_damage_rect_t {
    pub x0: u32,
    pub y0: u32,
    pub x1: u32,
    pub y1: u32,
  }

  #[repr(C)]
  pub struct zr_engine_t {
    _private: [u8; 0],
  }

  // Debug trace structures
  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_debug_config_t {
    pub enabled: u32,
    pub ring_capacity: u32,
    pub min_severity: u32,
    pub category_mask: u32,
    pub capture_raw_events: u32,
    pub capture_drawlist_bytes: u32,
    pub _pad0: u32,
    pub _pad1: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_debug_query_t {
    pub min_record_id: u64,
    pub max_record_id: u64,
    pub min_frame_id: u64,
    pub max_frame_id: u64,
    pub category_mask: u32,
    pub min_severity: u32,
    pub max_records: u32,
    pub _pad0: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_debug_record_header_t {
    pub record_id: u64,
    pub timestamp_us: u64,
    pub frame_id: u64,
    pub category: u32,
    pub severity: u32,
    pub code: u32,
    pub payload_size: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_debug_query_result_t {
    pub records_returned: u32,
    pub records_available: u32,
    pub oldest_record_id: u64,
    pub newest_record_id: u64,
    pub records_dropped: u32,
    pub _pad0: u32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct zr_debug_stats_t {
    pub total_records: u64,
    pub total_dropped: u64,
    pub error_count: u32,
    pub warn_count: u32,
    pub current_ring_usage: u32,
    pub ring_capacity: u32,
  }

  extern "C" {
    pub fn zr_engine_config_default() -> zr_engine_config_t;
    pub fn zr_fb_init(fb: *mut zr_fb_t, cols: u32, rows: u32) -> ZrResultT;
    pub fn zr_fb_release(fb: *mut zr_fb_t);
    pub fn zr_fb_cell(fb: *mut zr_fb_t, x: u32, y: u32) -> *mut zr_cell_t;
    pub fn zr_fb_clear(fb: *mut zr_fb_t, style: *const zr_style_t) -> ZrResultT;
    pub fn zr_fb_painter_begin(
      p: *mut zr_fb_painter_t,
      fb: *mut zr_fb_t,
      clip_stack: *mut zr_rect_t,
      clip_cap: u32,
    ) -> ZrResultT;
    pub fn zr_fb_clip_push(p: *mut zr_fb_painter_t, clip: zr_rect_t) -> ZrResultT;
    pub fn zr_fb_clip_pop(p: *mut zr_fb_painter_t) -> ZrResultT;
    pub fn zr_fb_put_grapheme(
      p: *mut zr_fb_painter_t,
      x: i32,
      y: i32,
      bytes: *const u8,
      len: usize,
      width: u8,
      style: *const zr_style_t,
    ) -> ZrResultT;
    pub fn zr_diff_render(
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

    pub fn engine_create(out_engine: *mut *mut zr_engine_t, cfg: *const zr_engine_config_t) -> ZrResultT;
    pub fn engine_destroy(e: *mut zr_engine_t);

    pub fn engine_poll_events(e: *mut zr_engine_t, timeout_ms: i32, out_buf: *mut u8, out_cap: i32) -> i32;
    pub fn engine_post_user_event(e: *mut zr_engine_t, tag: u32, payload: *const u8, payload_len: i32) -> ZrResultT;

    pub fn engine_submit_drawlist(e: *mut zr_engine_t, bytes: *const u8, bytes_len: i32) -> ZrResultT;
    pub fn engine_present(e: *mut zr_engine_t) -> ZrResultT;

    pub fn engine_get_metrics(e: *mut zr_engine_t, out_metrics: *mut zr_metrics_t) -> ZrResultT;
    pub fn engine_get_caps(e: *mut zr_engine_t, out_caps: *mut zr_terminal_caps_t) -> ZrResultT;
    pub fn engine_set_config(e: *mut zr_engine_t, cfg: *const zr_engine_runtime_config_t) -> ZrResultT;

    // Debug trace API
    pub fn engine_debug_enable(e: *mut zr_engine_t, config: *const zr_debug_config_t) -> ZrResultT;
    pub fn engine_debug_disable(e: *mut zr_engine_t);
    pub fn engine_debug_query(
      e: *mut zr_engine_t,
      query: *const zr_debug_query_t,
      out_headers: *mut zr_debug_record_header_t,
      out_headers_cap: u32,
      out_result: *mut zr_debug_query_result_t,
    ) -> ZrResultT;
    pub fn engine_debug_get_payload(
      e: *mut zr_engine_t,
      record_id: u64,
      out_payload: *mut u8,
      out_cap: u32,
      out_size: *mut u32,
    ) -> ZrResultT;
    pub fn engine_debug_get_stats(e: *mut zr_engine_t, out_stats: *mut zr_debug_stats_t) -> ZrResultT;
    pub fn engine_debug_export(e: *mut zr_engine_t, out_buf: *mut u8, out_cap: usize) -> i32;
    pub fn engine_debug_reset(e: *mut zr_engine_t);
  }
}

#[napi(object)]
#[allow(non_snake_case)]
pub struct EngineMetrics {
  pub structSize: u32,

  pub negotiatedEngineAbiMajor: u32,
  pub negotiatedEngineAbiMinor: u32,
  pub negotiatedEngineAbiPatch: u32,

  pub negotiatedDrawlistVersion: u32,
  pub negotiatedEventBatchVersion: u32,

  pub frameIndex: BigInt,
  pub fps: u32,

  pub bytesEmittedTotal: BigInt,
  pub bytesEmittedLastFrame: u32,

  pub dirtyLinesLastFrame: u32,
  pub dirtyColsLastFrame: u32,

  pub usInputLastFrame: u32,
  pub usDrawlistLastFrame: u32,
  pub usDiffLastFrame: u32,
  pub usWriteLastFrame: u32,

  pub eventsOutLastPoll: u32,
  pub eventsDroppedTotal: u32,

  pub arenaFrameHighWaterBytes: BigInt,
  pub arenaPersistentHighWaterBytes: BigInt,

  // v2 damage summary fields
  pub damageRectsLastFrame: u32,
  pub damageCellsLastFrame: u32,
  pub damageFullFrame: bool,
}

#[napi(object)]
#[allow(non_snake_case)]
pub struct TerminalCaps {
  /// Color mode: 0=unknown, 1=16, 2=256, 3=rgb
  pub colorMode: u32,
  pub supportsMouse: bool,
  pub supportsBracketedPaste: bool,
  pub supportsFocusEvents: bool,
  pub supportsOsc52: bool,
  pub supportsSyncUpdate: bool,
  pub supportsScrollRegion: bool,
  pub supportsCursorShape: bool,
  pub supportsOutputWaitWritable: bool,
  /// Bitmask of supported SGR attributes
  pub sgrAttrsSupported: u32,
}

struct EngineSlot {
  engine: *mut ffi::zr_engine_t,
  owner_thread_id: u64,
  active_calls: AtomicUsize,
  active_calls_mu: Mutex<()>,
  active_calls_cv: Condvar,
  destroyed: AtomicBool,
}

unsafe impl Send for EngineSlot {}
unsafe impl Sync for EngineSlot {}

impl EngineSlot {
  fn is_owner_thread(&self) -> bool {
    self.owner_thread_id == current_thread_id_u64()
  }
}

struct EngineGuard {
  slot: std::sync::Arc<EngineSlot>,
}

impl Drop for EngineGuard {
  fn drop(&mut self) {
    let prev = self.slot.active_calls.fetch_sub(1, Ordering::Release);
    if prev == 1 {
      self.slot.active_calls_cv.notify_all();
    }
  }
}

static REGISTRY: OnceLock<Mutex<HashMap<u32, std::sync::Arc<EngineSlot>>>> = OnceLock::new();
static NEXT_ENGINE_ID: AtomicU32 = AtomicU32::new(1);
static NEXT_THREAD_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static Mutex<HashMap<u32, std::sync::Arc<EngineSlot>>> {
  REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn current_thread_id_u64() -> u64 {
  thread_local! {
    static THREAD_ID: u64 = NEXT_THREAD_ID.fetch_add(1, Ordering::Relaxed);
  }
  THREAD_ID.with(|id| *id)
}

fn alloc_engine_id() -> Result<u32, i32> {
  loop {
    let cur = NEXT_ENGINE_ID.load(Ordering::Relaxed);
    if cur == 0 {
      return Err(ffi::ZR_ERR_LIMIT);
    }
    if cur == u32::MAX {
      if NEXT_ENGINE_ID
        .compare_exchange(cur, 0, Ordering::SeqCst, Ordering::Relaxed)
        .is_ok()
      {
        return Ok(cur);
      }
      continue;
    }
    let next = cur.wrapping_add(1);
    if NEXT_ENGINE_ID
      .compare_exchange(cur, next, Ordering::SeqCst, Ordering::Relaxed)
      .is_ok()
    {
      return Ok(cur);
    }
  }
}

fn lock_registry<T>(f: impl FnOnce(&mut HashMap<u32, std::sync::Arc<EngineSlot>>) -> T) -> T {
  let mut guard = match registry().lock() {
    Ok(g) => g,
    Err(poison) => poison.into_inner(),
  };
  f(&mut guard)
}

fn get_engine_guard(engine_id: u32) -> Result<EngineGuard, i32> {
  if engine_id == 0 {
    return Err(ffi::ZR_ERR_INVALID_ARGUMENT);
  }

  lock_registry(|map| {
    let slot = match map.get(&engine_id) {
      Some(s) => std::sync::Arc::clone(s),
      None => return Err(ffi::ZR_ERR_INVALID_ARGUMENT),
    };
    slot.active_calls.fetch_add(1, Ordering::Acquire);
    Ok(EngineGuard { slot })
  })
}

fn validate_known_keys(obj: &JsObject, allowed: &[(&str, &str)], ctx: &str) -> napi::Result<()> {
  let names = obj.get_property_names()?;
  let len = names.get_array_length()?;

  'outer: for i in 0..len {
    let unk = names.get_element::<JsUnknown>(i)?;
    let s = unk.coerce_to_string()?;
    let k = s.into_utf8()?.as_str()?.to_owned();
    for (primary, alias) in allowed {
      if k == *primary || k == *alias {
        continue 'outer;
      }
    }
    return Err(Error::new(Status::InvalidArg, format!("{ctx}: unknown key: {k}")));
  }
  Ok(())
}

const LIMITS_KEYS: &[(&str, &str)] = &[
  ("arenaMaxTotalBytes", "arena_max_total_bytes"),
  ("arenaInitialBytes", "arena_initial_bytes"),
  ("outMaxBytesPerFrame", "out_max_bytes_per_frame"),
  ("dlMaxTotalBytes", "dl_max_total_bytes"),
  ("dlMaxCmds", "dl_max_cmds"),
  ("dlMaxStrings", "dl_max_strings"),
  ("dlMaxBlobs", "dl_max_blobs"),
  ("dlMaxClipDepth", "dl_max_clip_depth"),
  ("dlMaxTextRunSegments", "dl_max_text_run_segments"),
  ("diffMaxDamageRects", "diff_max_damage_rects"),
];

const PLAT_KEYS: &[(&str, &str)] = &[
  ("requestedColorMode", "requested_color_mode"),
  ("enableMouse", "enable_mouse"),
  ("enableBracketedPaste", "enable_bracketed_paste"),
  ("enableFocusEvents", "enable_focus_events"),
  ("enableOsc52", "enable_osc52"),
];

const CREATE_CFG_KEYS: &[(&str, &str)] = &[
  ("requestedEngineAbiMajor", "requested_engine_abi_major"),
  ("requestedEngineAbiMinor", "requested_engine_abi_minor"),
  ("requestedEngineAbiPatch", "requested_engine_abi_patch"),
  ("requestedDrawlistVersion", "requested_drawlist_version"),
  ("requestedEventBatchVersion", "requested_event_batch_version"),
  ("limits", "limits"),
  ("plat", "plat"),
  ("tabWidth", "tab_width"),
  ("widthPolicy", "width_policy"),
  ("targetFps", "target_fps"),
  ("enableScrollOptimizations", "enable_scroll_optimizations"),
  ("enableDebugOverlay", "enable_debug_overlay"),
  ("enableReplayRecording", "enable_replay_recording"),
  ("waitForOutputDrain", "wait_for_output_drain"),
];

const RUNTIME_CFG_KEYS: &[(&str, &str)] = &[
  ("limits", "limits"),
  ("plat", "plat"),
  ("tabWidth", "tab_width"),
  ("widthPolicy", "width_policy"),
  ("targetFps", "target_fps"),
  ("enableScrollOptimizations", "enable_scroll_optimizations"),
  ("enableDebugOverlay", "enable_debug_overlay"),
  ("enableReplayRecording", "enable_replay_recording"),
  ("waitForOutputDrain", "wait_for_output_drain"),
];

fn apply_create_cfg_strict(dst: &mut ffi::zr_engine_config_t, obj: &JsObject) -> napi::Result<()> {
  validate_known_keys(obj, CREATE_CFG_KEYS, "engineCreate config")?;
  if let Some(lim) = js_obj(obj, "limits", "limits")
    .map_err(|_| Error::new(Status::InvalidArg, "engineCreate: limits must be an object"))?
  {
    validate_known_keys(&lim, LIMITS_KEYS, "engineCreate config.limits")?;
  }
  if let Some(plat) = js_obj(obj, "plat", "plat")
    .map_err(|_| Error::new(Status::InvalidArg, "engineCreate: plat must be an object"))?
  {
    validate_known_keys(&plat, PLAT_KEYS, "engineCreate config.plat")?;
  }

  apply_create_cfg(dst, obj).map_err(|_| Error::new(Status::InvalidArg, "engineCreate: invalid config value"))?;
  Ok(())
}

fn apply_runtime_cfg_strict(dst: &mut ffi::zr_engine_runtime_config_t, obj: &JsObject) -> napi::Result<()> {
  validate_known_keys(obj, RUNTIME_CFG_KEYS, "engineSetConfig config")?;
  if let Some(lim) = js_obj(obj, "limits", "limits")
    .map_err(|_| Error::new(Status::InvalidArg, "engineSetConfig: limits must be an object"))?
  {
    validate_known_keys(&lim, LIMITS_KEYS, "engineSetConfig config.limits")?;
  }
  if let Some(plat) = js_obj(obj, "plat", "plat")
    .map_err(|_| Error::new(Status::InvalidArg, "engineSetConfig: plat must be an object"))?
  {
    validate_known_keys(&plat, PLAT_KEYS, "engineSetConfig config.plat")?;
  }

  apply_runtime_cfg(dst, obj).map_err(|_| Error::new(Status::InvalidArg, "engineSetConfig: invalid config value"))?;
  Ok(())
}

fn js_u32(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<u32>> {
  for name in [primary, alias] {
    let v = match obj.get_named_property::<JsUnknown>(name) {
      Ok(v) => v,
      Err(_) => continue,
    };
    if v.get_type().map_err(|_| ())? == ValueType::Undefined {
      continue;
    }
    let n = v.coerce_to_number().map_err(|_| ())?;
    let f = n.get_double().map_err(|_| ())?;
    if !f.is_finite() || f < 0.0 || f > (u32::MAX as f64) || f.fract() != 0.0 {
      return Err(());
    }
    return Ok(Some(f as u32));
  }
  Ok(None)
}

fn js_u8_bool(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<u8>> {
  for name in [primary, alias] {
    let v = match obj.get_named_property::<JsUnknown>(name) {
      Ok(v) => v,
      Err(_) => continue,
    };
    match v.get_type().map_err(|_| ())? {
      ValueType::Undefined => continue,
      ValueType::Boolean => {
        let b = v.coerce_to_bool().map_err(|_| ())?;
        return Ok(Some(if b.get_value().map_err(|_| ())? { 1 } else { 0 }));
      }
      ValueType::Number => {
        let n = v.coerce_to_number().map_err(|_| ())?;
        let f = n.get_double().map_err(|_| ())?;
        if f == 0.0 {
          return Ok(Some(0));
        }
        if f == 1.0 {
          return Ok(Some(1));
        }
        return Err(());
      }
      _ => return Err(()),
    }
  }
  Ok(None)
}

fn js_obj(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<JsObject>> {
  for name in [primary, alias] {
    let v = match obj.get_named_property::<JsUnknown>(name) {
      Ok(v) => v,
      Err(_) => continue,
    };
    if v.get_type().map_err(|_| ())? == ValueType::Undefined {
      continue;
    }
    let o = v.coerce_to_object().map_err(|_| ())?;
    return Ok(Some(o));
  }
  Ok(None)
}

fn apply_limits(dst: &mut ffi::zr_limits_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(v) = js_u32(obj, "arenaMaxTotalBytes", "arena_max_total_bytes")? {
    dst.arena_max_total_bytes = v;
  }
  if let Some(v) = js_u32(obj, "arenaInitialBytes", "arena_initial_bytes")? {
    dst.arena_initial_bytes = v;
  }
  if let Some(v) = js_u32(obj, "outMaxBytesPerFrame", "out_max_bytes_per_frame")? {
    dst.out_max_bytes_per_frame = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxTotalBytes", "dl_max_total_bytes")? {
    dst.dl_max_total_bytes = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxCmds", "dl_max_cmds")? {
    dst.dl_max_cmds = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxStrings", "dl_max_strings")? {
    dst.dl_max_strings = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxBlobs", "dl_max_blobs")? {
    dst.dl_max_blobs = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxClipDepth", "dl_max_clip_depth")? {
    dst.dl_max_clip_depth = v;
  }
  if let Some(v) = js_u32(obj, "dlMaxTextRunSegments", "dl_max_text_run_segments")? {
    dst.dl_max_text_run_segments = v;
  }
  if let Some(v) = js_u32(obj, "diffMaxDamageRects", "diff_max_damage_rects")? {
    dst.diff_max_damage_rects = v;
  }
  Ok(())
}

fn apply_plat(dst: &mut ffi::plat_config_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(v) = js_u32(obj, "requestedColorMode", "requested_color_mode")? {
    dst.requested_color_mode = (v & 0xFF) as u8;
  }
  if let Some(v) = js_u8_bool(obj, "enableMouse", "enable_mouse")? {
    dst.enable_mouse = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableBracketedPaste", "enable_bracketed_paste")? {
    dst.enable_bracketed_paste = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableFocusEvents", "enable_focus_events")? {
    dst.enable_focus_events = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableOsc52", "enable_osc52")? {
    dst.enable_osc52 = v;
  }
  dst._pad = [0, 0, 0];
  Ok(())
}

fn apply_create_cfg(dst: &mut ffi::zr_engine_config_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(v) = js_u32(obj, "requestedEngineAbiMajor", "requested_engine_abi_major")? {
    dst.requested_engine_abi_major = v;
  }
  if let Some(v) = js_u32(obj, "requestedEngineAbiMinor", "requested_engine_abi_minor")? {
    dst.requested_engine_abi_minor = v;
  }
  if let Some(v) = js_u32(obj, "requestedEngineAbiPatch", "requested_engine_abi_patch")? {
    dst.requested_engine_abi_patch = v;
  }
  if let Some(v) = js_u32(obj, "requestedDrawlistVersion", "requested_drawlist_version")? {
    dst.requested_drawlist_version = v;
  }
  if let Some(v) = js_u32(obj, "requestedEventBatchVersion", "requested_event_batch_version")? {
    dst.requested_event_batch_version = v;
  }

  if let Some(lim) = js_obj(obj, "limits", "limits")? {
    apply_limits(&mut dst.limits, &lim)?;
  }
  if let Some(plat) = js_obj(obj, "plat", "plat")? {
    apply_plat(&mut dst.plat, &plat)?;
  }

  if let Some(v) = js_u32(obj, "tabWidth", "tab_width")? {
    dst.tab_width = v;
  }
  if let Some(v) = js_u32(obj, "widthPolicy", "width_policy")? {
    dst.width_policy = v;
  }
  if let Some(v) = js_u32(obj, "targetFps", "target_fps")? {
    dst.target_fps = v;
  }

  if let Some(v) = js_u8_bool(obj, "enableScrollOptimizations", "enable_scroll_optimizations")? {
    dst.enable_scroll_optimizations = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableDebugOverlay", "enable_debug_overlay")? {
    dst.enable_debug_overlay = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableReplayRecording", "enable_replay_recording")? {
    dst.enable_replay_recording = v;
  }
  if let Some(v) = js_u8_bool(obj, "waitForOutputDrain", "wait_for_output_drain")? {
    dst.wait_for_output_drain = v;
  }
  Ok(())
}

fn create_default_runtime_cfg() -> ffi::zr_engine_runtime_config_t {
  let base = unsafe { ffi::zr_engine_config_default() };
  ffi::zr_engine_runtime_config_t {
    limits: base.limits,
    plat: base.plat,
    tab_width: base.tab_width,
    width_policy: base.width_policy,
    target_fps: base.target_fps,
    enable_scroll_optimizations: base.enable_scroll_optimizations,
    enable_debug_overlay: base.enable_debug_overlay,
    enable_replay_recording: base.enable_replay_recording,
    wait_for_output_drain: base.wait_for_output_drain,
  }
}

fn apply_runtime_cfg(dst: &mut ffi::zr_engine_runtime_config_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(lim) = js_obj(obj, "limits", "limits")? {
    apply_limits(&mut dst.limits, &lim)?;
  }
  if let Some(plat) = js_obj(obj, "plat", "plat")? {
    apply_plat(&mut dst.plat, &plat)?;
  }
  if let Some(v) = js_u32(obj, "tabWidth", "tab_width")? {
    dst.tab_width = v;
  }
  if let Some(v) = js_u32(obj, "widthPolicy", "width_policy")? {
    dst.width_policy = v;
  }
  if let Some(v) = js_u32(obj, "targetFps", "target_fps")? {
    dst.target_fps = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableScrollOptimizations", "enable_scroll_optimizations")? {
    dst.enable_scroll_optimizations = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableDebugOverlay", "enable_debug_overlay")? {
    dst.enable_debug_overlay = v;
  }
  if let Some(v) = js_u8_bool(obj, "enableReplayRecording", "enable_replay_recording")? {
    dst.enable_replay_recording = v;
  }
  if let Some(v) = js_u8_bool(obj, "waitForOutputDrain", "wait_for_output_drain")? {
    dst.wait_for_output_drain = v;
  }
  Ok(())
}

#[napi(js_name = "engineCreate")]
pub fn engine_create(_env: Env, config: Option<JsObject>) -> napi::Result<i64> {
  let mut cfg = unsafe { ffi::zr_engine_config_default() };
  if let Some(obj) = config {
    apply_create_cfg_strict(&mut cfg, &obj)?;
  }

  let mut out_engine: *mut ffi::zr_engine_t = std::ptr::null_mut();
  let rc = unsafe { ffi::engine_create(&mut out_engine as *mut _, &cfg as *const _) };
  if rc != ffi::ZR_OK {
    return Ok(rc as i64);
  }
  if out_engine.is_null() {
    return Ok(ffi::ZR_ERR_PLATFORM as i64);
  }

  let engine_id = match alloc_engine_id() {
    Ok(id) => id,
    Err(err) => {
      unsafe { ffi::engine_destroy(out_engine) };
      return Ok(err as i64);
    }
  };

  let slot = std::sync::Arc::new(EngineSlot {
    engine: out_engine,
    owner_thread_id: current_thread_id_u64(),
    active_calls: AtomicUsize::new(0),
    active_calls_mu: Mutex::new(()),
    active_calls_cv: Condvar::new(),
    destroyed: AtomicBool::new(false),
  });

  lock_registry(|map| {
    map.insert(engine_id, slot);
  });

  Ok(engine_id as i64)
}

#[napi(js_name = "engineDestroy")]
pub fn engine_destroy(engine_id: u32) {
  if engine_id == 0 {
    return;
  }

  let slot = lock_registry(|map| {
    let slot = match map.get(&engine_id) {
      Some(s) => s,
      None => return None,
    };
    if slot.owner_thread_id != current_thread_id_u64() {
      return None;
    }
    map.remove(&engine_id)
  });
  let Some(slot) = slot else { return; };

  slot.destroyed.store(true, Ordering::Release);
  let guard = match slot.active_calls_mu.lock() {
    Ok(g) => g,
    Err(poison) => poison.into_inner(),
  };
  let _guard = match slot
    .active_calls_cv
    .wait_while(guard, |_| slot.active_calls.load(Ordering::Acquire) != 0)
  {
    Ok(g) => g,
    Err(poison) => poison.into_inner(),
  };
  unsafe { ffi::engine_destroy(slot.engine) };
}

#[napi(js_name = "engineSubmitDrawlist")]
pub fn engine_submit_drawlist(engine_id: u32, drawlist: Uint8Array) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }

  if drawlist.len() > (i32::MAX as usize) {
    return ffi::ZR_ERR_LIMIT;
  }
  let bytes = drawlist.as_ref();
  unsafe { ffi::engine_submit_drawlist(guard.slot.engine, bytes.as_ptr(), bytes.len() as i32) }
}

#[napi(js_name = "enginePresent")]
pub fn engine_present(engine_id: u32) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }
  unsafe { ffi::engine_present(guard.slot.engine) }
}

#[napi(js_name = "enginePollEvents")]
pub fn engine_poll_events(engine_id: u32, timeout_ms: i32, mut out: Uint8Array) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }
  if timeout_ms < 0 {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }
  if out.len() > (i32::MAX as usize) {
    return ffi::ZR_ERR_LIMIT;
  }
  let out_buf = out.as_mut();
  unsafe {
    ffi::engine_poll_events(
      guard.slot.engine,
      timeout_ms,
      out_buf.as_mut_ptr(),
      out_buf.len() as i32,
    )
  }
}

#[napi(js_name = "enginePostUserEvent")]
pub fn engine_post_user_event(engine_id: u32, tag: u32, payload: Uint8Array) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };

  if payload.len() > (i32::MAX as usize) {
    return ffi::ZR_ERR_LIMIT;
  }
  let bytes = payload.as_ref();
  let (ptr, len) = if bytes.is_empty() {
    (std::ptr::null(), 0)
  } else {
    (bytes.as_ptr(), bytes.len() as i32)
  };
  unsafe { ffi::engine_post_user_event(guard.slot.engine, tag, ptr, len) }
}

#[napi(js_name = "engineSetConfig")]
pub fn engine_set_config(_env: Env, engine_id: u32, cfg: Option<JsObject>) -> napi::Result<i32> {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return Ok(rc),
  };
  if !guard.slot.is_owner_thread() {
    return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
  }

  let mut rcfg = create_default_runtime_cfg();
  if let Some(obj) = cfg {
    apply_runtime_cfg_strict(&mut rcfg, &obj)?;
  } else {
    return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
  }

  Ok(unsafe { ffi::engine_set_config(guard.slot.engine, &rcfg as *const _) })
}

#[napi(js_name = "engineGetMetrics")]
pub fn engine_get_metrics(engine_id: u32) -> napi::Result<EngineMetrics> {
  let guard = get_engine_guard(engine_id).map_err(|_| Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"))?;
  if !guard.slot.is_owner_thread() {
    return Err(Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"));
  }

  let mut m = ffi::zr_metrics_t {
    struct_size: std::mem::size_of::<ffi::zr_metrics_t>() as u32,
    negotiated_engine_abi_major: 0,
    negotiated_engine_abi_minor: 0,
    negotiated_engine_abi_patch: 0,
    negotiated_drawlist_version: 0,
    negotiated_event_batch_version: 0,
    frame_index: 0,
    fps: 0,
    _pad0: 0,
    bytes_emitted_total: 0,
    bytes_emitted_last_frame: 0,
    _pad1: 0,
    dirty_lines_last_frame: 0,
    dirty_cols_last_frame: 0,
    us_input_last_frame: 0,
    us_drawlist_last_frame: 0,
    us_diff_last_frame: 0,
    us_write_last_frame: 0,
    events_out_last_poll: 0,
    events_dropped_total: 0,
    arena_frame_high_water_bytes: 0,
    arena_persistent_high_water_bytes: 0,
    damage_rects_last_frame: 0,
    damage_cells_last_frame: 0,
    damage_full_frame: 0,
    _pad2: [0, 0, 0],
  };

  let rc = unsafe { ffi::engine_get_metrics(guard.slot.engine, &mut m as *mut _) };
  if rc != ffi::ZR_OK {
    return Err(Error::new(Status::GenericFailure, format!("engine_get_metrics failed: {rc}")));
  }

  Ok(EngineMetrics {
    structSize: m.struct_size,
    negotiatedEngineAbiMajor: m.negotiated_engine_abi_major,
    negotiatedEngineAbiMinor: m.negotiated_engine_abi_minor,
    negotiatedEngineAbiPatch: m.negotiated_engine_abi_patch,
    negotiatedDrawlistVersion: m.negotiated_drawlist_version,
    negotiatedEventBatchVersion: m.negotiated_event_batch_version,
    frameIndex: BigInt {
      sign_bit: false,
      words: vec![m.frame_index],
    },
    fps: m.fps,
    bytesEmittedTotal: BigInt {
      sign_bit: false,
      words: vec![m.bytes_emitted_total],
    },
    bytesEmittedLastFrame: m.bytes_emitted_last_frame,
    dirtyLinesLastFrame: m.dirty_lines_last_frame,
    dirtyColsLastFrame: m.dirty_cols_last_frame,
    usInputLastFrame: m.us_input_last_frame,
    usDrawlistLastFrame: m.us_drawlist_last_frame,
    usDiffLastFrame: m.us_diff_last_frame,
    usWriteLastFrame: m.us_write_last_frame,
    eventsOutLastPoll: m.events_out_last_poll,
    eventsDroppedTotal: m.events_dropped_total,
    arenaFrameHighWaterBytes: BigInt {
      sign_bit: false,
      words: vec![m.arena_frame_high_water_bytes],
    },
    arenaPersistentHighWaterBytes: BigInt {
      sign_bit: false,
      words: vec![m.arena_persistent_high_water_bytes],
    },
    damageRectsLastFrame: m.damage_rects_last_frame,
    damageCellsLastFrame: m.damage_cells_last_frame,
    damageFullFrame: m.damage_full_frame != 0,
  })
}

#[napi(js_name = "engineGetCaps")]
pub fn engine_get_caps(engine_id: u32) -> napi::Result<TerminalCaps> {
  let guard = get_engine_guard(engine_id).map_err(|_| Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"))?;
  if !guard.slot.is_owner_thread() {
    return Err(Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"));
  }

  let mut caps = ffi::zr_terminal_caps_t {
    color_mode: 0,
    supports_mouse: 0,
    supports_bracketed_paste: 0,
    supports_focus_events: 0,
    supports_osc52: 0,
    supports_sync_update: 0,
    supports_scroll_region: 0,
    supports_cursor_shape: 0,
    supports_output_wait_writable: 0,
    _pad0: [0, 0, 0],
    sgr_attrs_supported: 0,
  };

  let rc = unsafe { ffi::engine_get_caps(guard.slot.engine, &mut caps as *mut _) };
  if rc != ffi::ZR_OK {
    return Err(Error::new(Status::GenericFailure, format!("engine_get_caps failed: {rc}")));
  }

  Ok(TerminalCaps {
    colorMode: caps.color_mode as u32,
    supportsMouse: caps.supports_mouse != 0,
    supportsBracketedPaste: caps.supports_bracketed_paste != 0,
    supportsFocusEvents: caps.supports_focus_events != 0,
    supportsOsc52: caps.supports_osc52 != 0,
    supportsSyncUpdate: caps.supports_sync_update != 0,
    supportsScrollRegion: caps.supports_scroll_region != 0,
    supportsCursorShape: caps.supports_cursor_shape != 0,
    supportsOutputWaitWritable: caps.supports_output_wait_writable != 0,
    sgrAttrsSupported: caps.sgr_attrs_supported,
  })
}

// =============================================================================
// Debug Trace API
// =============================================================================

#[napi(object)]
#[allow(non_snake_case)]
pub struct DebugStats {
  pub totalRecords: BigInt,
  pub totalDropped: BigInt,
  pub errorCount: u32,
  pub warnCount: u32,
  pub currentRingUsage: u32,
  pub ringCapacity: u32,
}

#[napi(object)]
#[allow(non_snake_case)]
pub struct DebugQueryResult {
  pub recordsReturned: u32,
  pub recordsAvailable: u32,
  pub oldestRecordId: BigInt,
  pub newestRecordId: BigInt,
  pub recordsDropped: u32,
}

const DEBUG_CFG_KEYS: &[(&str, &str)] = &[
  ("enabled", "enabled"),
  ("ringCapacity", "ring_capacity"),
  ("minSeverity", "min_severity"),
  ("categoryMask", "category_mask"),
  ("captureRawEvents", "capture_raw_events"),
  ("captureDrawlistBytes", "capture_drawlist_bytes"),
];

const DEBUG_QUERY_KEYS: &[(&str, &str)] = &[
  ("minRecordId", "min_record_id"),
  ("maxRecordId", "max_record_id"),
  ("minFrameId", "min_frame_id"),
  ("maxFrameId", "max_frame_id"),
  ("categoryMask", "category_mask"),
  ("minSeverity", "min_severity"),
  ("maxRecords", "max_records"),
];

fn parse_debug_query_bigint_u64(sign_bit: bool, words: &[u64]) -> ParseResult<u64> {
  // Reject negative values while still allowing canonical zero.
  if sign_bit && words.iter().any(|w| *w != 0) {
    return Err(());
  }
  match words {
    [] => Ok(0),
    [value] => Ok(*value),
    _ => Err(()), // More than 64 bits.
  }
}

fn js_u64(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<u64>> {
  for name in [primary, alias] {
    let v = match obj.get_named_property::<JsUnknown>(name) {
      Ok(v) => v,
      Err(_) => continue,
    };
    match v.get_type().map_err(|_| ())? {
      ValueType::Undefined => continue,
      ValueType::BigInt => {
        let mut bi = unsafe { v.cast::<napi::JsBigInt>() };
        let (sign_bit, words) = bi.get_words().map_err(|_| ())?;
        let val = parse_debug_query_bigint_u64(sign_bit, &words)?;
        return Ok(Some(val));
      }
      ValueType::Number => {
        let n = v.coerce_to_number().map_err(|_| ())?;
        let f = n.get_double().map_err(|_| ())?;
        if !f.is_finite() || f < 0.0 || f > (u64::MAX as f64) {
          return Err(());
        }
        return Ok(Some(f as u64));
      }
      _ => return Err(()),
    }
  }
  Ok(None)
}

fn apply_debug_cfg(dst: &mut ffi::zr_debug_config_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(v) = js_u8_bool(obj, "enabled", "enabled")? {
    dst.enabled = v as u32;
  }
  if let Some(v) = js_u32(obj, "ringCapacity", "ring_capacity")? {
    dst.ring_capacity = v;
  }
  if let Some(v) = js_u32(obj, "minSeverity", "min_severity")? {
    dst.min_severity = v;
  }
  if let Some(v) = js_u32(obj, "categoryMask", "category_mask")? {
    dst.category_mask = v;
  }
  if let Some(v) = js_u8_bool(obj, "captureRawEvents", "capture_raw_events")? {
    dst.capture_raw_events = v as u32;
  }
  if let Some(v) = js_u8_bool(obj, "captureDrawlistBytes", "capture_drawlist_bytes")? {
    dst.capture_drawlist_bytes = v as u32;
  }
  Ok(())
}

fn apply_debug_query(dst: &mut ffi::zr_debug_query_t, obj: &JsObject) -> ParseResult<()> {
  if let Some(v) = js_u64(obj, "minRecordId", "min_record_id")? {
    dst.min_record_id = v;
  }
  if let Some(v) = js_u64(obj, "maxRecordId", "max_record_id")? {
    dst.max_record_id = v;
  }
  if let Some(v) = js_u64(obj, "minFrameId", "min_frame_id")? {
    dst.min_frame_id = v;
  }
  if let Some(v) = js_u64(obj, "maxFrameId", "max_frame_id")? {
    dst.max_frame_id = v;
  }
  if let Some(v) = js_u32(obj, "categoryMask", "category_mask")? {
    dst.category_mask = v;
  }
  if let Some(v) = js_u32(obj, "minSeverity", "min_severity")? {
    dst.min_severity = v;
  }
  if let Some(v) = js_u32(obj, "maxRecords", "max_records")? {
    dst.max_records = v;
  }
  Ok(())
}

#[napi(js_name = "engineDebugEnable")]
pub fn engine_debug_enable(_env: Env, engine_id: u32, config: Option<JsObject>) -> napi::Result<i32> {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return Ok(rc),
  };
  if !guard.slot.is_owner_thread() {
    return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
  }

  let mut cfg = ffi::zr_debug_config_t {
    enabled: 1,
    ring_capacity: 0,
    min_severity: 0,
    category_mask: 0xFFFFFFFF, // All categories
    capture_raw_events: 0,
    capture_drawlist_bytes: 0,
    _pad0: 0,
    _pad1: 0,
  };

  if let Some(obj) = config {
    validate_known_keys(&obj, DEBUG_CFG_KEYS, "engineDebugEnable config")?;
    apply_debug_cfg(&mut cfg, &obj).map_err(|_| Error::new(Status::InvalidArg, "engineDebugEnable: invalid config value"))?;
  }

  Ok(unsafe { ffi::engine_debug_enable(guard.slot.engine, &cfg as *const _) })
}

#[napi(js_name = "engineDebugDisable")]
pub fn engine_debug_disable(engine_id: u32) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }

  unsafe { ffi::engine_debug_disable(guard.slot.engine) };
  ffi::ZR_OK
}

#[napi(js_name = "engineDebugQuery")]
pub fn engine_debug_query(
  _env: Env,
  engine_id: u32,
  query: Option<JsObject>,
  mut out_headers: Uint8Array,
) -> napi::Result<DebugQueryResult> {
  let guard = get_engine_guard(engine_id).map_err(|_| Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"))?;
  if !guard.slot.is_owner_thread() {
    return Err(Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"));
  }

  let mut q = ffi::zr_debug_query_t {
    min_record_id: 0,
    max_record_id: 0,
    min_frame_id: 0,
    max_frame_id: 0,
    category_mask: 0xFFFFFFFF,
    min_severity: 0,
    max_records: 0,
    _pad0: 0,
  };

  if let Some(obj) = query {
    validate_known_keys(&obj, DEBUG_QUERY_KEYS, "engineDebugQuery query")?;
    apply_debug_query(&mut q, &obj).map_err(|_| Error::new(Status::InvalidArg, "engineDebugQuery: invalid query value"))?;
  }

  let mut result = ffi::zr_debug_query_result_t {
    records_returned: 0,
    records_available: 0,
    oldest_record_id: 0,
    newest_record_id: 0,
    records_dropped: 0,
    _pad0: 0,
  };

  let out_headers_slice = out_headers.as_mut();
  let header_size = std::mem::size_of::<ffi::zr_debug_record_header_t>();
  let header_align = std::mem::align_of::<ffi::zr_debug_record_header_t>();
  let headers_cap = (out_headers_slice.len() / header_size) as u32;

  let headers_ptr: *mut ffi::zr_debug_record_header_t = if headers_cap == 0 {
    std::ptr::null_mut()
  } else {
    let raw = out_headers_slice.as_mut_ptr();
    if (raw as usize) % header_align != 0 {
      return Err(Error::new(
        Status::InvalidArg,
        "engineDebugQuery: outHeaders must be aligned for debug record headers",
      ));
    }
    raw as *mut ffi::zr_debug_record_header_t
  };

  let rc = unsafe {
    ffi::engine_debug_query(
      guard.slot.engine,
      &q as *const _,
      headers_ptr,
      headers_cap,
      &mut result as *mut _,
    )
  };

  if rc != ffi::ZR_OK {
    return Err(Error::new(Status::GenericFailure, format!("engine_debug_query failed: {rc}")));
  }

  Ok(DebugQueryResult {
    recordsReturned: result.records_returned,
    recordsAvailable: result.records_available,
    oldestRecordId: BigInt { sign_bit: false, words: vec![result.oldest_record_id] },
    newestRecordId: BigInt { sign_bit: false, words: vec![result.newest_record_id] },
    recordsDropped: result.records_dropped,
  })
}

#[napi(js_name = "engineDebugGetPayload")]
pub fn engine_debug_get_payload(
  engine_id: u32,
  record_id: BigInt,
  mut out_payload: Uint8Array,
) -> napi::Result<i32> {
  let guard = get_engine_guard(engine_id).map_err(|_| Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"))?;
  if !guard.slot.is_owner_thread() {
    return Err(Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"));
  }

  let rid = parse_debug_query_bigint_u64(record_id.sign_bit, &record_id.words).map_err(|_| {
    Error::new(
      Status::InvalidArg,
      "engineDebugGetPayload: recordId must be a non-negative u64",
    )
  })?;

  let mut out_size: u32 = 0;
  let out_cap = out_payload.len() as u32;
  let out_ptr = out_payload.as_mut().as_mut_ptr();

  let rc = unsafe {
    ffi::engine_debug_get_payload(
      guard.slot.engine,
      rid,
      out_ptr,
      out_cap,
      &mut out_size as *mut _,
    )
  };

  if rc != ffi::ZR_OK {
    return Ok(rc);
  }

  Ok(out_size as i32)
}

#[napi(js_name = "engineDebugGetStats")]
pub fn engine_debug_get_stats(engine_id: u32) -> napi::Result<DebugStats> {
  let guard = get_engine_guard(engine_id).map_err(|_| Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"))?;
  if !guard.slot.is_owner_thread() {
    return Err(Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT"));
  }

  let mut stats = ffi::zr_debug_stats_t {
    total_records: 0,
    total_dropped: 0,
    error_count: 0,
    warn_count: 0,
    current_ring_usage: 0,
    ring_capacity: 0,
  };

  let rc = unsafe { ffi::engine_debug_get_stats(guard.slot.engine, &mut stats as *mut _) };
  if rc != ffi::ZR_OK {
    return Err(Error::new(Status::GenericFailure, format!("engine_debug_get_stats failed: {rc}")));
  }

  Ok(DebugStats {
    totalRecords: BigInt { sign_bit: false, words: vec![stats.total_records] },
    totalDropped: BigInt { sign_bit: false, words: vec![stats.total_dropped] },
    errorCount: stats.error_count,
    warnCount: stats.warn_count,
    currentRingUsage: stats.current_ring_usage,
    ringCapacity: stats.ring_capacity,
  })
}

#[napi(js_name = "engineDebugExport")]
pub fn engine_debug_export(engine_id: u32, mut out_buf: Uint8Array) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }

  let out_cap = out_buf.len();
  let out_ptr = out_buf.as_mut().as_mut_ptr();

  unsafe { ffi::engine_debug_export(guard.slot.engine, out_ptr, out_cap) }
}

#[napi(js_name = "engineDebugReset")]
pub fn engine_debug_reset(engine_id: u32) -> i32 {
  let guard = match get_engine_guard(engine_id) {
    Ok(g) => g,
    Err(rc) => return rc,
  };
  if !guard.slot.is_owner_thread() {
    return ffi::ZR_ERR_INVALID_ARGUMENT;
  }

  unsafe { ffi::engine_debug_reset(guard.slot.engine) };
  ffi::ZR_OK
}

#[cfg(test)]
mod tests {
  use super::{ffi, parse_debug_query_bigint_u64};

  const ATTR_BOLD: u32 = 1 << 0;
  const ATTR_UNDERLINE: u32 = 1 << 2;
  const ATTR_DIM: u32 = 1 << 4;

  fn contains_subsequence(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
      return true;
    }
    haystack.windows(needle.len()).any(|w| w == needle)
  }

  fn style_with_attrs(attrs: u32) -> ffi::zr_style_t {
    ffi::zr_style_t {
      fg_rgb: 0,
      bg_rgb: 0,
      attrs,
      reserved: 0,
    }
  }

  fn style_plain() -> ffi::zr_style_t {
    ffi::zr_style_t {
      fg_rgb: 0,
      bg_rgb: 0,
      attrs: 0,
      reserved: 0,
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
      };

      let rc = unsafe { ffi::zr_fb_init(&mut raw as *mut _, 1, 1) };
      assert_eq!(rc, ffi::ZR_OK, "zr_fb_init must succeed for test framebuffer");

      let cell = unsafe { ffi::zr_fb_cell(&mut raw as *mut _, 0, 0) };
      assert!(!cell.is_null(), "zr_fb_cell(0,0) must return a valid pointer");
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
      };
      let rc = unsafe { ffi::zr_fb_init(&mut raw as *mut _, cols, rows) };
      assert_eq!(rc, ffi::ZR_OK, "zr_fb_init must succeed for test framebuffer");
      let rc_clear = unsafe { ffi::zr_fb_clear(&mut raw as *mut _, &style_plain() as *const _) };
      assert_eq!(rc_clear, ffi::ZR_OK, "zr_fb_clear must succeed for test framebuffer");
      Self { raw }
    }

    fn set_cell(&mut self, x: u32, y: u32, glyph: &[u8], width: u8, style: ffi::zr_style_t) {
      assert!(
        glyph.len() <= 32,
        "glyph length must fit ZR_CELL_GLYPH_MAX (got {})",
        glyph.len()
      );
      let cell = unsafe { ffi::zr_fb_cell(&mut self.raw as *mut _, x, y) };
      assert!(!cell.is_null(), "zr_fb_cell({x},{y}) must return a valid pointer");
      unsafe {
        (*cell).glyph = [0; 32];
        for (i, b) in glyph.iter().copied().enumerate() {
          (*cell).glyph[i] = b;
        }
        (*cell).glyph_len = glyph.len() as u8;
        (*cell).width = width;
        (*cell)._pad0 = 0;
        (*cell).style = style;
      }
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
      _pad0: [0, 0, 0],
      sgr_attrs_supported: u32::MAX,
    };
    let limits = unsafe { ffi::zr_engine_config_default() }.limits;
    let initial_term_state = ffi::zr_term_state_t {
      cursor_x: 0,
      cursor_y: 0,
      cursor_visible: 1,
      cursor_shape: 0,
      cursor_blink: 0,
      _pad0: 0,
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
  fn clip_edge_write_over_continuation_cleans_lead_pair() {
    let mut fb = ffi::zr_fb_t {
      cols: 0,
      rows: 0,
      cells: std::ptr::null_mut(),
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
    assert_eq!(x1_w, 1, "wide lead should be cleared when continuation is overwritten");
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
    assert_eq!(parse_debug_query_bigint_u64(false, &[u64::MAX]), Ok(u64::MAX));
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
}
