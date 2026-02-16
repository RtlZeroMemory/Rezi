# Benchmark Results

> 2026-02-16T06:57:58.155Z | Node v20.19.5 | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB

> Invocation: suite=terminal scenario=all framework=rezi-native warmup=50 iterations=800 quick=no io=stub

## terminal-rerender

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 26µs | 35µs | 24µs–28µs | 37.9K ops/s | 21.12ms | 47.14ms | 2.83ms | 64.0MB | 13.2MB | 181.30078125KB |

## terminal-frame-fill (rows=40, cols=120, dirtyLines=1)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 47µs | 48µs | 44µs–50µs | 21.1K ops/s | 37.88ms | 62.86ms | 14.19ms | 75.3MB | 24.6MB | 268.75KB |

## terminal-frame-fill (rows=40, cols=120, dirtyLines=40)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 113µs | 71µs | 109µs–118µs | 8.8K ops/s | 90.72ms | 131.21ms | 17.59ms | 85.6MB | 26.0MB | 5.5MB |

## terminal-virtual-list (items=100000, viewport=40)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 264µs | 156µs | 255µs–275µs | 3.8K ops/s | 211.49ms | 267.15ms | 29.96ms | 133.1MB | 67.4MB | 3.7MB |

## terminal-table (rows=40, cols=8)

| Framework | Mean | Std dev | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 67µs | 73µs | 63µs–72µs | 14.8K ops/s | 53.93ms | 107.13ms | 12.02ms | 76.1MB | 23.0MB | 645.15625KB |

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
| terminal-rerender | Rezi (native) | 64.0MB | 13.2MB | +5.1MB | +2.4MB | N/A | N/A |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=1) | Rezi (native) | 75.3MB | 24.6MB | +12.3MB | +16.3MB | N/A | N/A |
| terminal-frame-fill (rows=40, cols=120, dirtyLines=40) | Rezi (native) | 85.6MB | 26.0MB | +16.7MB | +5.9MB | N/A | N/A |
| terminal-virtual-list (items=100000, viewport=40) | Rezi (native) | 133.1MB | 67.4MB | +43.6MB | +19.4MB | N/A | N/A |
| terminal-table (rows=40, cols=8) | Rezi (native) | 76.1MB | 23.0MB | +13.8MB | +6.3MB | N/A | N/A |
