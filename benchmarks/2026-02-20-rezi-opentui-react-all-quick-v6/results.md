# Benchmark Results

> 2026-02-20T17:29:42.098Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> Invocation: suite=all matchup=rezi-opentui scenario=all framework=all warmup=default iterations=default quick=yes io=pty opentuiDriver=react replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=warn cpuAffinity=none

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.71ms | 0.0% | 1.63ms–1.79ms | 564 ops/s | 88.58ms | 136.75ms | 332µs | 83.1MB | 17.1MB | 156.6KB | 0.00KB |
| OpenTUI | 1 | 7.98ms | 0.0% | 7.72ms–8.24ms | 34 ops/s | 1.46s | 631.66ms | 180.80ms | 207.6MB | 72.2MB | 672.5KB | 672.5KB |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 205µs | 0.0% | 180µs–235µs | 4.9K ops/s | 10.31ms | 29.82ms | 0ns | 66.7MB | 15.5MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 3.52ms | 0.0% | 3.23ms–3.81ms | 284 ops/s | 175.82ms | 216.99ms | 18.25ms | 160.4MB | 50.9MB | 39.5KB | 39.5KB |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 372µs | 0.0% | 331µs–415µs | 2.7K ops/s | 18.65ms | 46.60ms | 0ns | 79.3MB | 20.4MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 14.48ms | 0.0% | 13.57ms–15.44ms | 69 ops/s | 723.89ms | 981.41ms | 273.66ms | 465.8MB | 127.9MB | 474.4KB | 474.4KB |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.12ms | 0.0% | 1.05ms–1.19ms | 895 ops/s | 55.87ms | 60.87ms | 12.58ms | 115.9MB | 38.6MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 78.09ms | 0.0% | 75.57ms–80.74ms | 13 ops/s | 3.90s | 4.36s | 1.10s | 1.56GB | 681.5MB | 2.3MB | 2.3MB |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.03ms | 0.0% | 1.96ms–2.11ms | 492 ops/s | 101.61ms | 114.12ms | 28.00ms | 145.0MB | 70.8MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 159.04ms | 0.0% | 151.06ms–166.59ms | 6 ops/s | 7.95s | 9.03s | 1.82s | 2.99GB | 1.46GB | 5.5MB | 5.5MB |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 415µs | 0.0% | 399µs–436µs | 2.4K ops/s | 20.86ms | 23.23ms | 15µs | 65.2MB | 11.9MB | 23.2KB | 8.83KB |
| OpenTUI | 1 | 2.68ms | 0.0% | 2.46ms–2.91ms | 373 ops/s | 133.96ms | 145.20ms | 11.29ms | 121.9MB | 40.3MB | 19.6KB | 19.6KB |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.59ms | 0.0% | 1.53ms–1.66ms | 627 ops/s | 79.77ms | 97.85ms | 4.16ms | 146.8MB | 61.7MB | 43.9KB | 0.00KB |
| OpenTUI | 1 | 83.44ms | 0.0% | 79.69ms–87.34ms | 12 ops/s | 4.17s | 5.93s | 738.70ms | 1.96GB | 729.7MB | 3.4MB | 3.4MB |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.18ms | 0.0% | 2.06ms–2.29ms | 460 ops/s | 108.80ms | 159.43ms | 36.16ms | 117.7MB | 45.6MB | 577.3KB | 258.7KB |
| OpenTUI | 1 | 18.89ms | 0.0% | 18.29ms–19.55ms | 53 ops/s | 944.55ms | 1.21s | 359.02ms | 518.4MB | 185.6MB | 508.3KB | 508.3KB |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 14.25ms | 0.0% | 13.36ms–15.18ms | 70 ops/s | 712.79ms | 915.00ms | 159.17ms | 178.5MB | 57.0MB | 207.1KB | 20.1KB |
| OpenTUI | 1 | 431.08ms | 0.0% | 416.64ms–445.37ms | 2 ops/s | 21.55s | 24.71s | 5.41s | 7.44GB | 3.26GB | 299.0KB | 299.0KB |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 989µs | 0.0% | 925µs–1.05ms | 1.0K ops/s | 49.49ms | 133.41ms | 0ns | 85.5MB | 17.3MB | 208.4KB | 86.0KB |
| OpenTUI | 1 | 7.21ms | 0.0% | 6.69ms–7.73ms | 139 ops/s | 360.50ms | 478.39ms | 154.29ms | 298.2MB | 85.3MB | 356.3KB | 356.3KB |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.31ms | 0.0% | 2.14ms–2.48ms | 433 ops/s | 115.45ms | 187.05ms | 21.22ms | 128.8MB | 52.8MB | 457.6KB | 227.6KB |
| OpenTUI | 1 | 32.06ms | 0.0% | 30.72ms–33.48ms | 31 ops/s | 1.60s | 2.08s | 430.07ms | 1005.7MB | 394.4MB | 865.6KB | 865.6KB |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 703µs | 0.0% | 679µs–729µs | 1.4K ops/s | 35.29ms | 37.77ms | 9.45ms | 71.1MB | 17.7MB | 118.8KB | 56.7KB |
| OpenTUI | 1 | 3.30ms | 0.0% | 3.04ms–3.59ms | 303 ops/s | 165.26ms | 134.98ms | 79.86ms | 143.0MB | 46.2MB | 70.9KB | 70.9KB |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 375µs | 0.0% | 356µs–396µs | 2.7K ops/s | 18.78ms | 20.38ms | 0ns | 64.9MB | 11.0MB | 9.77KB | 5.57KB |
| OpenTUI | 1 | 2.73ms | 0.0% | 2.49ms–2.98ms | 366 ops/s | 136.63ms | 92.47ms | 14.35ms | 103.0MB | 39.2MB | 14.0KB | 14.0KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 444µs | 0.0% | 429µs–464µs | 2.2K ops/s | 22.27ms | 31.27ms | 0ns | 67.6MB | 14.8MB | 15.2KB | 6.48KB |
| OpenTUI | 1 | 3.56ms | 0.0% | 3.30ms–3.83ms | 281 ops/s | 178.04ms | 188.12ms | 38.40ms | 165.0MB | 51.7MB | 232.6KB | 232.6KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 841µs | 0.0% | 820µs–864µs | 1.2K ops/s | 42.13ms | 71.19ms | 0ns | 70.3MB | 17.7MB | 349.2KB | 63.7KB |
| OpenTUI | 1 | 3.65ms | 0.0% | 3.32ms–3.99ms | 274 ops/s | 182.42ms | 184.61ms | 61.34ms | 162.9MB | 51.2MB | 307.4KB | 307.4KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 929µs | 0.0% | 904µs–957µs | 1.1K ops/s | 46.48ms | 70.51ms | 4.95ms | 70.8MB | 18.0MB | 349.2KB | 173.8KB |
| OpenTUI | 1 | 3.58ms | 0.0% | 3.31ms–3.88ms | 279 ops/s | 179.25ms | 189.03ms | 39.61ms | 165.2MB | 51.8MB | 362.4KB | 362.4KB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 3.62ms | 0.0% | 3.57ms–3.67ms | 276 ops/s | 180.85ms | 210.95ms | 4.19ms | 76.6MB | 16.7MB | 408.6KB | 98.2KB |
| OpenTUI | 1 | 3.71ms | 0.0% | 3.39ms–4.05ms | 269 ops/s | 185.77ms | 175.88ms | 67.65ms | 165.1MB | 51.7MB | 391.4KB | 391.4KB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 871µs | 0.0% | 844µs–900µs | 1.1K ops/s | 43.60ms | 60.80ms | 13.22ms | 70.4MB | 17.6MB | 349.2KB | 27.7KB |
| OpenTUI | 1 | 3.50ms | 0.0% | 3.22ms–3.80ms | 285 ops/s | 175.29ms | 173.77ms | 49.81ms | 163.3MB | 51.4MB | 268.4KB | 268.4KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 832µs | 0.0% | 807µs–860µs | 1.2K ops/s | 41.67ms | 61.41ms | 10.47ms | 70.5MB | 17.9MB | 349.2KB | 45.5KB |
| OpenTUI | 1 | 3.60ms | 0.0% | 3.31ms–3.90ms | 278 ops/s | 179.95ms | 181.37ms | 57.56ms | 164.9MB | 51.6MB | 298.1KB | 298.1KB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.07ms | 0.0% | 998µs–1.15ms | 934 ops/s | 53.53ms | 127.16ms | 22.64ms | 90.1MB | 21.4MB | 210.1KB | 86.7KB |
| OpenTUI | 1 | 8.73ms | 0.0% | 8.19ms–9.33ms | 114 ops/s | 436.72ms | 637.09ms | 138.16ms | 354.9MB | 98.6MB | 383.4KB | 383.4KB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 492µs | 0.0% | 465µs–524µs | 2.0K ops/s | 24.63ms | 35.83ms | 0ns | 70.1MB | 17.5MB | 35.0KB | 6.54KB |
| OpenTUI | 1 | 3.60ms | 0.0% | 3.29ms–3.91ms | 278 ops/s | 179.96ms | 196.25ms | 37.73ms | 169.2MB | 52.3MB | 178.1KB | 178.1KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | OpenTUI |
|---|---:|
| startup | 4.7x slower [4.3x, 5.1x] |
| tree-construction (items=10) | 17.1x slower [13.8x, 21.2x] |
| tree-construction (items=100) | 38.9x slower [32.7x, 46.6x] |
| tree-construction (items=500) | 70.0x slower [63.8x, 77.0x] |
| tree-construction (items=1000) | 78.3x slower [71.8x, 85.2x] |
| rerender | 6.4x slower [5.6x, 7.3x] |
| content-update | 52.3x slower [48.0x, 57.1x] |
| layout-stress (rows=40,cols=4) | 8.7x slower [8.0x, 9.5x] |
| scroll-stress (items=2000) | 30.2x slower [27.4x, 33.3x] |
| virtual-list (items=100000,viewport=40) | 7.3x slower [6.4x, 8.4x] |
| tables (rows=100,cols=8) | 13.9x slower [12.4x, 15.6x] |
| memory-profile | 4.7x slower [4.2x, 5.3x] |
| terminal-rerender | 7.3x slower [6.3x, 8.4x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 8.0x slower [7.1x, 8.9x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 4.3x slower [3.8x, 4.9x] |
| terminal-screen-transition (rows=40,cols=120) | 3.9x slower [3.5x, 4.3x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 1.0x slower [0.9x, 1.1x] (inconclusive) |
| terminal-input-latency (rows=40,cols=120) | 4.0x slower [3.6x, 4.5x] |
| terminal-memory-soak (rows=40,cols=120) | 4.3x slower [3.9x, 4.8x] |
| terminal-virtual-list (items=100000,viewport=40) | 8.2x slower [7.1x, 9.4x] |
| terminal-table (rows=40,cols=8) | 7.3x slower [6.3x, 8.4x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 83.1MB | 17.1MB | +13.2MB | +6.9MB | N/A | N/A |
| startup | OpenTUI | 207.6MB | 72.2MB | +66.1MB | +21.0MB | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 66.7MB | 15.5MB | +4.6MB | +5.9MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI | 160.4MB | 50.9MB | +34.1MB | +9.7MB | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 79.3MB | 20.4MB | +7.3MB | +10.0MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI | 465.8MB | 127.9MB | +268.0MB | +66.5MB | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 115.9MB | 38.6MB | +23.7MB | +25.5MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI | 1.56GB | 681.5MB | +1.10GB | +545.4MB | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 145.0MB | 70.8MB | +31.8MB | +54.8MB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI | 2.99GB | 1.46GB | +2.24GB | +1.28GB | N/A | N/A |
| rerender | Rezi (native) | 65.2MB | 11.9MB | +736.0KB | +2.2MB | N/A | N/A |
| rerender | OpenTUI | 121.9MB | 40.3MB | +25.3MB | +1.8MB | N/A | N/A |
| content-update | Rezi (native) | 146.8MB | 61.7MB | +30.9MB | +47.2MB | N/A | N/A |
| content-update | OpenTUI | 1.96GB | 729.7MB | +1.44GB | +550.1MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 117.7MB | 45.6MB | +22.2MB | +33.9MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI | 518.4MB | 185.6MB | +308.3MB | +116.3MB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 178.5MB | 57.0MB | -6.2MB | +33.2MB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI | 7.44GB | 3.26GB | +5.81GB | +2.67GB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 85.5MB | 17.3MB | +13.0MB | +6.7MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI | 298.2MB | 85.3MB | +140.3MB | +36.1MB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 128.8MB | 52.8MB | +51.2MB | +40.7MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI | 1005.7MB | 394.4MB | +693.3MB | +307.5MB | N/A | N/A |
| memory-profile | Rezi (native) | 71.1MB | 17.7MB | +6.3MB | +7.5MB | 0.0000 KB/iter | yes |
| memory-profile | OpenTUI | 143.0MB | 46.2MB | +35.4MB | +6.3MB | N/A | N/A |
| terminal-rerender | Rezi (native) | 64.9MB | 11.0MB | +560.0KB | +1.4MB | N/A | N/A |
| terminal-rerender | OpenTUI | 103.0MB | 39.2MB | +11.6MB | +998.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 67.6MB | 14.8MB | +3.3MB | +5.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI | 165.0MB | 51.7MB | +43.7MB | +10.5MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 70.3MB | 17.7MB | +5.4MB | +7.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI | 162.9MB | 51.2MB | +44.0MB | +10.0MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 70.8MB | 18.0MB | +6.1MB | +8.0MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI | 165.2MB | 51.8MB | +43.0MB | +10.3MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 76.6MB | 16.7MB | +5.2MB | +6.6MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI | 165.1MB | 51.7MB | +44.4MB | +10.4MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 70.4MB | 17.6MB | +5.6MB | +7.7MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI | 163.3MB | 51.4MB | +44.6MB | +10.4MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 70.5MB | 17.9MB | +6.0MB | +8.0MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI | 164.9MB | 51.6MB | +45.0MB | +10.3MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 90.1MB | 21.4MB | +17.6MB | +10.4MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI | 354.9MB | 98.6MB | +190.2MB | +47.4MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 70.1MB | 17.5MB | +6.0MB | +7.8MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI | 169.2MB | 52.3MB | +47.9MB | +11.0MB | N/A | N/A |
