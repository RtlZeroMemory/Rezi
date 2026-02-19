# Benchmark Results

> 2026-02-19T14:56:50.333Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> Invocation: suite=terminal scenario=all framework=all warmup=default iterations=default quick=no io=pty replicates=7 discardFirstReplicate=yes shuffleFrameworkOrder=yes shuffleSeed=2026-02-19-terminal-v2 envCheck=warn cpuAffinity=0-7

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 316µs | 0.6% | 315µs–318µs | 3.1K ops/s | 317.56ms | 344.30ms | 29.65ms | 77.8MB | 18.8MB | 195.8KB | 12.9MB |
| Ink | 6 | 17.55ms | 0.1% | 17.54ms–17.55ms | 57 ops/s | 17.55s | 722.76ms | 79.36ms | 120.1MB | 38.3MB | 84.1KB | 95.7MB |
| OpenTUI | 6 | 2.58ms | 0.5% | 2.57ms–2.59ms | 387 ops/s | 2.58s | 685.38ms | 413.81ms | 152.3MB | 53.1MB | 149.5KB | 149.5MB |
| blessed | 6 | 132µs | 3.5% | 129µs–136µs | 7.5K ops/s | 133.50ms | 149.75ms | 35.51ms | 73.4MB | 20.0MB | 16.7KB | 18.5MB |
| Ratatui (Rust) | 6 | 76µs | 2.4% | 74µs–77µs | 13.2K ops/s | 75.71ms | 54.80ms | 28.64ms | 5.9MB | n/a | 28.1KB | 28.1MB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 353µs | 0.8% | 351µs–356µs | 2.8K ops/s | 177.39ms | 202.73ms | 17.68ms | 82.9MB | 24.1MB | 152.3KB | 17.7MB |
| Ink | 6 | 21.97ms | 0.5% | 21.88ms–22.07ms | 46 ops/s | 10.99s | 3.46s | 200.18ms | 128.3MB | 42.9MB | 292.4KB | 343.8MB |
| OpenTUI | 6 | 3.97ms | 9.4% | 3.73ms–4.31ms | 254 ops/s | 1.98s | 1.50s | 679.20ms | 487.3MB | 137.8MB | 2.1MB | 2.15GB |
| blessed | 6 | 139µs | 1.4% | 137µs–141µs | 7.1K ops/s | 70.20ms | 92.37ms | 11.13ms | 75.2MB | 19.9MB | 13.8KB | 16.4MB |
| Ratatui (Rust) | 6 | 204µs | 6.7% | 197µs–217µs | 4.9K ops/s | 102.28ms | 98.29ms | 14.20ms | 6.0MB | n/a | 23.6KB | 23.6MB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 673µs | 0.5% | 671µs–676µs | 1.5K ops/s | 337.37ms | 358.95ms | 23.54ms | 86.6MB | 28.8MB | 3.4MB | 541.2MB |
| Ink | 6 | 22.11ms | 0.3% | 22.05ms–22.16ms | 45 ops/s | 11.06s | 3.69s | 227.27ms | 155.6MB | 64.2MB | 536.8KB | 611.3MB |
| OpenTUI | 6 | 3.91ms | 0.8% | 3.88ms–3.93ms | 256 ops/s | 1.96s | 1.52s | 614.48ms | 488.6MB | 137.5MB | 2.7MB | 2.70GB |
| blessed | 6 | 266µs | 2.3% | 261µs–271µs | 3.7K ops/s | 133.50ms | 150.74ms | 14.03ms | 75.6MB | 19.2MB | 543.6KB | 599.7MB |
| Ratatui (Rust) | 6 | 213µs | 0.4% | 212µs–213µs | 4.7K ops/s | 106.39ms | 103.42ms | 13.85ms | 5.9MB | n/a | 540.5KB | 540.5MB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 739µs | 0.9% | 734µs–744µs | 1.4K ops/s | 740.55ms | 766.12ms | 40.60ms | 99.7MB | 29.5MB | 6.8MB | 3.06GB |
| Ink | 6 | 22.03ms | 0.3% | 21.98ms–22.10ms | 45 ops/s | 22.04s | 7.26s | 425.51ms | 189.4MB | 105.8MB | 2.0MB | 2.21GB |
| OpenTUI | 6 | 4.28ms | 2.3% | 4.20ms–4.37ms | 234 ops/s | 4.28s | 3.08s | 1.36s | 828.6MB | 280.4MB | 6.4MB | 6.41GB |
| blessed | 6 | 329µs | 1.3% | 325µs–332µs | 3.0K ops/s | 329.85ms | 343.52ms | 36.48ms | 88.0MB | 25.5MB | 2.8MB | 3.07GB |
| Ratatui (Rust) | 6 | 282µs | 0.7% | 280µs–284µs | 3.5K ops/s | 282.07ms | 248.37ms | 62.02ms | 5.9MB | n/a | 2.7MB | 2.72GB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 3.42ms | 0.8% | 3.40ms–3.44ms | 292 ops/s | 4.11s | 4.12s | 79.20ms | 111.2MB | 43.0MB | 9.6MB | 1.86GB |
| Ink | 6 | 25.09ms | 0.5% | 25.00ms–25.20ms | 40 ops/s | 30.12s | 12.95s | 593.63ms | 194.3MB | 100.4MB | 3.1MB | 3.44GB |
| OpenTUI | 6 | 4.67ms | 2.1% | 4.59ms–4.76ms | 214 ops/s | 5.61s | 4.30s | 1.74s | 967.9MB | 306.0MB | 8.3MB | 8.26GB |
| blessed | 6 | 364µs | 1.2% | 361µs–368µs | 2.7K ops/s | 438.70ms | 449.78ms | 39.91ms | 87.2MB | 24.2MB | 1.5MB | 1.60GB |
| Ratatui (Rust) | 6 | 235µs | 2.6% | 231µs–241µs | 4.2K ops/s | 282.59ms | 264.40ms | 41.98ms | 6.0MB | n/a | 1.7MB | 1.71GB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 662µs | 1.3% | 655µs–669µs | 1.5K ops/s | 663.48ms | 714.74ms | 38.96ms | 82.4MB | 21.8MB | 6.8MB | 419.4MB |
| Ink | 6 | 22.34ms | 0.4% | 22.29ms–22.41ms | 45 ops/s | 22.35s | 7.33s | 408.40ms | 194.9MB | 111.1MB | 1009.3KB | 1.13GB |
| OpenTUI | 6 | 4.37ms | 2.6% | 4.28ms–4.46ms | 229 ops/s | 4.37s | 3.22s | 1.33s | 829.0MB | 280.8MB | 4.9MB | 4.88GB |
| blessed | 6 | 239µs | 1.2% | 237µs–242µs | 4.2K ops/s | 240.16ms | 263.35ms | 25.84ms | 76.2MB | 18.7MB | 628.0KB | 692.4MB |
| Ratatui (Rust) | 6 | 202µs | 1.0% | 200µs–204µs | 5.0K ops/s | 202.00ms | 192.26ms | 30.05ms | 6.0MB | n/a | 435.6KB | 435.6MB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 641µs | 0.5% | 639µs–644µs | 1.6K ops/s | 771.28ms | 778.91ms | 40.49ms | 105.3MB | 32.3MB | 8.2MB | 914.4MB |
| Ink | 6 | 22.04ms | 0.3% | 21.99ms–22.11ms | 45 ops/s | 26.46s | 8.76s | 469.00ms | 205.3MB | 115.3MB | 1.0MB | 1.21GB |
| OpenTUI | 6 | 4.62ms | 1.7% | 4.56ms–4.69ms | 217 ops/s | 5.54s | 4.25s | 1.73s | 990.3MB | 303.8MB | 6.6MB | 6.58GB |
| blessed | 6 | 237µs | 1.1% | 234µs–239µs | 4.2K ops/s | 285.38ms | 292.74ms | 43.06ms | 79.2MB | 24.2MB | 1000.4KB | 1.10GB |
| Ratatui (Rust) | 6 | 210µs | 1.6% | 208µs–213µs | 4.8K ops/s | 252.47ms | 245.60ms | 38.53ms | 5.9MB | n/a | 935.2KB | 935.2MB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 674µs | 0.8% | 669µs–678µs | 1.5K ops/s | 675.33ms | 700.20ms | 75.93ms | 147.6MB | 75.1MB | 4.1MB | 1.43GB |
| Ink | 6 | 22.52ms | 0.4% | 22.45ms–22.59ms | 44 ops/s | 22.52s | 8.21s | 441.89ms | 260.5MB | 169.2MB | 1.9MB | 2.14GB |
| OpenTUI | 6 | 33.38ms | 5.0% | 32.12ms–34.85ms | 30 ops/s | 33.38s | 37.32s | 5.55s | 3.45GB | 1.34GB | 6.8MB | 6.81GB |
| blessed | 6 | 229µs | 9.8% | 219µs–250µs | 4.4K ops/s | 230.55ms | 246.44ms | 35.00ms | 75.9MB | 19.1MB | 1.1MB | 1.18GB |
| Ratatui (Rust) | 6 | 125µs | 0.7% | 125µs–126µs | 8.0K ops/s | 125.32ms | 98.67ms | 39.52ms | 6.1MB | n/a | 1.3MB | 1.33GB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 383µs | 0.6% | 381µs–385µs | 2.6K ops/s | 191.99ms | 225.99ms | 21.28ms | 84.5MB | 22.2MB | 380.1KB | 18.7MB |
| Ink | 6 | 21.20ms | 0.1% | 21.18ms–21.22ms | 47 ops/s | 10.60s | 2.84s | 178.31ms | 124.8MB | 43.0MB | 1.5MB | 1.71GB |
| OpenTUI | 6 | 3.66ms | 0.9% | 3.63ms–3.69ms | 273 ops/s | 1.83s | 1.49s | 489.56ms | 503.9MB | 141.7MB | 1.7MB | 1.67GB |
| blessed | 6 | 186µs | 2.0% | 183µs–189µs | 5.3K ops/s | 93.58ms | 101.40ms | 13.40ms | 75.5MB | 15.3MB | 20.3KB | 25.4MB |
| Ratatui (Rust) | 6 | 179µs | 0.7% | 178µs–180µs | 5.6K ops/s | 89.48ms | 86.22ms | 12.40ms | 6.0MB | n/a | 27.6KB | 27.6MB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | Ink | OpenTUI | blessed | Ratatui (Rust) |
|---|---:|---:|---:|---:|
| terminal-rerender | 55.5x slower [55.2x, 55.7x] | 8.2x slower [8.1x, 8.2x] | 2.4x faster [2.3x, 2.5x] | 4.2x faster [4.1x, 4.3x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 62.2x slower [61.5x, 62.8x] | 11.2x slower [10.5x, 12.3x] | 2.5x faster [2.5x, 2.6x] | 1.7x faster [1.6x, 1.8x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 32.8x slower [32.6x, 33.0x] | 5.8x slower [5.7x, 5.9x] | 2.5x faster [2.5x, 2.6x] | 3.2x faster [3.1x, 3.2x] |
| terminal-screen-transition (rows=40,cols=120) | 29.8x slower [29.5x, 30.1x] | 5.8x slower [5.6x, 6.0x] | 2.2x faster [2.2x, 2.3x] | 2.6x faster [2.6x, 2.7x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 7.3x slower [7.3x, 7.4x] | 1.4x slower [1.3x, 1.4x] | 9.4x faster [9.2x, 9.5x] | 14.5x faster [14.1x, 14.9x] |
| terminal-input-latency (rows=40,cols=120) | 33.8x slower [33.3x, 34.2x] | 6.6x slower [6.4x, 6.8x] | 2.8x faster [2.7x, 2.8x] | 3.3x faster [3.2x, 3.3x] |
| terminal-memory-soak (rows=40,cols=120) | 34.4x slower [34.1x, 34.6x] | 7.2x slower [7.1x, 7.3x] | 2.7x faster [2.7x, 2.7x] | 3.0x faster [3.0x, 3.1x] |
| terminal-virtual-list (items=100000,viewport=40) | 33.4x slower [33.1x, 33.7x] | 49.5x slower [47.3x, 52.1x] | 2.9x faster [2.7x, 3.1x] | 5.4x faster [5.3x, 5.4x] |
| terminal-table (rows=40,cols=8) | 55.4x slower [55.1x, 55.7x] | 9.6x slower [9.4x, 9.7x] | 2.1x faster [2.0x, 2.1x] | 2.1x faster [2.1x, 2.2x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| terminal-rerender | Rezi (native) | 77.8MB | 18.8MB | +12.9MB | +3.1MB | N/A | N/A |
| terminal-rerender | Ink | 120.1MB | 38.3MB | +8.4MB | +8.8MB | N/A | N/A |
| terminal-rerender | OpenTUI | 152.3MB | 53.1MB | +40.7MB | +13.2MB | N/A | N/A |
| terminal-rerender | blessed | 73.4MB | 20.0MB | +6.1MB | +4.9MB | N/A | N/A |
| terminal-rerender | Ratatui (Rust) | 5.9MB | n/a | +253.3KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 82.9MB | 24.1MB | +17.5MB | +14.3MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ink | 128.3MB | 42.9MB | -216.0KB | +20.0MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI | 487.3MB | 137.8MB | +328.3MB | +87.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | blessed | 75.2MB | 19.9MB | +7.1MB | +2.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ratatui (Rust) | 6.0MB | n/a | +302.7KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 86.6MB | 28.8MB | +18.1MB | +18.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ink | 155.6MB | 64.2MB | +28.3MB | +32.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI | 488.6MB | 137.5MB | +328.8MB | +87.5MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | blessed | 75.6MB | 19.2MB | +258.7KB | +6.5MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ratatui (Rust) | 5.9MB | n/a | +278.7KB | n/a | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 99.7MB | 29.5MB | +23.3MB | +10.7MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ink | 189.4MB | 105.8MB | +57.7MB | +69.0MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI | 828.6MB | 280.4MB | +630.9MB | +220.1MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | blessed | 88.0MB | 25.5MB | +12.3MB | +6.3MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ratatui (Rust) | 5.9MB | n/a | +316.7KB | n/a | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 111.2MB | 43.0MB | +34.5MB | +27.5MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ink | 194.3MB | 100.4MB | +63.5MB | +71.9MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI | 967.9MB | 306.0MB | +770.6MB | +238.7MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | blessed | 87.2MB | 24.2MB | +11.1MB | +11.1MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ratatui (Rust) | 6.0MB | n/a | +398.7KB | n/a | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 82.4MB | 21.8MB | +9.3MB | +10.3MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ink | 194.9MB | 111.1MB | +56.1MB | +75.8MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI | 829.0MB | 280.8MB | +631.5MB | +221.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | blessed | 76.2MB | 18.7MB | +218.0KB | +4.6MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ratatui (Rust) | 6.0MB | n/a | +328.0KB | n/a | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 105.3MB | 32.3MB | +27.8MB | +18.1MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ink | 205.3MB | 115.3MB | +67.5MB | +73.7MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI | 990.3MB | 303.8MB | +761.6MB | +232.9MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | blessed | 79.2MB | 24.2MB | +3.4MB | +11.3MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ratatui (Rust) | 5.9MB | n/a | +280.7KB | n/a | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 147.6MB | 75.1MB | +58.8MB | +52.7MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ink | 260.5MB | 169.2MB | +103.0MB | +118.2MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI | 3.45GB | 1.34GB | +2.97GB | +1.20GB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | blessed | 75.9MB | 19.1MB | +359.3KB | +2.0MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ratatui (Rust) | 6.1MB | n/a | +262.0KB | n/a | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 84.5MB | 22.2MB | +16.2MB | +9.1MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ink | 124.8MB | 43.0MB | +3.3MB | +21.9MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI | 503.9MB | 141.7MB | +338.7MB | +91.3MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | blessed | 75.5MB | 15.3MB | +1.7MB | +2.6MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ratatui (Rust) | 6.0MB | n/a | +290.0KB | n/a | N/A | N/A |
