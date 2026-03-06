use crate::ffi;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread::ThreadId;

pub(crate) struct EngineSlot {
    pub(crate) engine: *mut ffi::zr_engine_t,
    owner_thread_id: ThreadId,
    active_calls: AtomicUsize,
    active_calls_mu: Mutex<()>,
    active_calls_cv: Condvar,
    destroyed: AtomicBool,
}

unsafe impl Send for EngineSlot {}
unsafe impl Sync for EngineSlot {}

impl EngineSlot {
    fn new(engine: *mut ffi::zr_engine_t) -> Self {
        Self {
            engine,
            owner_thread_id: current_thread_id(),
            active_calls: AtomicUsize::new(0),
            active_calls_mu: Mutex::new(()),
            active_calls_cv: Condvar::new(),
            destroyed: AtomicBool::new(false),
        }
    }

    pub(crate) fn is_owner_thread(&self) -> bool {
        self.owner_thread_id == current_thread_id()
    }

    pub(crate) fn mark_destroyed(&self) {
        self.destroyed.store(true, Ordering::Release);
    }

    pub(crate) fn wait_for_idle(&self) {
        let guard = match self.active_calls_mu.lock() {
            Ok(guard) => guard,
            Err(poison) => poison.into_inner(),
        };
        let _guard = match self
            .active_calls_cv
            .wait_while(guard, |_| self.active_calls.load(Ordering::Acquire) != 0)
        {
            Ok(guard) => guard,
            Err(poison) => poison.into_inner(),
        };
    }
}

pub(crate) struct EngineGuard {
    pub(crate) slot: Arc<EngineSlot>,
}

impl Drop for EngineGuard {
    fn drop(&mut self) {
        let _active_calls_guard = match self.slot.active_calls_mu.lock() {
            Ok(guard) => guard,
            Err(poison) => poison.into_inner(),
        };
        let prev = self.slot.active_calls.fetch_sub(1, Ordering::AcqRel);
        if prev == 1 {
            self.slot.active_calls_cv.notify_all();
        }
    }
}

static REGISTRY: OnceLock<Mutex<HashMap<u32, Arc<EngineSlot>>>> = OnceLock::new();
static NEXT_ENGINE_ID: AtomicU32 = AtomicU32::new(1);

fn registry() -> &'static Mutex<HashMap<u32, Arc<EngineSlot>>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn current_thread_id() -> ThreadId {
    std::thread::current().id()
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

fn lock_registry<T>(f: impl FnOnce(&mut HashMap<u32, Arc<EngineSlot>>) -> T) -> T {
    let mut guard = match registry().lock() {
        Ok(guard) => guard,
        Err(poison) => poison.into_inner(),
    };
    f(&mut guard)
}

pub(crate) fn register_engine(engine: *mut ffi::zr_engine_t) -> Result<u32, i32> {
    let engine_id = alloc_engine_id()?;
    let slot = Arc::new(EngineSlot::new(engine));

    lock_registry(|map| {
        map.insert(engine_id, slot);
    });

    Ok(engine_id)
}

pub(crate) fn take_engine_for_owner(engine_id: u32) -> Option<Arc<EngineSlot>> {
    if engine_id == 0 {
        return None;
    }

    lock_registry(|map| {
        let slot = match map.get(&engine_id) {
            Some(slot) => slot,
            None => return None,
        };
        if !slot.is_owner_thread() {
            return None;
        }
        map.remove(&engine_id)
    })
}

pub(crate) fn get_engine_guard(engine_id: u32) -> Result<EngineGuard, i32> {
    if engine_id == 0 {
        return Err(ffi::ZR_ERR_INVALID_ARGUMENT);
    }

    lock_registry(|map| {
        let slot = match map.get(&engine_id) {
            Some(slot) => Arc::clone(slot),
            None => return Err(ffi::ZR_ERR_INVALID_ARGUMENT),
        };
        slot.active_calls.fetch_add(1, Ordering::Acquire);
        Ok(EngineGuard { slot })
    })
}
