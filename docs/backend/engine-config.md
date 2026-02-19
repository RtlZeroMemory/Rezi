# Engine Configuration

The `AppConfig` type lets you tune runtime limits, rendering behavior, and frame
pipelining when creating a Rezi application. Every property is optional; sensible
defaults are applied automatically.

## Quick Example

```typescript
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: { count: 0 },
  config: {
    fpsCap: 30,
    maxDrawlistBytes: 4 << 20, // 4 MiB
    drawlistValidateParams: false, // trusted inputs, skip validation
    maxFramesInFlight: 2,
  },
});
```

## AppConfig Reference

```typescript
type AppConfig = Readonly<{
  fpsCap?: number;
  maxEventBytes?: number;
  maxDrawlistBytes?: number;
  useV2Cursor?: boolean;
  drawlistValidateParams?: boolean;
  drawlistReuseOutputBuffer?: boolean;
  drawlistEncodedStringCacheCap?: number;
  maxFramesInFlight?: number;
  internal_onRender?: (metrics: AppRenderMetrics) => void;
  internal_onLayout?: (snapshot: AppLayoutSnapshot) => void;
}>;
```

`internal_onRender` and `internal_onLayout` are internal inspector hooks and
default to `undefined`.

### fpsCap

| Detail   | Value |
|----------|-------|
| Type     | `number` (positive integer) |
| Default  | `60` |

Controls the maximum frames per second the runtime will attempt to render. The
runtime uses this value for frame pacing -- it will not render faster than the
specified rate even if the backend can consume frames faster. Lower values reduce
CPU usage at the cost of visual responsiveness.

```typescript
config: {
  fpsCap: 30, // cap at 30 fps for a low-power scenario
}
```

### maxEventBytes

| Detail   | Value |
|----------|-------|
| Type     | `number` (positive integer) |
| Default  | `1 << 20` (1 MiB) |

Upper limit on the byte size of a single event batch received from the backend.
If the backend sends an event batch larger than this value, it is rejected. This
acts as a safety valve to prevent unbounded memory growth from a misbehaving
backend or extremely large paste events.

### maxDrawlistBytes

| Detail   | Value |
|----------|-------|
| Type     | `number` (positive integer) |
| Default  | `2 << 20` (2 MiB) |

Maximum byte size of a single rendered drawlist frame. If the builder exceeds
this limit during frame construction, the frame is rejected. Increase this value
for applications with very large terminal viewports or extremely dense UIs.

```typescript
config: {
  maxDrawlistBytes: 4 << 20, // 4 MiB for a large dashboard
}
```

### useV2Cursor

| Detail   | Value |
|----------|-------|
| Type     | `boolean` |
| Default  | `false` |

Enables the v2 cursor protocol, which adds a `SET_CURSOR` command to the
drawlist. When enabled, the native engine can set the terminal cursor position
and shape directly, which is required for proper cursor rendering in `Input`
widgets.

Both the app config and the backend must agree on this setting. If you set
`useV2Cursor: true` in the app config, the backend must also be created with
`useDrawlistV2: true`, or the runtime will throw a validation error.

```typescript
import { createNodeApp, createNodeBackend } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: {},
  config: { useV2Cursor: true },
  // The backend must also opt in:
  // createNodeBackend({ useDrawlistV2: true })
});
```

### drawlistValidateParams

| Detail   | Value |
|----------|-------|
| Type     | `boolean` |
| Default  | `true` |

When `true`, the drawlist builder validates every command parameter (coordinates,
dimensions, color values, string lengths) before encoding. This catches bugs
early but adds overhead to every draw call.

Set to `false` when inputs are trusted and you want maximum rendering throughput.
For `createApp`/`createNodeApp`, the app-level default is `true`. If you
instantiate `WidgetRenderer` directly and omit `drawlistValidateParams`, that
constructor defaults builder validation to `false` for widget render paths.

```typescript
config: {
  drawlistValidateParams: false, // skip validation for performance
}
```

### drawlistReuseOutputBuffer

| Detail   | Value |
|----------|-------|
| Type     | `boolean` |
| Default  | `true` (in the app runtime) |

When `true`, the drawlist builder reuses its output `ArrayBuffer` across frames
instead of allocating a new one each time. This eliminates per-frame allocation
overhead and reduces GC pressure.

This optimization is safe when the runtime enforces a single in-flight frame
(the default). If you increase `maxFramesInFlight` above 1, the runtime
automatically manages separate buffers for each in-flight frame, so this setting
remains safe regardless of the pipelining depth.

### drawlistEncodedStringCacheCap

| Detail   | Value |
|----------|-------|
| Type     | `number` (non-negative integer) |
| Default  | `1024` |

Maximum number of UTF-8 encoded strings to cache across frames. The drawlist
builder maintains a cache of encoded strings to avoid redundant
`TextEncoder.encode()` calls for repeated text content (labels, titles, static
UI strings). When the cache reaches this capacity, it is flushed entirely and
rebuilt from scratch on subsequent frames.

Set to `0` to disable the cache entirely. Increase above the default if your
application renders many unique but repeated strings across frames.

```typescript
config: {
  drawlistEncodedStringCacheCap: 2048, // larger cache for text-heavy UIs
}
```

### maxFramesInFlight

| Detail   | Value |
|----------|-------|
| Type     | `number` (1--4) |
| Default  | `1` |

Controls how many rendered frames can be in-flight (submitted to the backend but
not yet acknowledged) simultaneously. The value is clamped to the range `[1, 4]`.

- **1 (default):** No pipelining. The runtime waits for the backend to
  acknowledge the current frame before rendering the next one. Simplest model,
  lowest memory usage.
- **2--4:** Enables frame pipelining. The runtime can render ahead while the
  backend is still processing a previous frame. This reduces perceived latency
  on backends with non-trivial frame processing time, at the cost of higher
  memory usage (one drawlist buffer per in-flight frame).

```typescript
config: {
  maxFramesInFlight: 2, // allow one frame of look-ahead
}
```

## Default Values Summary

| Property                        | Default       |
|---------------------------------|---------------|
| `fpsCap`                        | `60`          |
| `maxEventBytes`                 | `1048576` (1 MiB) |
| `maxDrawlistBytes`              | `2097152` (2 MiB) |
| `useV2Cursor`                   | `false`       |
| `drawlistValidateParams`        | `true` (app runtime default) |
| `drawlistReuseOutputBuffer`     | `true`        |
| `drawlistEncodedStringCacheCap` | `1024`        |
| `maxFramesInFlight`             | `1`           |

## See Also

- [Node backend](node.md)
- [Terminal capabilities](terminal-caps.md)
- [Packages: @rezi-ui/node](../packages/node.md)
