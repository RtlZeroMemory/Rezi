#![allow(non_snake_case)]

mod config;
mod debug;
mod ffi;
mod registry;

#[cfg(test)]
mod tests;

pub use crate::debug::{
    engine_debug_disable, engine_debug_enable, engine_debug_export, engine_debug_get_payload,
    engine_debug_get_stats, engine_debug_query, engine_debug_reset, DebugQueryResult, DebugStats,
};

use crate::config::{
    apply_create_cfg_strict, apply_runtime_cfg_strict, create_default_runtime_cfg,
};
use crate::registry::{get_engine_guard, register_engine, take_engine_for_owner};
use napi::bindgen_prelude::{BigInt, Error, Status, Uint8Array};
use napi::{Env, JsObject};
use napi_derive::{module_exports, napi};
use std::sync::OnceLock;

pub(crate) fn bigint_from_u64(value: u64) -> BigInt {
    BigInt {
        sign_bit: false,
        words: vec![value],
    }
}

pub(crate) fn invalid_arg_error() -> Error {
    Error::new(Status::InvalidArg, "ZR_ERR_INVALID_ARGUMENT")
}

// Keep the addon resident for process lifetime so worker-thread TLS cleanup
// cannot jump back into an already-unloaded Rust/N-API image.
static MODULE_PIN_STATE: OnceLock<Result<usize, String>> = OnceLock::new();

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn pin_current_module() -> Result<usize, String> {
    use std::ffi::{c_char, c_int, c_void, CStr};

    #[repr(C)]
    struct DlInfo {
        dli_fname: *const c_char,
        dli_fbase: *mut c_void,
        dli_sname: *const c_char,
        dli_saddr: *mut c_void,
    }

    unsafe extern "C" {
        fn dladdr(addr: *const c_void, info: *mut DlInfo) -> c_int;
        fn dlopen(filename: *const c_char, flags: c_int) -> *mut c_void;
        fn dlerror() -> *const c_char;
    }

    const RTLD_NOW: c_int = 0x2;
    #[cfg(target_os = "linux")]
    const RTLD_NODELETE: c_int = 0x1000;

    let mut info = DlInfo {
        dli_fname: std::ptr::null(),
        dli_fbase: std::ptr::null_mut(),
        dli_sname: std::ptr::null(),
        dli_saddr: std::ptr::null_mut(),
    };
    let symbol = pin_current_module as *const ();
    let lookup_ok = unsafe { dladdr(symbol.cast::<c_void>(), &mut info as *mut _) };
    if lookup_ok == 0 || info.dli_fname.is_null() {
        return Err("dladdr failed for native module address".to_owned());
    }

    let mut flags = RTLD_NOW;
    #[cfg(target_os = "linux")]
    {
        flags |= RTLD_NODELETE;
    }

    let handle = unsafe { dlopen(info.dli_fname, flags) };
    if handle.is_null() {
        let detail = unsafe { dlerror() };
        if detail.is_null() {
            return Err("dlopen returned null without dlerror detail".to_owned());
        }
        let detail = unsafe { CStr::from_ptr(detail) }
            .to_string_lossy()
            .into_owned();
        return Err(format!("dlopen failed while pinning module: {detail}"));
    }

    Ok(handle as usize)
}

#[cfg(windows)]
fn pin_current_module() -> Result<usize, String> {
    use std::ffi::c_void;

    type Hmodule = *mut c_void;

    unsafe extern "system" {
        fn GetModuleHandleExW(flags: u32, module_name: *const u16, module: *mut Hmodule) -> i32;
    }

    const GET_MODULE_HANDLE_EX_FLAG_PIN: u32 = 0x0000_0001;
    const GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS: u32 = 0x0000_0004;

    let mut module: Hmodule = std::ptr::null_mut();
    let symbol = pin_current_module as *const ();
    let ok = unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
            symbol.cast::<u16>(),
            &mut module as *mut _,
        )
    };
    if ok == 0 || module.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }

    Ok(module as usize)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn pin_current_module() -> Result<usize, String> {
    Ok(0)
}

fn ensure_module_pinned() -> napi::Result<()> {
    let state = MODULE_PIN_STATE.get_or_init(pin_current_module);
    match state {
        Ok(_) => Ok(()),
        Err(detail) => Err(Error::new(
            Status::GenericFailure,
            format!("failed to pin @rezi-ui/native for worker_threads safety: {detail}"),
        )),
    }
}

#[module_exports]
fn init_native_module(_exports: JsObject, _env: Env) -> napi::Result<()> {
    ensure_module_pinned()
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
    pub supportsUnderlineStyles: bool,
    pub supportsColoredUnderlines: bool,
    pub supportsHyperlinks: bool,
    /// Bitmask of supported SGR attributes
    pub sgrAttrsSupported: u32,
}

fn empty_metrics() -> ffi::zr_metrics_t {
    ffi::zr_metrics_t {
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
    }
}

fn empty_terminal_caps() -> ffi::zr_terminal_caps_t {
    ffi::zr_terminal_caps_t {
        color_mode: 0,
        supports_mouse: 0,
        supports_bracketed_paste: 0,
        supports_focus_events: 0,
        supports_osc52: 0,
        supports_sync_update: 0,
        supports_scroll_region: 0,
        supports_cursor_shape: 0,
        supports_output_wait_writable: 0,
        supports_underline_styles: 0,
        supports_colored_underlines: 0,
        supports_hyperlinks: 0,
        sgr_attrs_supported: 0,
        terminal_id: 0,
        _pad1: [0, 0, 0],
        cap_flags: 0,
        cap_force_flags: 0,
        cap_suppress_flags: 0,
    }
}

fn metrics_to_js(metrics: ffi::zr_metrics_t) -> EngineMetrics {
    EngineMetrics {
        structSize: metrics.struct_size,
        negotiatedEngineAbiMajor: metrics.negotiated_engine_abi_major,
        negotiatedEngineAbiMinor: metrics.negotiated_engine_abi_minor,
        negotiatedEngineAbiPatch: metrics.negotiated_engine_abi_patch,
        negotiatedDrawlistVersion: metrics.negotiated_drawlist_version,
        negotiatedEventBatchVersion: metrics.negotiated_event_batch_version,
        frameIndex: bigint_from_u64(metrics.frame_index),
        fps: metrics.fps,
        bytesEmittedTotal: bigint_from_u64(metrics.bytes_emitted_total),
        bytesEmittedLastFrame: metrics.bytes_emitted_last_frame,
        dirtyLinesLastFrame: metrics.dirty_lines_last_frame,
        dirtyColsLastFrame: metrics.dirty_cols_last_frame,
        usInputLastFrame: metrics.us_input_last_frame,
        usDrawlistLastFrame: metrics.us_drawlist_last_frame,
        usDiffLastFrame: metrics.us_diff_last_frame,
        usWriteLastFrame: metrics.us_write_last_frame,
        eventsOutLastPoll: metrics.events_out_last_poll,
        eventsDroppedTotal: metrics.events_dropped_total,
        arenaFrameHighWaterBytes: bigint_from_u64(metrics.arena_frame_high_water_bytes),
        arenaPersistentHighWaterBytes: bigint_from_u64(metrics.arena_persistent_high_water_bytes),
        damageRectsLastFrame: metrics.damage_rects_last_frame,
        damageCellsLastFrame: metrics.damage_cells_last_frame,
        damageFullFrame: metrics.damage_full_frame != 0,
    }
}

fn terminal_caps_to_js(caps: ffi::zr_terminal_caps_t) -> TerminalCaps {
    TerminalCaps {
        colorMode: caps.color_mode as u32,
        supportsMouse: caps.supports_mouse != 0,
        supportsBracketedPaste: caps.supports_bracketed_paste != 0,
        supportsFocusEvents: caps.supports_focus_events != 0,
        supportsOsc52: caps.supports_osc52 != 0,
        supportsSyncUpdate: caps.supports_sync_update != 0,
        supportsScrollRegion: caps.supports_scroll_region != 0,
        supportsCursorShape: caps.supports_cursor_shape != 0,
        supportsOutputWaitWritable: caps.supports_output_wait_writable != 0,
        supportsUnderlineStyles: caps.supports_underline_styles != 0,
        supportsColoredUnderlines: caps.supports_colored_underlines != 0,
        supportsHyperlinks: caps.supports_hyperlinks != 0,
        sgrAttrsSupported: caps.sgr_attrs_supported,
    }
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

    match register_engine(out_engine) {
        Ok(engine_id) => Ok(engine_id as i64),
        Err(err) => {
            unsafe { ffi::engine_destroy(out_engine) };
            Ok(err as i64)
        }
    }
}

#[napi(js_name = "engineDestroy")]
pub fn engine_destroy(engine_id: u32) {
    let Some(slot) = take_engine_for_owner(engine_id) else {
        return;
    };

    slot.mark_destroyed();
    slot.wait_for_idle();
    unsafe { ffi::engine_destroy(slot.engine) };
}

#[napi(js_name = "engineSubmitDrawlist")]
pub fn engine_submit_drawlist(engine_id: u32, drawlist: Uint8Array) -> i32 {
    let guard = match get_engine_guard(engine_id) {
        Ok(guard) => guard,
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
        Ok(guard) => guard,
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
        Ok(guard) => guard,
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
        Ok(guard) => guard,
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
        Ok(guard) => guard,
        Err(rc) => return Ok(rc),
    };
    if !guard.slot.is_owner_thread() {
        return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
    }

    let mut runtime_cfg = create_default_runtime_cfg();
    if let Some(obj) = cfg {
        apply_runtime_cfg_strict(&mut runtime_cfg, &obj)?;
    } else {
        return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
    }

    Ok(unsafe { ffi::engine_set_config(guard.slot.engine, &runtime_cfg as *const _) })
}

#[napi(js_name = "engineGetMetrics")]
pub fn engine_get_metrics(engine_id: u32) -> napi::Result<EngineMetrics> {
    let guard = get_engine_guard(engine_id).map_err(|_| invalid_arg_error())?;
    if !guard.slot.is_owner_thread() {
        return Err(invalid_arg_error());
    }

    let mut metrics = empty_metrics();
    let rc = unsafe { ffi::engine_get_metrics(guard.slot.engine, &mut metrics as *mut _) };
    if rc != ffi::ZR_OK {
        return Err(Error::new(
            Status::GenericFailure,
            format!("engine_get_metrics failed: {rc}"),
        ));
    }

    Ok(metrics_to_js(metrics))
}

#[napi(js_name = "engineGetCaps")]
pub fn engine_get_caps(engine_id: u32) -> napi::Result<TerminalCaps> {
    let guard = get_engine_guard(engine_id).map_err(|_| invalid_arg_error())?;
    if !guard.slot.is_owner_thread() {
        return Err(invalid_arg_error());
    }

    let mut caps = empty_terminal_caps();
    let rc = unsafe { ffi::engine_get_caps(guard.slot.engine, &mut caps as *mut _) };
    if rc != ffi::ZR_OK {
        return Err(Error::new(
            Status::GenericFailure,
            format!("engine_get_caps failed: {rc}"),
        ));
    }

    Ok(terminal_caps_to_js(caps))
}
