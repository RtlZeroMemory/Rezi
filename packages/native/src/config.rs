use crate::ffi;
use napi::bindgen_prelude::{Error, Status, ValueType};
use napi::{JsObject, JsUnknown};

pub(crate) type ParseResult<T> = crate::ParseResult<T>;

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
  ("capForceFlags", "cap_force_flags"),
  ("capSuppressFlags", "cap_suppress_flags"),
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
  ("capForceFlags", "cap_force_flags"),
  ("capSuppressFlags", "cap_suppress_flags"),
];

pub(crate) fn validate_known_keys(
  obj: &JsObject,
  allowed: &[(&str, &str)],
  ctx: &str,
) -> napi::Result<()> {
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

pub(crate) fn apply_create_cfg_strict(
  dst: &mut ffi::zr_engine_config_t,
  obj: &JsObject,
) -> napi::Result<()> {
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

  apply_create_cfg(dst, obj)
    .map_err(|_| Error::new(Status::InvalidArg, "engineCreate: invalid config value"))?;
  Ok(())
}

pub(crate) fn apply_runtime_cfg_strict(
  dst: &mut ffi::zr_engine_runtime_config_t,
  obj: &JsObject,
) -> napi::Result<()> {
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

  apply_runtime_cfg(dst, obj)
    .map_err(|_| Error::new(Status::InvalidArg, "engineSetConfig: invalid config value"))?;
  Ok(())
}

pub(crate) fn js_u32(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<u32>> {
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

pub(crate) fn js_u8_bool(
  obj: &JsObject,
  primary: &str,
  alias: &str,
) -> ParseResult<Option<u8>> {
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
  if let Some(v) = js_u32(obj, "capForceFlags", "cap_force_flags")? {
    dst.cap_force_flags = v;
  }
  if let Some(v) = js_u32(obj, "capSuppressFlags", "cap_suppress_flags")? {
    dst.cap_suppress_flags = v;
  }
  Ok(())
}

pub(crate) fn create_default_runtime_cfg() -> ffi::zr_engine_runtime_config_t {
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
    cap_force_flags: base.cap_force_flags,
    cap_suppress_flags: base.cap_suppress_flags,
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
  if let Some(v) = js_u32(obj, "capForceFlags", "cap_force_flags")? {
    dst.cap_force_flags = v;
  }
  if let Some(v) = js_u32(obj, "capSuppressFlags", "cap_suppress_flags")? {
    dst.cap_suppress_flags = v;
  }
  Ok(())
}
