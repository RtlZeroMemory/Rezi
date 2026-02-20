# Benchmark Results

> 2026-02-20T17:33:05.739Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> Invocation: suite=all matchup=rezi-opentui-bubbletea scenario=all framework=all warmup=default iterations=default quick=yes io=pty opentuiDriver=core replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=warn cpuAffinity=none

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.73ms | 0.0% | 1.66ms–1.81ms | 556 ops/s | 89.92ms | 136.32ms | 2.79ms | 80.5MB | 16.6MB | 156.6KB | 0.00KB |
| OpenTUI | 1 | 4.50ms | 0.0% | 4.38ms–4.63ms | 39 ops/s | 1.27s | 246.62ms | 154.74ms | 137.3MB | 53.2MB | 504.8KB | 504.8KB |
| Bubble Tea (Go) | 1 | 9.90ms | 0.0% | 9.87ms–9.92ms | 49 ops/s | 1.02s | 9.65ms | 31.48ms | 9.3MB | 1.0MB | 311.9KB | 380.6KB |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 192µs | 0.0% | 171µs–216µs | 5.2K ops/s | 9.62ms | 24.76ms | 4.14ms | 66.3MB | 15.7MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 1.14ms | 0.0% | 980µs–1.31ms | 874 ops/s | 57.24ms | 29.44ms | 27.78ms | 100.4MB | 37.9MB | 10.2KB | 10.2KB |
| Bubble Tea (Go) | 1 | 8.30ms | 0.0% | 8.04ms–8.56ms | 120 ops/s | 415.05ms | 970µs | 19.15ms | 5.6MB | 736.0KB | 6.88KB | 10.5KB |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 364µs | 0.0% | 323µs–408µs | 2.7K ops/s | 18.28ms | 40.84ms | 5.32ms | 79.2MB | 20.4MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 2.50ms | 0.0% | 2.34ms–2.69ms | 400 ops/s | 125.13ms | 105.84ms | 81.96ms | 122.0MB | 40.2MB | 19.8KB | 19.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.14ms–8.51ms | 120 ops/s | 416.25ms | 11.62ms | 13.59ms | 8.9MB | 717.0KB | 11.3KB | 31.9KB |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.13ms | 0.0% | 1.06ms–1.19ms | 886 ops/s | 56.44ms | 60.21ms | 14.56ms | 116.2MB | 38.8MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 10.09ms | 0.0% | 9.75ms–10.46ms | 99 ops/s | 504.40ms | 344.59ms | 272.24ms | 177.4MB | 47.0MB | 79.2KB | 79.2KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.18ms–8.47ms | 120 ops/s | 416.27ms | 11.13ms | 19.68ms | 9.7MB | 2.4MB | 30.9KB | 126.8KB |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.10ms | 0.0% | 2.02ms–2.18ms | 477 ops/s | 104.86ms | 123.66ms | 21.48ms | 153.7MB | 70.5MB | 10.7KB | 0.00KB |
| OpenTUI | 1 | 19.74ms | 0.0% | 19.43ms–20.10ms | 51 ops/s | 987.24ms | 486.50ms | 557.82ms | 183.2MB | 57.2MB | 153.4KB | 153.4KB |
| Bubble Tea (Go) | 1 | 8.35ms | 0.0% | 8.12ms–8.59ms | 120 ops/s | 417.66ms | 13.43ms | 28.43ms | 9.6MB | 1.7MB | 55.3KB | 245.5KB |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 411µs | 0.0% | 395µs–431µs | 2.4K ops/s | 20.66ms | 19.71ms | 3.87ms | 65.1MB | 11.8MB | 23.2KB | 8.83KB |
| OpenTUI | 1 | 1.30ms | 0.0% | 1.15ms–1.46ms | 765 ops/s | 65.35ms | 35.47ms | 7.55ms | 93.1MB | 37.6MB | 12.3KB | 12.3KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.04ms–8.58ms | 120 ops/s | 415.67ms | 0ns | 19.47ms | 5.4MB | 423.0KB | 12.3KB | 15.3KB |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.61ms | 0.0% | 1.54ms–1.69ms | 620 ops/s | 80.70ms | 84.52ms | 19.53ms | 146.7MB | 63.5MB | 43.9KB | 0.00KB |
| OpenTUI | 1 | 10.20ms | 0.0% | 9.96ms–10.50ms | 98 ops/s | 510.28ms | 329.48ms | 289.89ms | 181.4MB | 47.0MB | 88.6KB | 88.6KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.17ms–8.48ms | 120 ops/s | 416.43ms | 12.33ms | 21.61ms | 9.5MB | 1.0MB | 42.6KB | 140.7KB |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.21ms | 0.0% | 2.09ms–2.34ms | 452 ops/s | 110.72ms | 186.53ms | 21.13ms | 119.1MB | 44.5MB | 577.3KB | 258.7KB |
| OpenTUI | 1 | 2.03ms | 0.0% | 1.90ms–2.18ms | 493 ops/s | 101.38ms | 101.77ms | 61.51ms | 115.4MB | 39.8MB | 434.9KB | 434.9KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.17ms–8.47ms | 120 ops/s | 415.77ms | 11.74ms | 13.67ms | 8.9MB | 1.1MB | 120.5KB | 151.7KB |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 13.82ms | 0.0% | 13.04ms–14.67ms | 72 ops/s | 690.91ms | 919.43ms | 125.14ms | 181.0MB | 62.6MB | 207.1KB | 20.1KB |
| OpenTUI | 1 | 34.59ms | 0.0% | 33.93ms–35.28ms | 29 ops/s | 1.73s | 903.40ms | 898.22ms | 213.4MB | 81.6MB | 97.5KB | 97.5KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.12ms–8.49ms | 120 ops/s | 415.49ms | 33.09ms | 29.23ms | 9.7MB | 1.8MB | 238.6KB | 293.5KB |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 998µs | 0.0% | 938µs–1.06ms | 1.0K ops/s | 49.97ms | 127.93ms | 3.24ms | 85.9MB | 17.3MB | 208.4KB | 86.0KB |
| OpenTUI | 1 | 1.46ms | 0.0% | 1.33ms–1.62ms | 685 ops/s | 72.99ms | 93.76ms | 33.32ms | 110.1MB | 39.0MB | 319.2KB | 319.2KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.16ms–8.46ms | 120 ops/s | 415.59ms | 8.49ms | 15.93ms | 7.4MB | 2.6MB | 242.5KB | 298.3KB |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 2.27ms | 0.0% | 2.12ms–2.42ms | 440 ops/s | 113.53ms | 208.65ms | 5.19ms | 119.2MB | 48.5MB | 457.6KB | 227.6KB |
| OpenTUI | 1 | 2.59ms | 0.0% | 2.46ms–2.77ms | 385 ops/s | 129.76ms | 132.75ms | 57.65ms | 129.9MB | 40.2MB | 831.1KB | 831.1KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.19ms–8.48ms | 120 ops/s | 416.68ms | 1.05ms | 26.36ms | 9.5MB | 1.5MB | 238.6KB | 293.5KB |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 708µs | 0.0% | 683µs–737µs | 1.4K ops/s | 35.58ms | 43.71ms | 3.81ms | 71.0MB | 17.7MB | 118.8KB | 56.7KB |
| OpenTUI | 1 | 1.33ms | 0.0% | 1.17ms–1.51ms | 749 ops/s | 66.72ms | 76.35ms | 24.82ms | 108.3MB | 38.2MB | 56.1KB | 56.1KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.18ms–8.48ms | 120 ops/s | 416.34ms | 111µs | 22.24ms | 6.1MB | 1.4MB | 131.4KB | 161.7KB |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 365µs | 0.0% | 349µs–384µs | 2.7K ops/s | 18.30ms | 19.93ms | 0ns | 64.6MB | 11.0MB | 9.77KB | 5.57KB |
| OpenTUI | 1 | 1.25ms | 0.0% | 1.09ms–1.40ms | 802 ops/s | 62.34ms | 35.83ms | 2.78ms | 91.0MB | 37.6MB | 10.1KB | 10.1KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.06ms–8.55ms | 120 ops/s | 415.40ms | 0ns | 19.37ms | 5.1MB | 388.0KB | 6.30KB | 7.96KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 441µs | 0.0% | 425µs–462µs | 2.3K ops/s | 22.12ms | 27.60ms | 3.50ms | 67.4MB | 14.7MB | 15.2KB | 6.48KB |
| OpenTUI | 1 | 1.36ms | 0.0% | 1.23ms–1.51ms | 733 ops/s | 68.20ms | 89.65ms | 27.44ms | 110.1MB | 38.8MB | 12.8KB | 12.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.06ms–8.58ms | 120 ops/s | 416.02ms | 0ns | 22.24ms | 6.5MB | 1.6MB | 8.25KB | 17.1KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 832µs | 0.0% | 811µs–854µs | 1.2K ops/s | 41.64ms | 67.74ms | 2.97ms | 70.0MB | 17.5MB | 349.2KB | 63.7KB |
| OpenTUI | 1 | 1.31ms | 0.0% | 1.18ms–1.47ms | 763 ops/s | 65.54ms | 71.03ms | 46.75ms | 110.5MB | 38.8MB | 201.0KB | 201.0KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.17ms–8.47ms | 120 ops/s | 415.99ms | 0ns | 23.70ms | 7.1MB | 2.4MB | 238.6KB | 293.5KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 954µs | 0.0% | 918µs–994µs | 1.0K ops/s | 47.74ms | 76.83ms | 0ns | 70.3MB | 18.1MB | 349.2KB | 173.8KB |
| OpenTUI | 1 | 1.41ms | 0.0% | 1.27ms–1.57ms | 708 ops/s | 70.62ms | 79.37ms | 45.44ms | 110.6MB | 38.9MB | 357.9KB | 357.9KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.18ms–8.48ms | 120 ops/s | 416.40ms | 15.36ms | 9.64ms | 7.8MB | 2.9MB | 238.6KB | 293.5KB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 3.59ms | 0.0% | 3.55ms–3.63ms | 278 ops/s | 179.58ms | 205.54ms | 8.53ms | 76.7MB | 16.7MB | 408.6KB | 98.2KB |
| OpenTUI | 1 | 1.42ms | 0.0% | 1.30ms–1.56ms | 704 ops/s | 71.06ms | 82.51ms | 43.69ms | 110.3MB | 38.9MB | 309.0KB | 309.0KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.17ms–8.47ms | 120 ops/s | 415.95ms | 3.67ms | 20.64ms | 7.3MB | 2.5MB | 238.5KB | 293.4KB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 876µs | 0.0% | 848µs–905µs | 1.1K ops/s | 43.86ms | 74.93ms | 0ns | 70.6MB | 17.7MB | 349.2KB | 27.7KB |
| OpenTUI | 1 | 1.40ms | 0.0% | 1.27ms–1.54ms | 713 ops/s | 70.15ms | 83.76ms | 39.38ms | 110.3MB | 38.9MB | 101.2KB | 101.2KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.17ms–8.49ms | 120 ops/s | 416.48ms | 0ns | 23.93ms | 7.9MB | 2.8MB | 232.7KB | 286.5KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 823µs | 0.0% | 802µs–846µs | 1.2K ops/s | 41.20ms | 71.11ms | 0ns | 70.8MB | 17.9MB | 349.2KB | 45.5KB |
| OpenTUI | 1 | 1.38ms | 0.0% | 1.23ms–1.56ms | 722 ops/s | 69.29ms | 78.27ms | 46.53ms | 110.8MB | 38.9MB | 178.1KB | 178.1KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.17ms–8.48ms | 120 ops/s | 416.17ms | 6.28ms | 17.80ms | 7.8MB | 2.8MB | 238.6KB | 293.5KB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.02ms | 0.0% | 961µs–1.09ms | 975 ops/s | 51.28ms | 140.28ms | 4.35ms | 90.9MB | 21.5MB | 210.1KB | 86.7KB |
| OpenTUI | 1 | 1.48ms | 0.0% | 1.34ms–1.64ms | 675 ops/s | 74.09ms | 79.11ms | 47.74ms | 111.3MB | 38.9MB | 322.9KB | 322.9KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.17ms–8.47ms | 120 ops/s | 416.07ms | 0ns | 24.79ms | 7.8MB | 2.6MB | 242.5KB | 298.3KB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 492µs | 0.0% | 467µs–521µs | 2.0K ops/s | 24.63ms | 35.16ms | 0ns | 70.0MB | 17.5MB | 35.0KB | 6.54KB |
| OpenTUI | 1 | 1.45ms | 0.0% | 1.32ms–1.61ms | 687 ops/s | 72.79ms | 94.91ms | 30.88ms | 111.2MB | 39.0MB | 12.9KB | 12.9KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.09ms–8.53ms | 120 ops/s | 415.47ms | 0ns | 25.69ms | 9.0MB | 864.0KB | 14.2KB | 24.2KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | OpenTUI |
|---|---:|
| startup | 2.6x slower [2.4x, 2.8x] |
| tree-construction (items=10) | 6.0x slower [4.5x, 7.7x] |
| tree-construction (items=100) | 6.9x slower [5.7x, 8.3x] |
| tree-construction (items=500) | 8.9x slower [8.2x, 9.9x] |
| tree-construction (items=1000) | 9.4x slower [8.9x, 10.0x] |
| rerender | 3.2x slower [2.7x, 3.7x] |
| content-update | 6.3x slower [5.9x, 6.8x] |
| layout-stress (rows=40,cols=4) | 1.1x faster [1.0x, 1.2x] (inconclusive) |
| scroll-stress (items=2000) | 2.5x slower [2.3x, 2.7x] |
| virtual-list (items=100000,viewport=40) | 1.5x slower [1.2x, 1.7x] |
| tables (rows=100,cols=8) | 1.1x slower [1.0x, 1.3x] |
| memory-profile | 1.9x slower [1.6x, 2.2x] |
| terminal-rerender | 3.4x slower [2.8x, 4.0x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 3.1x slower [2.7x, 3.6x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 1.6x slower [1.4x, 1.8x] |
| terminal-screen-transition (rows=40,cols=120) | 1.5x slower [1.3x, 1.7x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 2.5x faster [2.3x, 2.8x] |
| terminal-input-latency (rows=40,cols=120) | 1.6x slower [1.4x, 1.8x] |
| terminal-memory-soak (rows=40,cols=120) | 1.7x slower [1.5x, 1.9x] |
| terminal-virtual-list (items=100000,viewport=40) | 1.4x slower [1.2x, 1.7x] |
| terminal-table (rows=40,cols=8) | 3.0x slower [2.5x, 3.4x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 80.5MB | 16.6MB | +10.5MB | +6.4MB | N/A | N/A |
| startup | OpenTUI | 137.3MB | 53.2MB | +23.3MB | +12.4MB | N/A | N/A |
| startup | Bubble Tea (Go) | 9.3MB | 1.0MB | +3.1MB | +792.0KB | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 66.3MB | 15.7MB | +4.3MB | +6.1MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI | 100.4MB | 37.9MB | +8.8MB | +311.0KB | N/A | N/A |
| tree-construction (items=10) | Bubble Tea (Go) | 5.6MB | 736.0KB | +384.0KB | +460.0KB | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 79.2MB | 20.4MB | +7.5MB | +10.0MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI | 122.0MB | 40.2MB | +13.5MB | +1.8MB | N/A | N/A |
| tree-construction (items=100) | Bubble Tea (Go) | 8.9MB | 717.0KB | +2.8MB | +397.0KB | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 116.2MB | 38.8MB | +23.7MB | +25.8MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI | 177.4MB | 47.0MB | +31.1MB | +7.0MB | N/A | N/A |
| tree-construction (items=500) | Bubble Tea (Go) | 9.7MB | 2.4MB | +1.0MB | +1.9MB | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 153.7MB | 70.5MB | +40.7MB | +54.6MB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI | 183.2MB | 57.2MB | -2.2MB | +15.5MB | N/A | N/A |
| tree-construction (items=1000) | Bubble Tea (Go) | 9.6MB | 1.7MB | +184.0KB | +951.0KB | N/A | N/A |
| rerender | Rezi (native) | 65.1MB | 11.8MB | +688.0KB | +2.0MB | N/A | N/A |
| rerender | OpenTUI | 93.1MB | 37.6MB | +5.0MB | +203.0KB | N/A | N/A |
| rerender | Bubble Tea (Go) | 5.4MB | 423.0KB | +128.0KB | +153.0KB | N/A | N/A |
| content-update | Rezi (native) | 146.7MB | 63.5MB | +29.3MB | +49.0MB | N/A | N/A |
| content-update | OpenTUI | 181.4MB | 47.0MB | +31.8MB | +6.9MB | N/A | N/A |
| content-update | Bubble Tea (Go) | 9.5MB | 1.0MB | +1.3MB | +526.0KB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 119.1MB | 44.5MB | +27.4MB | +32.9MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI | 115.4MB | 39.8MB | +11.0MB | +1.3MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Bubble Tea (Go) | 8.9MB | 1.1MB | +3.1MB | +780.0KB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 181.0MB | 62.6MB | +496.0KB | +38.7MB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI | 213.4MB | 81.6MB | +6.1MB | +31.6MB | N/A | N/A |
| scroll-stress (items=2000) | Bubble Tea (Go) | 9.7MB | 1.8MB | +200.0KB | +529.0KB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 85.9MB | 17.3MB | +13.8MB | +6.7MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI | 110.1MB | 39.0MB | +12.2MB | +693.0KB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 7.4MB | 2.6MB | +1.6MB | +2.3MB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 119.2MB | 48.5MB | +41.7MB | +36.3MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI | 129.9MB | 40.2MB | +21.0MB | +1.8MB | N/A | N/A |
| tables (rows=100,cols=8) | Bubble Tea (Go) | 9.5MB | 1.5MB | +2.9MB | +1.1MB | N/A | N/A |
| memory-profile | Rezi (native) | 71.0MB | 17.7MB | +6.0MB | +7.6MB | 0.0000 KB/iter | yes |
| memory-profile | OpenTUI | 108.3MB | 38.2MB | +14.0MB | +543.0KB | N/A | N/A |
| memory-profile | Bubble Tea (Go) | 6.1MB | 1.4MB | +768.0KB | +1.2MB | N/A | N/A |
| terminal-rerender | Rezi (native) | 64.6MB | 11.0MB | +420.0KB | +1.4MB | N/A | N/A |
| terminal-rerender | OpenTUI | 91.0MB | 37.6MB | +4.9MB | +181.0KB | N/A | N/A |
| terminal-rerender | Bubble Tea (Go) | 5.1MB | 388.0KB | +128.0KB | +118.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 67.4MB | 14.7MB | +3.1MB | +5.0MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI | 110.1MB | 38.8MB | +14.0MB | +553.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Bubble Tea (Go) | 6.5MB | 1.6MB | +1.1MB | +1.3MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 70.0MB | 17.5MB | +5.8MB | +7.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI | 110.5MB | 38.8MB | +14.8MB | +659.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Bubble Tea (Go) | 7.1MB | 2.4MB | +1.6MB | +2.1MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 70.3MB | 18.1MB | +5.9MB | +8.1MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI | 110.6MB | 38.9MB | +15.3MB | +715.0KB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Bubble Tea (Go) | 7.8MB | 2.9MB | +2.1MB | +2.6MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 76.7MB | 16.7MB | +5.5MB | +6.7MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI | 110.3MB | 38.9MB | +12.9MB | +682.0KB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Bubble Tea (Go) | 7.3MB | 2.5MB | +1.6MB | +2.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 70.6MB | 17.7MB | +6.2MB | +7.8MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI | 110.3MB | 38.9MB | +13.9MB | +918.0KB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Bubble Tea (Go) | 7.9MB | 2.8MB | +2.0MB | +2.5MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 70.8MB | 17.9MB | +5.7MB | +7.9MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI | 110.8MB | 38.9MB | +14.7MB | +683.0KB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Bubble Tea (Go) | 7.8MB | 2.8MB | +2.0MB | +2.5MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 90.9MB | 21.5MB | +17.7MB | +10.8MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI | 111.3MB | 38.9MB | +13.6MB | +651.0KB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 7.8MB | 2.6MB | +1.9MB | +2.3MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 70.0MB | 17.5MB | +5.6MB | +7.7MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI | 111.2MB | 39.0MB | +13.9MB | +795.0KB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Bubble Tea (Go) | 9.0MB | 864.0KB | +3.0MB | +572.0KB | N/A | N/A |
