/*
  include/zr/zr_version.h — Pinned public ABI and binary format versions.

  Why: Centralizes determinism-critical version pins so callers can negotiate
  capabilities at engine creation without pulling platform code.
*/

#ifndef ZR_ZR_VERSION_H_INCLUDED
#define ZR_ZR_VERSION_H_INCLUDED

/*
  NOTE: These version pins are part of the determinism contract. They must not
  be overridden by downstream builds.
*/
#if defined(ZR_LIBRARY_VERSION_MAJOR) || defined(ZR_LIBRARY_VERSION_MINOR) || defined(ZR_LIBRARY_VERSION_PATCH) ||     \
    defined(ZR_ENGINE_ABI_MAJOR) || defined(ZR_ENGINE_ABI_MINOR) || defined(ZR_ENGINE_ABI_PATCH) ||                    \
    defined(ZR_DRAWLIST_VERSION_V1) || defined(ZR_DRAWLIST_VERSION_V2) || defined(ZR_EVENT_BATCH_VERSION_V1)
#error "Zireael version pins are locked; do not override ZR_*_VERSION_* macros."
#endif

/* Library version (v1.3.8). */
#define ZR_LIBRARY_VERSION_MAJOR (1u)
#define ZR_LIBRARY_VERSION_MINOR (3u)
#define ZR_LIBRARY_VERSION_PATCH (8u)

/* Engine ABI version (v1.1.0). */
#define ZR_ENGINE_ABI_MAJOR (1u)
#define ZR_ENGINE_ABI_MINOR (1u)
#define ZR_ENGINE_ABI_PATCH (0u)

/* Drawlist binary format versions. */
#define ZR_DRAWLIST_VERSION_V1 (1u)
#define ZR_DRAWLIST_VERSION_V2 (2u)

/* Packed event batch binary format versions. */
#define ZR_EVENT_BATCH_VERSION_V1 (1u)

#endif /* ZR_ZR_VERSION_H_INCLUDED */
