# Benchmark Results

> 2026-02-20T17:29:13.971Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> Invocation: suite=all matchup=rezi-opentui scenario=all framework=all warmup=default iterations=default quick=yes io=pty opentuiDriver=core replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=warn cpuAffinity=none

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.78ms | 0.0% | 1.72ms–1.85ms | 542 ops/s | 92.30ms | 138.69ms | 0ns | 78.4MB | 17.1MB | 156.6KB | 0.00KB |
| OpenTUI | 1 | 4.58ms | 0.0% | 4.47ms–4.68ms | 39 ops/s | 1.28s | 229.89ms | 166.56ms | 137.4MB | 53.2MB | 504.8KB | 504.8KB |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 195µs | 0.0% | 174µs–220µs | 5.1K ops/s | 9.80ms | 28.46ms | 133µs | 65.9MB | 15.6MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 1.21ms | 0.0% | 1.05ms–1.37ms | 827 ops/s | 60.49ms | 48.66ms | 8.70ms | 98.9MB | 37.9MB | 10.2KB | 10.2KB |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 378µs | 0.0% | 337µs–420µs | 2.6K ops/s | 18.95ms | 43.49ms | 3.80ms | 79.2MB | 20.4MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 2.41ms | 0.0% | 2.25ms–2.62ms | 414 ops/s | 120.72ms | 137.93ms | 59.15ms | 123.1MB | 40.2MB | 19.8KB | 19.8KB |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.09ms | 0.0% | 1.03ms–1.15ms | 918 ops/s | 54.49ms | 60.24ms | 11.44ms | 115.5MB | 38.9MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 10.18ms | 0.0% | 9.94ms–10.46ms | 98 ops/s | 509.18ms | 331.99ms | 285.63ms | 175.2MB | 47.0MB | 79.2KB | 79.2KB |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.05ms | 0.0% | 1.98ms–2.12ms | 488 ops/s | 102.54ms | 139.90ms | 3.60ms | 144.9MB | 70.5MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 19.75ms | 0.0% | 19.20ms–20.33ms | 51 ops/s | 987.40ms | 473.37ms | 576.60ms | 183.7MB | 57.2MB | 153.4KB | 153.4KB |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 407µs | 0.0% | 390µs–429µs | 2.4K ops/s | 20.42ms | 22.77ms | 335µs | 64.8MB | 11.8MB | 23.2KB | 8.83KB |
| OpenTUI | 1 | 1.23ms | 0.0% | 1.04ms–1.42ms | 815 ops/s | 61.33ms | 22.90ms | 20.34ms | 92.8MB | 37.6MB | 12.3KB | 12.3KB |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.62ms | 0.0% | 1.56ms–1.68ms | 618 ops/s | 80.96ms | 80.91ms | 23.34ms | 150.2MB | 63.9MB | 43.9KB | 0.00KB |
| OpenTUI | 1 | 10.32ms | 0.0% | 10.07ms–10.60ms | 97 ops/s | 516.26ms | 374.12ms | 250.58ms | 180.9MB | 47.0MB | 88.6KB | 88.6KB |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.25ms | 0.0% | 2.12ms–2.40ms | 443 ops/s | 112.81ms | 210.64ms | 2.56ms | 118.3MB | 41.7MB | 577.3KB | 258.7KB |
| OpenTUI | 1 | 2.01ms | 0.0% | 1.90ms–2.15ms | 496 ops/s | 100.77ms | 104.32ms | 55.99ms | 117.9MB | 39.8MB | 434.9KB | 434.9KB |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 14.10ms | 0.0% | 13.22ms–15.02ms | 71 ops/s | 704.91ms | 890.44ms | 169.22ms | 180.8MB | 44.3MB | 207.1KB | 20.1KB |
| OpenTUI | 1 | 33.67ms | 0.0% | 33.15ms–34.20ms | 30 ops/s | 1.68s | 856.72ms | 903.98ms | 215.0MB | 81.6MB | 97.5KB | 97.5KB |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.02ms | 0.0% | 947µs–1.09ms | 984 ops/s | 50.84ms | 131.05ms | 0ns | 85.7MB | 17.1MB | 208.4KB | 86.0KB |
| OpenTUI | 1 | 1.44ms | 0.0% | 1.32ms–1.58ms | 693 ops/s | 72.17ms | 93.15ms | 33.68ms | 110.4MB | 39.0MB | 319.2KB | 319.2KB |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.27ms | 0.0% | 2.12ms–2.44ms | 439 ops/s | 113.87ms | 176.95ms | 24.60ms | 126.6MB | 52.9MB | 457.6KB | 227.6KB |
| OpenTUI | 1 | 2.60ms | 0.0% | 2.46ms–2.75ms | 385 ops/s | 129.87ms | 104.89ms | 92.96ms | 122.3MB | 40.0MB | 831.1KB | 831.1KB |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 693µs | 0.0% | 671µs–719µs | 1.4K ops/s | 34.81ms | 42.37ms | 3.40ms | 71.1MB | 17.7MB | 118.8KB | 56.7KB |
| OpenTUI | 1 | 1.22ms | 0.0% | 1.06ms–1.39ms | 822 ops/s | 60.82ms | 70.96ms | 26.24ms | 107.1MB | 38.2MB | 56.1KB | 56.1KB |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 374µs | 0.0% | 356µs–395µs | 2.7K ops/s | 18.73ms | 19.86ms | 420µs | 64.9MB | 11.0MB | 9.77KB | 5.57KB |
| OpenTUI | 1 | 1.18ms | 0.0% | 1.00ms–1.36ms | 844 ops/s | 59.23ms | 24.46ms | 17.35ms | 91.6MB | 37.6MB | 10.1KB | 10.1KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 442µs | 0.0% | 426µs–462µs | 2.3K ops/s | 22.16ms | 24.93ms | 6.08ms | 67.9MB | 14.9MB | 15.2KB | 6.48KB |
| OpenTUI | 1 | 1.39ms | 0.0% | 1.25ms–1.55ms | 720 ops/s | 69.49ms | 76.83ms | 43.38ms | 110.3MB | 38.9MB | 12.8KB | 12.8KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 843µs | 0.0% | 819µs–869µs | 1.2K ops/s | 42.20ms | 71.82ms | 0ns | 70.9MB | 17.5MB | 349.2KB | 63.7KB |
| OpenTUI | 1 | 1.37ms | 0.0% | 1.25ms–1.50ms | 730 ops/s | 68.47ms | 71.87ms | 50.15ms | 110.6MB | 38.9MB | 201.0KB | 201.0KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 921µs | 0.0% | 896µs–949µs | 1.1K ops/s | 46.08ms | 74.45ms | 410µs | 70.8MB | 18.0MB | 349.2KB | 173.8KB |
| OpenTUI | 1 | 1.39ms | 0.0% | 1.26ms–1.56ms | 717 ops/s | 69.78ms | 70.90ms | 50.54ms | 110.4MB | 38.9MB | 357.9KB | 357.9KB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 3.59ms | 0.0% | 3.55ms–3.64ms | 278 ops/s | 179.68ms | 207.71ms | 7.36ms | 76.3MB | 16.7MB | 408.6KB | 98.2KB |
| OpenTUI | 1 | 1.49ms | 0.0% | 1.34ms–1.66ms | 670 ops/s | 74.58ms | 82.41ms | 49.96ms | 109.6MB | 39.0MB | 309.0KB | 309.0KB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 849µs | 0.0% | 824µs–877µs | 1.2K ops/s | 42.49ms | 73.65ms | 374µs | 70.4MB | 17.7MB | 349.2KB | 27.7KB |
| OpenTUI | 1 | 1.31ms | 0.0% | 1.18ms–1.45ms | 764 ops/s | 65.46ms | 76.43ms | 46.43ms | 109.1MB | 38.8MB | 101.2KB | 101.2KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 835µs | 0.0% | 811µs–861µs | 1.2K ops/s | 41.83ms | 67.02ms | 5.73ms | 70.3MB | 17.9MB | 349.2KB | 45.5KB |
| OpenTUI | 1 | 1.30ms | 0.0% | 1.17ms–1.45ms | 768 ops/s | 65.08ms | 78.85ms | 41.37ms | 109.6MB | 38.8MB | 178.1KB | 178.1KB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.05ms | 0.0% | 972µs–1.12ms | 954 ops/s | 52.39ms | 126.88ms | 17.06ms | 90.4MB | 21.4MB | 210.1KB | 86.7KB |
| OpenTUI | 1 | 1.45ms | 0.0% | 1.33ms–1.60ms | 687 ops/s | 72.74ms | 99.23ms | 25.19ms | 109.7MB | 39.0MB | 322.9KB | 322.9KB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 489µs | 0.0% | 465µs–517µs | 2.0K ops/s | 24.50ms | 35.53ms | 0ns | 70.3MB | 17.4MB | 35.0KB | 6.54KB |
| OpenTUI | 1 | 1.46ms | 0.0% | 1.34ms–1.59ms | 685 ops/s | 73.01ms | 92.69ms | 29.74ms | 110.9MB | 38.9MB | 12.9KB | 12.9KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | OpenTUI |
|---|---:|
| startup | 2.6x slower [2.4x, 2.7x] |
| tree-construction (items=10) | 6.2x slower [4.8x, 7.9x] |
| tree-construction (items=100) | 6.4x slower [5.3x, 7.8x] |
| tree-construction (items=500) | 9.4x slower [8.6x, 10.2x] |
| tree-construction (items=1000) | 9.6x slower [9.0x, 10.3x] |
| rerender | 3.0x slower [2.4x, 3.7x] |
| content-update | 6.4x slower [6.0x, 6.8x] |
| layout-stress (rows=40,cols=4) | 1.1x faster [1.0x, 1.3x] (inconclusive) |
| scroll-stress (items=2000) | 2.4x slower [2.2x, 2.6x] |
| virtual-list (items=100000,viewport=40) | 1.4x slower [1.2x, 1.7x] |
| tables (rows=100,cols=8) | 1.1x slower [1.0x, 1.3x] |
| memory-profile | 1.8x slower [1.5x, 2.1x] |
| terminal-rerender | 3.2x slower [2.5x, 3.8x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 3.1x slower [2.7x, 3.6x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 1.6x slower [1.4x, 1.8x] |
| terminal-screen-transition (rows=40,cols=120) | 1.5x slower [1.3x, 1.7x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 2.4x faster [2.1x, 2.7x] |
| terminal-input-latency (rows=40,cols=120) | 1.5x slower [1.3x, 1.8x] |
| terminal-memory-soak (rows=40,cols=120) | 1.6x slower [1.4x, 1.8x] |
| terminal-virtual-list (items=100000,viewport=40) | 1.4x slower [1.2x, 1.6x] |
| terminal-table (rows=40,cols=8) | 3.0x slower [2.6x, 3.4x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 78.4MB | 17.1MB | +8.7MB | +6.9MB | N/A | N/A |
| startup | OpenTUI | 137.4MB | 53.2MB | +23.4MB | +12.4MB | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 65.9MB | 15.6MB | +3.3MB | +6.0MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI | 98.9MB | 37.9MB | +8.4MB | +391.0KB | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 79.2MB | 20.4MB | +7.7MB | +10.0MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI | 123.1MB | 40.2MB | +14.1MB | +1.8MB | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 115.5MB | 38.9MB | +23.5MB | +25.7MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI | 175.2MB | 47.0MB | +30.0MB | +7.0MB | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 144.9MB | 70.5MB | +31.9MB | +54.5MB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI | 183.7MB | 57.2MB | -1.4MB | +15.5MB | N/A | N/A |
| rerender | Rezi (native) | 64.8MB | 11.8MB | +424.0KB | +2.0MB | N/A | N/A |
| rerender | OpenTUI | 92.8MB | 37.6MB | +5.0MB | +216.0KB | N/A | N/A |
| content-update | Rezi (native) | 150.2MB | 63.9MB | +31.7MB | +49.4MB | N/A | N/A |
| content-update | OpenTUI | 180.9MB | 47.0MB | +32.2MB | +6.9MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 118.3MB | 41.7MB | +25.6MB | +30.0MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI | 117.9MB | 39.8MB | +13.1MB | +1.4MB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 180.8MB | 44.3MB | +556.0KB | +20.4MB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI | 215.0MB | 81.6MB | +7.2MB | +31.6MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 85.7MB | 17.1MB | +13.5MB | +6.4MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI | 110.4MB | 39.0MB | +13.1MB | +718.0KB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 126.6MB | 52.9MB | +48.3MB | +40.7MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI | 122.3MB | 40.0MB | +13.2MB | +1.5MB | N/A | N/A |
| memory-profile | Rezi (native) | 71.1MB | 17.7MB | +6.4MB | +7.6MB | 0.0000 KB/iter | yes |
| memory-profile | OpenTUI | 107.1MB | 38.2MB | +13.6MB | +552.0KB | N/A | N/A |
| terminal-rerender | Rezi (native) | 64.9MB | 11.0MB | +460.0KB | +1.4MB | N/A | N/A |
| terminal-rerender | OpenTUI | 91.6MB | 37.6MB | +5.1MB | +182.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 67.9MB | 14.9MB | +3.6MB | +5.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI | 110.3MB | 38.9MB | +13.9MB | +677.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 70.9MB | 17.5MB | +5.7MB | +7.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI | 110.6MB | 38.9MB | +15.1MB | +712.0KB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 70.8MB | 18.0MB | +6.4MB | +8.1MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI | 110.4MB | 38.9MB | +14.4MB | +609.0KB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 76.3MB | 16.7MB | +5.3MB | +6.5MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI | 109.6MB | 39.0MB | +12.6MB | +727.0KB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 70.4MB | 17.7MB | +6.0MB | +7.8MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI | 109.1MB | 38.8MB | +13.1MB | +790.0KB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 70.3MB | 17.9MB | +6.1MB | +8.0MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI | 109.6MB | 38.8MB | +15.1MB | +627.0KB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 90.4MB | 21.4MB | +18.0MB | +10.6MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI | 109.7MB | 39.0MB | +12.3MB | +728.0KB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 70.3MB | 17.4MB | +5.5MB | +7.7MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI | 110.9MB | 38.9MB | +13.3MB | +625.0KB | N/A | N/A |
