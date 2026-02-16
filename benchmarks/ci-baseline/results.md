# Benchmark Results

> 2026-02-16T08:10:03.477Z | Node v22.22.0 | Linux 6.14.0-1017-azure | linux x64 | AMD EPYC 7763 64-Core Processor (4 cores) | RAM 15990MB

> Invocation: suite=terminal scenario=all framework=rezi-native warmup=50 iterations=800 quick=no io=stub

## terminal-rerender

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 74µs | 24µs | 72µs–76µs | 13.4K ops/s | 59.90ms | 80.52ms | 5.83ms | 76.1MB | 16.2MB | 181.30078125KB |

## terminal-frame-fill (rows=40, cols=120, dirtyLines=1)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 155µs | 78µs | 150µs–160µs | 6.4K ops/s | 125.01ms | 192.20ms | 17.86ms | 90.1MB | 24.3MB | 268.75KB |

## terminal-frame-fill (rows=40, cols=120, dirtyLines=40)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 265µs | 153µs | 255µs–275µs | 3.8K ops/s | 213.08ms | 318.21ms | 34.28ms | 97.3MB | 30.7MB | 5.5MB |

## terminal-virtual-list (items=100000, viewport=40)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 634µs | 361µs | 612µs–660µs | 1.6K ops/s | 508.56ms | 688.11ms | 69.67ms | 150.8MB | 70.4MB | 3.7MB |

## terminal-table (rows=40, cols=8)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 194µs | 97µs | 188µs–201µs | 5.1K ops/s | 156.41ms | 260.92ms | 20.80ms | 90.9MB | 27.9MB | 645.15625KB |

## Relative Performance (vs Rezi native)

> "Xx slower" = Rezi native is X times faster. "Xx faster" = other framework is faster.

| Scenario |  |
|---||
| terminal-rerender |  |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=1) |  |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=40) |  |
| terminal-virtual-list (items=100000, viewport=40) |  |
| terminal-table (rows=40, cols=8) |  |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| terminal-rerender | Rezi (native) | 76.1MB | 16.2MB | +8.7MB | +6.1MB | N/A | N/A |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=1) | Rezi (native) | 90.1MB | 24.3MB | +22.3MB | +12.3MB | N/A | N/A |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=40) | Rezi (native) | 97.3MB | 30.7MB | +27.4MB | +21.2MB | N/A | N/A |
| terminal-virtual-list (items=100000, viewport=40) | Rezi (native) | 150.8MB | 70.4MB | +71.2MB | +28.5MB | N/A | N/A |
| terminal-table (rows=40, cols=8) | Rezi (native) | 90.9MB | 27.9MB | +20.6MB | +14.8MB | N/A | N/A |
