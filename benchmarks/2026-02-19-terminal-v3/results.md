# Benchmark Results

> 2026-02-19T15:50:21.683Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> Invocation: suite=terminal scenario=all framework=all warmup=default iterations=default quick=no io=pty replicates=7 discardFirstReplicate=yes shuffleFrameworkOrder=yes shuffleSeed=2026-02-19-terminal-v3 envCheck=warn cpuAffinity=0-7

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 316µs | 0.7% | 315µs–318µs | 3.2K ops/s | 317.43ms | 340.52ms | 33.26ms | 77.9MB | 18.9MB | 195.8KB | 12.9KB |
| Ink | 6 | 17.54ms | 0.1% | 17.52ms–17.56ms | 57 ops/s | 17.54s | 720.03ms | 74.93ms | 121.2MB | 38.1MB | 84.1KB | 95.7KB |
| OpenTUI | 6 | 2.57ms | 0.3% | 2.56ms–2.58ms | 389 ops/s | 2.57s | 697.43ms | 406.36ms | 153.9MB | 53.1MB | 149.7KB | 149.7KB |
| blessed | 6 | 129µs | 1.6% | 128µs–131µs | 7.7K ops/s | 130.41ms | 155.49ms | 25.95ms | 73.8MB | 20.0MB | 16.7KB | 18.5KB |
| Ratatui (Rust) | 6 | 75µs | 1.6% | 75µs–77µs | 13.2K ops/s | 75.54ms | 57.98ms | 25.15ms | 5.9MB | n/a | 28.1KB | 28.1KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 372µs | 8.9% | 352µs–402µs | 2.7K ops/s | 186.52ms | 199.36ms | 32.09ms | 83.0MB | 24.1MB | 152.3KB | 17.7KB |
| Ink | 6 | 21.96ms | 0.6% | 21.87ms–22.09ms | 46 ops/s | 10.98s | 3.47s | 184.61ms | 125.5MB | 39.9MB | 292.4KB | 343.8KB |
| OpenTUI | 6 | 4.03ms | 6.8% | 3.86ms–4.28ms | 249 ops/s | 2.01s | 1.58s | 687.35ms | 490.1MB | 137.8MB | 2.1MB | 2.1MB |
| blessed | 6 | 140µs | 2.6% | 138µs–144µs | 7.1K ops/s | 70.87ms | 94.55ms | 9.27ms | 75.2MB | 19.9MB | 13.8KB | 16.4KB |
| Ratatui (Rust) | 6 | 197µs | 1.3% | 195µs–199µs | 5.1K ops/s | 98.38ms | 99.90ms | 8.71ms | 5.8MB | n/a | 23.6KB | 23.6KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 679µs | 1.2% | 673µs–686µs | 1.5K ops/s | 340.01ms | 366.42ms | 18.31ms | 86.9MB | 28.8MB | 3.4MB | 541.2KB |
| Ink | 6 | 22.08ms | 0.3% | 22.01ms–22.14ms | 45 ops/s | 11.04s | 3.64s | 210.48ms | 158.7MB | 64.2MB | 536.8KB | 611.3KB |
| OpenTUI | 6 | 3.92ms | 1.9% | 3.86ms–3.98ms | 255 ops/s | 1.96s | 1.54s | 619.47ms | 486.8MB | 137.3MB | 2.7MB | 2.7MB |
| blessed | 6 | 268µs | 2.8% | 263µs–275µs | 3.7K ops/s | 134.82ms | 151.64ms | 14.80ms | 76.0MB | 19.1MB | 543.6KB | 599.7KB |
| Ratatui (Rust) | 6 | 213µs | 0.6% | 212µs–214µs | 4.7K ops/s | 106.40ms | 105.60ms | 12.12ms | 5.9MB | n/a | 540.5KB | 540.5KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 749µs | 1.5% | 740µs–758µs | 1.3K ops/s | 750.64ms | 779.62ms | 39.56ms | 100.4MB | 29.5MB | 6.8MB | 3.1MB |
| Ink | 6 | 22.14ms | 0.5% | 22.06ms–22.23ms | 45 ops/s | 22.14s | 7.37s | 449.02ms | 193.1MB | 98.3MB | 2.0MB | 2.2MB |
| OpenTUI | 6 | 4.56ms | 13.0% | 4.22ms–5.11ms | 222 ops/s | 4.56s | 3.41s | 1.44s | 831.3MB | 284.2MB | 6.4MB | 6.4MB |
| blessed | 6 | 331µs | 2.8% | 324µs–339µs | 3.0K ops/s | 332.82ms | 341.38ms | 42.03ms | 88.3MB | 25.2MB | 2.8MB | 3.1MB |
| Ratatui (Rust) | 6 | 282µs | 0.8% | 281µs–285µs | 3.5K ops/s | 282.58ms | 245.01ms | 65.78ms | 6.0MB | n/a | 2.7MB | 2.7MB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 3.40ms | 0.5% | 3.39ms–3.42ms | 294 ops/s | 4.09s | 4.11s | 73.30ms | 111.7MB | 43.4MB | 9.6MB | 1.9MB |
| Ink | 6 | 24.96ms | 0.4% | 24.89ms–25.04ms | 40 ops/s | 29.95s | 12.69s | 560.45ms | 201.4MB | 109.1MB | 3.1MB | 3.4MB |
| OpenTUI | 6 | 4.66ms | 5.4% | 4.48ms–4.88ms | 215 ops/s | 5.59s | 4.27s | 1.75s | 966.0MB | 306.3MB | 8.3MB | 8.3MB |
| blessed | 6 | 359µs | 2.4% | 353µs–367µs | 2.8K ops/s | 432.36ms | 440.96ms | 42.89ms | 87.4MB | 24.3MB | 1.5MB | 1.6MB |
| Ratatui (Rust) | 6 | 231µs | 1.3% | 228µs–233µs | 4.3K ops/s | 276.82ms | 265.17ms | 35.06ms | 5.9MB | n/a | 1.7MB | 1.7MB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 659µs | 0.9% | 654µs–664µs | 1.5K ops/s | 660.63ms | 714.52ms | 35.58ms | 83.2MB | 21.6MB | 6.8MB | 419.4KB |
| Ink | 6 | 22.32ms | 0.3% | 22.27ms–22.37ms | 45 ops/s | 22.32s | 7.40s | 390.60ms | 192.6MB | 103.4MB | 1009.3KB | 1.1MB |
| OpenTUI | 6 | 4.24ms | 2.3% | 4.17ms–4.33ms | 236 ops/s | 4.24s | 3.15s | 1.25s | 829.6MB | 280.9MB | 4.9MB | 4.9MB |
| blessed | 6 | 234µs | 1.8% | 231µs–238µs | 4.2K ops/s | 235.61ms | 252.84ms | 32.21ms | 77.3MB | 19.1MB | 628.0KB | 692.4KB |
| Ratatui (Rust) | 6 | 199µs | 0.5% | 199µs–200µs | 5.0K ops/s | 199.57ms | 190.66ms | 29.32ms | 5.8MB | n/a | 435.6KB | 435.6KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 641µs | 0.8% | 637µs–646µs | 1.6K ops/s | 771.03ms | 765.46ms | 52.64ms | 105.9MB | 31.7MB | 8.2MB | 914.4KB |
| Ink | 6 | 22.09ms | 0.3% | 22.03ms–22.14ms | 45 ops/s | 26.51s | 8.84s | 499.55ms | 203.3MB | 115.3MB | 1.0MB | 1.2MB |
| OpenTUI | 6 | 4.62ms | 5.5% | 4.42ms–4.84ms | 217 ops/s | 5.54s | 4.27s | 1.68s | 989.7MB | 304.3MB | 6.6MB | 6.6MB |
| blessed | 6 | 235µs | 2.3% | 231µs–240µs | 4.2K ops/s | 283.23ms | 291.98ms | 42.45ms | 79.2MB | 24.2MB | 1000.4KB | 1.1MB |
| Ratatui (Rust) | 6 | 209µs | 1.3% | 207µs–212µs | 4.8K ops/s | 251.27ms | 251.31ms | 31.67ms | 5.7MB | n/a | 935.2KB | 935.2KB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 681µs | 1.1% | 676µs–687µs | 1.5K ops/s | 682.71ms | 707.99ms | 80.10ms | 146.7MB | 75.5MB | 4.1MB | 1.4MB |
| Ink | 6 | 22.82ms | 0.4% | 22.75ms–22.89ms | 44 ops/s | 22.82s | 8.49s | 448.90ms | 266.3MB | 176.2MB | 1.9MB | 2.1MB |
| OpenTUI | 6 | 35.73ms | 1.6% | 35.29ms–36.21ms | 28 ops/s | 35.74s | 40.45s | 5.38s | 3.45GB | 1.34GB | 6.8MB | 6.8MB |
| blessed | 6 | 223µs | 1.5% | 220µs–226µs | 4.5K ops/s | 224.27ms | 241.95ms | 33.54ms | 76.6MB | 19.1MB | 1.1MB | 1.2MB |
| Ratatui (Rust) | 6 | 127µs | 1.3% | 126µs–128µs | 7.9K ops/s | 127.15ms | 103.12ms | 36.83ms | 6.1MB | n/a | 1.3MB | 1.3MB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 6 | 400µs | 7.1% | 386µs–426µs | 2.5K ops/s | 200.88ms | 238.26ms | 20.20ms | 84.3MB | 22.2MB | 380.1KB | 18.7KB |
| Ink | 6 | 21.46ms | 0.3% | 21.40ms–21.51ms | 47 ops/s | 10.73s | 3.05s | 177.08ms | 126.4MB | 42.9MB | 1.5MB | 1.7MB |
| OpenTUI | 6 | 3.82ms | 2.4% | 3.74ms–3.89ms | 262 ops/s | 1.91s | 1.58s | 558.93ms | 500.4MB | 141.7MB | 1.7MB | 1.7MB |
| blessed | 6 | 187µs | 4.1% | 182µs–194µs | 5.3K ops/s | 94.03ms | 104.27ms | 11.25ms | 75.4MB | 15.5MB | 20.3KB | 25.4KB |
| Ratatui (Rust) | 6 | 175µs | 1.8% | 174µs–178µs | 5.7K ops/s | 87.78ms | 81.72ms | 15.20ms | 5.9MB | n/a | 27.6KB | 27.6KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | Ink | OpenTUI | blessed | Ratatui (Rust) |
|---|---:|---:|---:|---:|
| terminal-rerender | 55.5x slower [55.1x, 55.8x] | 8.1x slower [8.1x, 8.2x] | 2.4x faster [2.4x, 2.5x] | 4.2x faster [4.1x, 4.3x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 59.1x slower [54.4x, 62.7x] | 10.8x slower [9.6x, 12.1x] | 2.6x faster [2.5x, 2.9x] | 1.9x faster [1.8x, 2.1x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 32.5x slower [32.1x, 32.9x] | 5.8x slower [5.6x, 5.9x] | 2.5x faster [2.4x, 2.6x] | 3.2x faster [3.1x, 3.2x] |
| terminal-screen-transition (rows=40,cols=120) | 29.6x slower [29.1x, 30.0x] | 6.1x slower [5.6x, 6.9x] | 2.3x faster [2.2x, 2.3x] | 2.7x faster [2.6x, 2.7x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 7.3x slower [7.3x, 7.4x] | 1.4x slower [1.3x, 1.4x] | 9.5x faster [9.2x, 9.7x] | 14.8x faster [14.5x, 15.0x] |
| terminal-input-latency (rows=40,cols=120) | 33.9x slower [33.5x, 34.2x] | 6.4x slower [6.3x, 6.6x] | 2.8x faster [2.7x, 2.9x] | 3.3x faster [3.3x, 3.3x] |
| terminal-memory-soak (rows=40,cols=120) | 34.4x slower [34.1x, 34.8x] | 7.2x slower [6.8x, 7.6x] | 2.7x faster [2.7x, 2.8x] | 3.1x faster [3.0x, 3.1x] |
| terminal-virtual-list (items=100000,viewport=40) | 33.5x slower [33.1x, 33.9x] | 52.5x slower [51.3x, 53.6x] | 3.1x faster [3.0x, 3.1x] | 5.4x faster [5.3x, 5.5x] |
| terminal-table (rows=40,cols=8) | 53.6x slower [50.2x, 55.7x] | 9.5x slower [8.8x, 10.1x] | 2.1x faster [2.0x, 2.3x] | 2.3x faster [2.2x, 2.5x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| terminal-rerender | Rezi (native) | 77.9MB | 18.9MB | +13.0MB | +3.1MB | N/A | N/A |
| terminal-rerender | Ink | 121.2MB | 38.1MB | +8.3MB | +8.0MB | N/A | N/A |
| terminal-rerender | OpenTUI | 153.9MB | 53.1MB | +41.6MB | +13.1MB | N/A | N/A |
| terminal-rerender | blessed | 73.8MB | 20.0MB | +6.3MB | +4.9MB | N/A | N/A |
| terminal-rerender | Ratatui (Rust) | 5.9MB | n/a | +243.3KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 83.0MB | 24.1MB | +17.5MB | +14.3MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ink | 125.5MB | 39.9MB | +272.7KB | +17.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI | 490.1MB | 137.8MB | +329.4MB | +87.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | blessed | 75.2MB | 19.9MB | +7.1MB | +2.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ratatui (Rust) | 5.8MB | n/a | +304.7KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 86.9MB | 28.8MB | +17.9MB | +18.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ink | 158.7MB | 64.2MB | +28.0MB | +38.2MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI | 486.8MB | 137.3MB | +327.0MB | +87.7MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | blessed | 76.0MB | 19.1MB | +118.0KB | +6.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ratatui (Rust) | 5.9MB | n/a | +314.7KB | n/a | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 100.4MB | 29.5MB | +22.5MB | +10.7MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ink | 193.1MB | 98.3MB | +56.3MB | +62.5MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI | 831.3MB | 284.2MB | +631.5MB | +221.3MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | blessed | 88.3MB | 25.2MB | +12.3MB | +6.3MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ratatui (Rust) | 6.0MB | n/a | +274.7KB | n/a | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 111.7MB | 43.4MB | +34.6MB | +28.7MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ink | 201.4MB | 109.1MB | +64.7MB | +71.4MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI | 966.0MB | 306.3MB | +768.9MB | +239.5MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | blessed | 87.4MB | 24.3MB | +11.3MB | +11.3MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ratatui (Rust) | 5.9MB | n/a | +401.3KB | n/a | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 83.2MB | 21.6MB | +9.2MB | +10.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ink | 192.6MB | 103.4MB | +55.3MB | +66.0MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI | 829.6MB | 280.9MB | +631.4MB | +221.0MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | blessed | 77.3MB | 19.1MB | +269.3KB | +5.8MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ratatui (Rust) | 5.8MB | n/a | +294.0KB | n/a | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 105.9MB | 31.7MB | +27.5MB | +18.4MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ink | 203.3MB | 115.3MB | +66.8MB | +78.1MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI | 989.7MB | 304.3MB | +762.5MB | +233.0MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | blessed | 79.2MB | 24.2MB | +3.4MB | +11.3MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ratatui (Rust) | 5.7MB | n/a | +304.7KB | n/a | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 146.7MB | 75.5MB | +57.9MB | +51.0MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ink | 266.3MB | 176.2MB | +107.6MB | +126.4MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI | 3.45GB | 1.34GB | +2.98GB | +1.20GB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | blessed | 76.6MB | 19.1MB | +230.0KB | +2.4MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ratatui (Rust) | 6.1MB | n/a | +272.0KB | n/a | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 84.3MB | 22.2MB | +16.2MB | +9.1MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ink | 126.4MB | 42.9MB | +3.2MB | +16.6MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI | 500.4MB | 141.7MB | +337.7MB | +91.2MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | blessed | 75.4MB | 15.5MB | +1.8MB | +2.7MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ratatui (Rust) | 5.9MB | n/a | +290.7KB | n/a | N/A | N/A |
