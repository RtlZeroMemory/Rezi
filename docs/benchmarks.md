# Benchmarks

Rezi includes a comprehensive benchmark suite comparing three rendering approaches:

- **Rezi (native)** — `createApp` → state update → view rebuild → diff → drawlist → `requestFrame`
- **Ink-on-Rezi** — React reconciler (`@rezi-ui/ink-compat`) → Rezi rendering engine
- **Ink** — React → Yoga → ANSI escape codes (the standard Ink pipeline)

All three paths go through their full render pipeline end-to-end. No shortcuts — each iteration produces a complete frame delivered to the backend.

## Running benchmarks

```bash
node --expose-gc packages/bench/dist/run.js
```

The `--expose-gc` flag is required for accurate memory profiling.

## Results

All benchmarks measured on Node v20.19.5, Linux x64.

### tree-construction (items=10)

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 57µs | 139µs | 353µs | 17.5K ops/s | 87.3MB | 24.7MB | 78.01ms | 112.1% |
| Ink-on-Rezi | 234µs | 391µs | 596µs | 4.3K ops/s | 92.5MB | 28.5MB | 190.17ms | 40.3% |
| Ink | 17.10ms | 32.93ms | 33.06ms | 58 ops/s | 113.3MB | 29.2MB | 567.61ms | 91.9% |

### tree-construction (items=100)

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 250µs | 567µs | 1.08ms | 4.0K ops/s | 134.7MB | 45.2MB | 180.98ms | 74.7% |
| Ink-on-Rezi | 1.29ms | 1.80ms | 2.03ms | 775 ops/s | 172.4MB | 82.4MB | 773.32ms | 17.6% |
| Ink | 19.57ms | 33.42ms | 37.68ms | 51 ops/s | 160.7MB | 71.0MB | 4.52s | 69.0% |

### tree-construction (items=500)

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 813µs | 1.34ms | 2.04ms | 1.2K ops/s | 186.1MB | 98.0MB | 516.72ms | 40.2% |
| Ink-on-Rezi | 5.97ms | 6.79ms | 8.77ms | 167 ops/s | 204.6MB | 60.7MB | 3.66s | 11.4% |
| Ink | 35.49ms | 60.10ms | 61.86ms | 28 ops/s | 267.5MB | 175.1MB | 22.76s | 30.0% |

### tree-construction (items=1000)

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1.66ms | 2.28ms | 2.89ms | 603 ops/s | 188.2MB | 99.1MB | 1.12s | 30.6% |
| Ink-on-Rezi | 12.85ms | 16.10ms | 18.31ms | 78 ops/s | 250.9MB | 158.5MB | 8.27s | 11.2% |
| Ink | 61.90ms | 78.45ms | 84.63ms | 16 ops/s | 360.4MB | 270.2MB | 46.52s | 11.6% |

### rerender

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 25µs | 69µs | 132µs | 38.9K ops/s | 142.1MB | 34.4MB | 77.09ms | 118.8% |
| Ink-on-Rezi | 58µs | 140µs | 192µs | 17.0K ops/s | 116.4MB | 33.2MB | 150.51ms | 78.1% |
| Ink | 16.64ms | 32.57ms | 32.86ms | 60 ops/s | 118.7MB | 33.7MB | 460.33ms | 96.5% |

### memory-profile

| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 128µs | 222µs | 321µs | 7.8K ops/s | 136.5MB | 51.4MB | 422.48ms | 69.5% |
| Ink-on-Rezi | 236µs | 355µs | 725µs | 4.2K ops/s | 154.5MB | 71.1MB | 633.85ms | 41.5% |
| Ink | 17.29ms | 32.91ms | 33.10ms | 58 ops/s | 125.6MB | 42.1MB | 2.48s | 90.6% |

## Speedup summary

| Scenario | Ink-on-Rezi vs Ink | Rezi native vs Ink |
|---|---:|---:|
| tree-construction (items=10) | 73.1x | 303x |
| tree-construction (items=100) | 15.2x | 78x |
| tree-construction (items=500) | 5.9x | 44x |
| tree-construction (items=1000) | 4.8x | 37x |
| rerender | 285x | 655x |
| memory-profile | 73.3x | 135x |

## Memory comparison

| Scenario | Framework | Peak RSS | Peak Heap | Mem Growth |
|---|---|---:|---:|---:|
| tree-construction (items=10) | Rezi (native) | 87.3MB | 24.7MB | +13.6MB |
| tree-construction (items=10) | Ink-on-Rezi | 92.5MB | 28.5MB | +9.1MB |
| tree-construction (items=10) | Ink | 113.3MB | 29.2MB | +6.3MB |
| tree-construction (items=100) | Rezi (native) | 134.7MB | 45.2MB | +28.5MB |
| tree-construction (items=100) | Ink-on-Rezi | 172.4MB | 82.4MB | +61.8MB |
| tree-construction (items=100) | Ink | 160.7MB | 71.0MB | +27.8MB |
| tree-construction (items=500) | Rezi (native) | 186.1MB | 98.0MB | +54.6MB |
| tree-construction (items=500) | Ink-on-Rezi | 204.6MB | 60.7MB | +34.0MB |
| tree-construction (items=500) | Ink | 267.5MB | 175.1MB | +47.9MB |
| tree-construction (items=1000) | Rezi (native) | 188.2MB | 99.1MB | +45.9MB |
| tree-construction (items=1000) | Ink-on-Rezi | 250.9MB | 158.5MB | +1.1MB |
| tree-construction (items=1000) | Ink | 360.4MB | 270.2MB | +105.6MB |
| rerender | Rezi (native) | 142.1MB | 34.4MB | -11.9MB |
| rerender | Ink-on-Rezi | 116.4MB | 33.2MB | +3.0MB |
| rerender | Ink | 118.7MB | 33.7MB | +7.2MB |
| memory-profile | Rezi (native) | 136.5MB | 51.4MB | +17.0MB |
| memory-profile | Ink-on-Rezi | 154.5MB | 71.1MB | +39.2MB |
| memory-profile | Ink | 125.6MB | 42.1MB | +9.4MB |

## What each scenario measures

### Tree construction

Measures the full render pipeline cost of building a widget tree from scratch: state update → view function → tree diff → drawlist serialization → frame delivery. Parameterized by item count (10, 100, 500, 1000). Each iteration produces a complete frame through the backend.

### Rerender

Measures the full pipeline cost of a single state change on an already-mounted application. Uses a small counter app to isolate per-update overhead. Each iteration: `app.update()` → dirty flag → view rebuild → diff → drawlist → `requestFrame()`.

### Memory profile

Measures memory allocation patterns during sustained rendering (2000 iterations). Tracks peak RSS, heap usage, and memory growth via periodic sampling with linear regression for leak detection.

## Methodology

- **Warmup**: 50–100 iterations discarded before measurement
- **GC**: Forced between frameworks via `--expose-gc`
- **Timing**: `performance.now()` per iteration, with full statistical analysis (mean, median, p95, p99, stddev, CV)
- **Backend stubs**: Each framework uses a backend stub that captures frames without terminal I/O:
    - Rezi native and ink-compat: `BenchBackend` (in-memory `RuntimeBackend` that records frame count/bytes)
    - Ink: `MeasuringStream` (Writable stream that records write count/bytes)
- **Pipeline equivalence**: All three frameworks go through their full render pipeline. Rezi native uses `createApp` → `app.view()` → `app.start()` → `app.update()` → `waitForFrame()`, same as ink-compat. Ink uses `render()` → `rerender()` → `waitForWrite()`.

## Interpretation notes

- **Ink's ~16ms floor**: Ink internally throttles renders to 32ms intervals. This means even trivially fast operations appear to take ~16ms on average. This is an architectural choice, not a benchmark artifact.
- **Rezi native vs Ink-on-Rezi**: The gap between these two shows the overhead of the React reconciler. For applications that need React compatibility, ink-compat is still dramatically faster than stock Ink.
- **Stability (CV)**: Coefficient of variation — lower means more consistent timing. Higher CV at small scales is expected because OS scheduling noise is proportionally larger relative to microsecond measurements.
