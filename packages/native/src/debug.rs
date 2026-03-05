use crate::config::{js_u32, js_u8_bool, validate_known_keys, ParseResult};
use crate::ffi;
use crate::registry::get_engine_guard;
use crate::{bigint_from_u64, invalid_arg_error};
use napi::bindgen_prelude::{BigInt, Error, Status, Uint8Array, ValueType};
use napi::{Env, JsBigInt, JsObject, JsUnknown};
use napi_derive::napi;

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

pub(crate) fn parse_debug_query_bigint_u64(sign_bit: bool, words: &[u64]) -> ParseResult<u64> {
    if sign_bit && words.iter().any(|word| *word != 0) {
        return Err(());
    }

    match words {
        [] => Ok(0),
        [value] => Ok(*value),
        _ => Err(()),
    }
}

fn js_u64(obj: &JsObject, primary: &str, alias: &str) -> ParseResult<Option<u64>> {
    for name in [primary, alias] {
        let value = match obj.get_named_property::<JsUnknown>(name) {
            Ok(value) => value,
            Err(_) => continue,
        };
        match value.get_type().map_err(|_| ())? {
            ValueType::Undefined => continue,
            ValueType::BigInt => {
                let mut bigint = unsafe { value.cast::<JsBigInt>() };
                let (sign_bit, words) = bigint.get_words().map_err(|_| ())?;
                return Ok(Some(parse_debug_query_bigint_u64(sign_bit, &words)?));
            }
            ValueType::Number => {
                let number = value.coerce_to_number().map_err(|_| ())?;
                let float = number.get_double().map_err(|_| ())?;
                if !float.is_finite() || float < 0.0 || float > (u64::MAX as f64) {
                    return Err(());
                }
                return Ok(Some(float as u64));
            }
            _ => return Err(()),
        }
    }

    Ok(None)
}

fn apply_debug_cfg(dst: &mut ffi::zr_debug_config_t, obj: &JsObject) -> ParseResult<()> {
    if let Some(value) = js_u8_bool(obj, "enabled", "enabled")? {
        dst.enabled = value as u32;
    }
    if let Some(value) = js_u32(obj, "ringCapacity", "ring_capacity")? {
        dst.ring_capacity = value;
    }
    if let Some(value) = js_u32(obj, "minSeverity", "min_severity")? {
        dst.min_severity = value;
    }
    if let Some(value) = js_u32(obj, "categoryMask", "category_mask")? {
        dst.category_mask = value;
    }
    if let Some(value) = js_u8_bool(obj, "captureRawEvents", "capture_raw_events")? {
        dst.capture_raw_events = value as u32;
    }
    if let Some(value) = js_u8_bool(obj, "captureDrawlistBytes", "capture_drawlist_bytes")? {
        dst.capture_drawlist_bytes = value as u32;
    }
    Ok(())
}

fn apply_debug_query(dst: &mut ffi::zr_debug_query_t, obj: &JsObject) -> ParseResult<()> {
    if let Some(value) = js_u64(obj, "minRecordId", "min_record_id")? {
        dst.min_record_id = value;
    }
    if let Some(value) = js_u64(obj, "maxRecordId", "max_record_id")? {
        dst.max_record_id = value;
    }
    if let Some(value) = js_u64(obj, "minFrameId", "min_frame_id")? {
        dst.min_frame_id = value;
    }
    if let Some(value) = js_u64(obj, "maxFrameId", "max_frame_id")? {
        dst.max_frame_id = value;
    }
    if let Some(value) = js_u32(obj, "categoryMask", "category_mask")? {
        dst.category_mask = value;
    }
    if let Some(value) = js_u32(obj, "minSeverity", "min_severity")? {
        dst.min_severity = value;
    }
    if let Some(value) = js_u32(obj, "maxRecords", "max_records")? {
        dst.max_records = value;
    }
    Ok(())
}

#[napi(js_name = "engineDebugEnable")]
pub fn engine_debug_enable(
    _env: Env,
    engine_id: u32,
    config: Option<JsObject>,
) -> napi::Result<i32> {
    let guard = match get_engine_guard(engine_id) {
        Ok(guard) => guard,
        Err(rc) => return Ok(rc),
    };
    if !guard.slot.is_owner_thread() {
        return Ok(ffi::ZR_ERR_INVALID_ARGUMENT);
    }

    let mut cfg = ffi::zr_debug_config_t {
        enabled: 1,
        ring_capacity: 0,
        min_severity: 0,
        category_mask: 0xFFFF_FFFF,
        capture_raw_events: 0,
        capture_drawlist_bytes: 0,
        _pad0: 0,
        _pad1: 0,
    };

    if let Some(obj) = config {
        validate_known_keys(&obj, DEBUG_CFG_KEYS, "engineDebugEnable config")?;
        apply_debug_cfg(&mut cfg, &obj).map_err(|_| {
            Error::new(
                Status::InvalidArg,
                "engineDebugEnable: invalid config value",
            )
        })?;
    }

    Ok(unsafe { ffi::engine_debug_enable(guard.slot.engine, &cfg as *const _) })
}

#[napi(js_name = "engineDebugDisable")]
pub fn engine_debug_disable(engine_id: u32) -> i32 {
    let guard = match get_engine_guard(engine_id) {
        Ok(guard) => guard,
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
    let guard = get_engine_guard(engine_id).map_err(|_| invalid_arg_error())?;
    if !guard.slot.is_owner_thread() {
        return Err(invalid_arg_error());
    }

    let mut debug_query = ffi::zr_debug_query_t {
        min_record_id: 0,
        max_record_id: 0,
        min_frame_id: 0,
        max_frame_id: 0,
        category_mask: 0xFFFF_FFFF,
        min_severity: 0,
        max_records: 0,
        _pad0: 0,
    };

    if let Some(obj) = query {
        validate_known_keys(&obj, DEBUG_QUERY_KEYS, "engineDebugQuery query")?;
        apply_debug_query(&mut debug_query, &obj)
            .map_err(|_| Error::new(Status::InvalidArg, "engineDebugQuery: invalid query value"))?;
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
    let headers_ptr = if headers_cap == 0 {
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
            &debug_query as *const _,
            headers_ptr,
            headers_cap,
            &mut result as *mut _,
        )
    };
    if rc != ffi::ZR_OK {
        return Err(Error::new(
            Status::GenericFailure,
            format!("engine_debug_query failed: {rc}"),
        ));
    }

    Ok(DebugQueryResult {
        recordsReturned: result.records_returned,
        recordsAvailable: result.records_available,
        oldestRecordId: bigint_from_u64(result.oldest_record_id),
        newestRecordId: bigint_from_u64(result.newest_record_id),
        recordsDropped: result.records_dropped,
    })
}

#[napi(js_name = "engineDebugGetPayload")]
pub fn engine_debug_get_payload(
    engine_id: u32,
    record_id: BigInt,
    mut out_payload: Uint8Array,
) -> napi::Result<i32> {
    let guard = get_engine_guard(engine_id).map_err(|_| invalid_arg_error())?;
    if !guard.slot.is_owner_thread() {
        return Err(invalid_arg_error());
    }

    let record_id =
        parse_debug_query_bigint_u64(record_id.sign_bit, &record_id.words).map_err(|_| {
            Error::new(
                Status::InvalidArg,
                "engineDebugGetPayload: recordId must be a non-negative u64",
            )
        })?;

    let mut out_size = 0u32;
    let out_cap = out_payload.len() as u32;
    let out_ptr = out_payload.as_mut().as_mut_ptr();
    let rc = unsafe {
        ffi::engine_debug_get_payload(
            guard.slot.engine,
            record_id,
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
    let guard = get_engine_guard(engine_id).map_err(|_| invalid_arg_error())?;
    if !guard.slot.is_owner_thread() {
        return Err(invalid_arg_error());
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
        return Err(Error::new(
            Status::GenericFailure,
            format!("engine_debug_get_stats failed: {rc}"),
        ));
    }

    Ok(DebugStats {
        totalRecords: bigint_from_u64(stats.total_records),
        totalDropped: bigint_from_u64(stats.total_dropped),
        errorCount: stats.error_count,
        warnCount: stats.warn_count,
        currentRingUsage: stats.current_ring_usage,
        ringCapacity: stats.ring_capacity,
    })
}

#[napi(js_name = "engineDebugExport")]
pub fn engine_debug_export(engine_id: u32, mut out_buf: Uint8Array) -> i32 {
    let guard = match get_engine_guard(engine_id) {
        Ok(guard) => guard,
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
        Ok(guard) => guard,
        Err(rc) => return rc,
    };
    if !guard.slot.is_owner_thread() {
        return ffi::ZR_ERR_INVALID_ARGUMENT;
    }

    unsafe { ffi::engine_debug_reset(guard.slot.engine) };
    ffi::ZR_OK
}
