# Benchmark Results

> 2026-02-27T17:38:54.499Z | Node v24.12.0 | Bun 1.3.10 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Darwin 25.2.0 | darwin arm64 | Apple M4 Pro (12 cores) | RAM 24576MB | governor=n/a | wsl=no
> Invocation: suite=all matchup=none scenario=all framework=all warmup=default iterations=default quick=yes io=pty opentuiDriver=react replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=off cpuAffinity=none
> Byte columns: "Bytes(local)" = framework-local counter; "Bytes(pty)" = observed PTY bytes (cross-framework comparable in PTY mode).

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.67ms | 0.0% | 1.60ms–1.73ms | 589 ops/s | 84.95ms | 75.03ms | 4.71ms | 129.7MB | 40.2MB | 207.6KB | 0.00KB |
| Ink | 1 | 4.36ms | 0.0% | 4.11ms–4.61ms | 145 ops/s | 345.72ms | 480.12ms | 20.16ms | 341.6MB | 74.2MB | 105.4KB | 0.01KB |
| OpenTUI (React) | 1 | 6.18ms | 0.0% | 6.06ms–6.29ms | 32 ops/s | 1.55s | 634.09ms | 70.19ms | 244.4MB | 109.0MB | 683.0KB | 683.0KB |
| OpenTUI (Core) | 1 | 4.95ms | 0.0% | 4.62ms–5.26ms | 32 ops/s | 1.55s | 406.48ms | 89.68ms | 138.0MB | 53.1MB | 506.2KB | 506.2KB |
| Bubble Tea (Go) | 1 | 8.79ms | 0.0% | 8.73ms–8.87ms | 52 ops/s | 965.66ms | 34.56ms | 50.59ms | 0.00KB | 1.2MB | 305.7KB | 380.6KB |
| terminal-kit | 1 | 99µs | 0.0% | 88µs–111µs | 1.1K ops/s | 47.53ms | 69.10ms | 4.71ms | 141.6MB | 48.6MB | 0.00KB | 0.00KB |
| blessed | 1 | 1.31ms | 0.0% | 1.16ms–1.49ms | 284 ops/s | 176.10ms | 244.29ms | 37.08ms | 308.4MB | 130.3MB | 94.9KB | 0.00KB |
| Ratatui (Rust) | 1 | 187µs | 0.0% | 186µs–187µs | 5.1K ops/s | 9.76ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 82µs | 0.0% | 69µs–98µs | 12.2K ops/s | 4.11ms | 11.34ms | 395µs | 81.5MB | 17.8MB | 14.8KB | 0.00KB |
| Ink | 1 | 20.73ms | 0.0% | 15.96ms–25.56ms | 48 ops/s | 1.04s | 233.86ms | 3.44ms | 135.8MB | 28.8MB | 36.3KB | 0.01KB |
| OpenTUI (React) | 1 | 2.85ms | 0.0% | 2.71ms–2.99ms | 351 ops/s | 142.51ms | 161.53ms | 7.97ms | 160.1MB | 50.1MB | 39.2KB | 39.2KB |
| OpenTUI (Core) | 1 | 1.10ms | 0.0% | 972µs–1.22ms | 908 ops/s | 55.09ms | 31.60ms | 5.59ms | 93.7MB | 37.9MB | 10.3KB | 10.3KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.29ms–8.36ms | 120 ops/s | 416.22ms | 11.59ms | 17.16ms | 0.00KB | 818.0KB | 6.88KB | 10.5KB |
| terminal-kit | 1 | 96µs | 0.0% | 93µs–100µs | 10.4K ops/s | 4.81ms | 8.68ms | 164µs | 84.6MB | 18.0MB | 0.00KB | 0.00KB |
| blessed | 1 | 258µs | 0.0% | 241µs–276µs | 3.9K ops/s | 12.93ms | 19.78ms | 3.30ms | 89.2MB | 19.2MB | 1.13KB | 0.00KB |
| Ratatui (Rust) | 1 | 852µs | 0.0% | 842µs–868µs | 1.2K ops/s | 42.59ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 209µs | 0.0% | 194µs–226µs | 4.8K ops/s | 10.45ms | 30.51ms | 871µs | 92.8MB | 20.9MB | 14.8KB | 0.00KB |
| Ink | 1 | 24.61ms | 0.0% | 19.98ms–29.32ms | 41 ops/s | 1.23s | 530.57ms | 15.23ms | 270.2MB | 108.8MB | 203.3KB | 0.01KB |
| OpenTUI (React) | 1 | 10.67ms | 0.0% | 10.42ms–10.94ms | 94 ops/s | 533.78ms | 800.03ms | 37.32ms | 505.3MB | 152.0MB | 458.9KB | 458.9KB |
| OpenTUI (Core) | 1 | 1.59ms | 0.0% | 1.51ms–1.67ms | 630 ops/s | 79.43ms | 95.67ms | 36.59ms | 116.9MB | 40.2MB | 19.8KB | 19.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.29ms–8.35ms | 120 ops/s | 416.23ms | 14.08ms | 18.36ms | 0.00KB | 842.0KB | 11.3KB | 31.9KB |
| terminal-kit | 1 | 203µs | 0.0% | 194µs–212µs | 4.9K ops/s | 10.17ms | 17.89ms | 190µs | 85.3MB | 15.0MB | 0.00KB | 0.00KB |
| blessed | 1 | 1.82ms | 0.0% | 1.78ms–1.87ms | 548 ops/s | 91.19ms | 115.89ms | 26.10ms | 110.8MB | 29.6MB | 1.13KB | 0.00KB |
| Ratatui (Rust) | 1 | 917µs | 0.0% | 911µs–925µs | 1.1K ops/s | 45.87ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 758µs | 0.0% | 719µs–798µs | 1.3K ops/s | 37.90ms | 62.87ms | 3.20ms | 143.2MB | 58.8MB | 14.8KB | 0.00KB |
| Ink | 1 | 48.91ms | 0.0% | 44.13ms–53.78ms | 20 ops/s | 2.45s | 2.06s | 41.11ms | 453.1MB | 277.2MB | 1023.6KB | 0.01KB |
| OpenTUI (React) | 1 | 48.90ms | 0.0% | 47.78ms–50.00ms | 20 ops/s | 2.44s | 3.01s | 155.67ms | 1.63GB | 832.3MB | 1.3MB | 1.3MB |
| OpenTUI (Core) | 1 | 8.36ms | 0.0% | 8.20ms–8.54ms | 120 ops/s | 418.09ms | 292.43ms | 212.83ms | 221.9MB | 46.6MB | 79.2KB | 79.2KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.37ms | 120 ops/s | 416.28ms | 23.73ms | 20.08ms | 0.00KB | 3.0MB | 30.9KB | 125.7KB |
| terminal-kit | 1 | 930µs | 0.0% | 894µs–984µs | 1.1K ops/s | 46.51ms | 54.03ms | 335µs | 88.1MB | 17.8MB | 0.00KB | 0.00KB |
| blessed | 1 | 9.56ms | 0.0% | 9.34ms–9.78ms | 105 ops/s | 477.84ms | 452.22ms | 138.05ms | 296.1MB | 100.4MB | 1.13KB | 0.00KB |
| Ratatui (Rust) | 1 | 1.23ms | 0.0% | 1.22ms–1.24ms | 811 ops/s | 61.62ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.55ms | 0.0% | 1.47ms–1.63ms | 646 ops/s | 77.35ms | 105.56ms | 7.06ms | 214.8MB | 99.0MB | 14.8KB | 0.00KB |
| Ink | 1 | 78.94ms | 0.0% | 74.04ms–83.97ms | 13 ops/s | 3.95s | 3.89s | 48.48ms | 632.0MB | 388.4MB | 2.0MB | 0.01KB |
| OpenTUI (React) | 1 | 102.49ms | 0.0% | 99.75ms–105.21ms | 10 ops/s | 5.12s | 6.16s | 391.96ms | 3.07GB | 1.48GB | 2.6MB | 2.6MB |
| OpenTUI (Core) | 1 | 17.60ms | 0.0% | 17.38ms–17.85ms | 57 ops/s | 879.97ms | 480.52ms | 440.81ms | 243.2MB | 55.8MB | 153.4KB | 153.4KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.30ms–8.36ms | 120 ops/s | 416.53ms | 36.60ms | 20.18ms | 0.00KB | 1.7MB | 55.3KB | 243.4KB |
| terminal-kit | 1 | 1.91ms | 0.0% | 1.87ms–1.97ms | 524 ops/s | 95.39ms | 104.82ms | 253µs | 88.9MB | 20.9MB | 0.00KB | 0.00KB |
| blessed | 1 | 19.73ms | 0.0% | 19.47ms–20.00ms | 51 ops/s | 986.68ms | 923.62ms | 270.73ms | 420.4MB | 186.1MB | 1.13KB | 0.00KB |
| Ratatui (Rust) | 1 | 2.37ms | 0.0% | 2.35ms–2.38ms | 422 ops/s | 118.46ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 391µs | 0.0% | 376µs–407µs | 2.6K ops/s | 19.56ms | 23.41ms | 362µs | 83.1MB | 15.6MB | 24.8KB | 6.53KB |
| Ink | 1 | 20.03ms | 0.0% | 15.06ms–25.02ms | 50 ops/s | 1.00s | 158.34ms | 5.32ms | 128.5MB | 34.1MB | 7.47KB | 9.37KB |
| OpenTUI (React) | 1 | 2.72ms | 0.0% | 2.61ms–2.82ms | 368 ops/s | 135.82ms | 109.09ms | 5.79ms | 120.3MB | 40.4MB | 15.3KB | 15.3KB |
| OpenTUI (Core) | 1 | 1.18ms | 0.0% | 1.05ms–1.28ms | 850 ops/s | 58.82ms | 21.73ms | 2.46ms | 85.9MB | 37.6MB | 12.4KB | 12.4KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.26ms–8.36ms | 120 ops/s | 415.80ms | 10.63ms | 15.50ms | 0.00KB | 506.0KB | 12.3KB | 15.3KB |
| terminal-kit | 1 | 60µs | 0.0% | 59µs–63µs | 16.4K ops/s | 3.04ms | 4.47ms | 37µs | 83.5MB | 15.6MB | 0.00KB | 0.00KB |
| blessed | 1 | 71µs | 0.0% | 66µs–78µs | 14.0K ops/s | 3.58ms | 7.87ms | 733µs | 85.5MB | 18.3MB | 1.96KB | 0.00KB |
| Ratatui (Rust) | 1 | 70µs | 0.0% | 70µs–71µs | 14.3K ops/s | 3.51ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.22ms | 0.0% | 1.16ms–1.29ms | 816 ops/s | 61.24ms | 92.07ms | 5.80ms | 188.0MB | 99.4MB | 62.9KB | 0.00KB |
| Ink | 1 | 45.72ms | 0.0% | 41.07ms–50.54ms | 22 ops/s | 2.29s | 1.96s | 47.86ms | 450.3MB | 139.8MB | 1.4MB | 0.01KB |
| OpenTUI (React) | 1 | 61.21ms | 0.0% | 59.68ms–62.77ms | 16 ops/s | 3.06s | 3.94s | 208.62ms | 2.10GB | 721.4MB | 1.7MB | 1.7MB |
| OpenTUI (Core) | 1 | 8.67ms | 0.0% | 8.52ms–8.85ms | 115 ops/s | 433.46ms | 293.22ms | 225.35ms | 228.1MB | 46.6MB | 88.7KB | 88.7KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.29ms–8.36ms | 120 ops/s | 416.45ms | 28.89ms | 17.88ms | 0.00KB | 1.3MB | 42.6KB | 139.4KB |
| terminal-kit | 1 | 1.25ms | 0.0% | 1.21ms–1.32ms | 799 ops/s | 62.57ms | 74.00ms | 286µs | 95.0MB | 21.2MB | 0.00KB | 0.00KB |
| blessed | 1 | 495µs | 0.0% | 456µs–558µs | 2.0K ops/s | 24.77ms | 41.58ms | 2.39ms | 161.6MB | 59.4MB | 6.55KB | 0.00KB |
| Ratatui (Rust) | 1 | 1.33ms | 0.0% | 1.32ms–1.35ms | 750 ops/s | 66.65ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.38ms | 0.0% | 1.35ms–1.41ms | 724 ops/s | 69.04ms | 108.58ms | 3.02ms | 120.9MB | 38.3MB | 744.9KB | 261.8KB |
| Ink | 1 | 25.78ms | 0.0% | 21.28ms–30.41ms | 39 ops/s | 1.29s | 667.31ms | 17.40ms | 273.0MB | 96.0MB | 465.8KB | 585.0KB |
| OpenTUI (React) | 1 | 14.55ms | 0.0% | 14.27ms–14.84ms | 69 ops/s | 727.74ms | 1.08s | 50.21ms | 550.7MB | 172.6MB | 504.7KB | 504.7KB |
| OpenTUI (Core) | 1 | 1.41ms | 0.0% | 1.34ms–1.49ms | 708 ops/s | 70.64ms | 80.14ms | 31.99ms | 112.5MB | 39.5MB | 442.1KB | 442.1KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.26ms–8.36ms | 120 ops/s | 415.68ms | 23.33ms | 24.56ms | 0.00KB | 1.2MB | 120.5KB | 151.7KB |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 6.85ms | 0.0% | 6.62ms–7.13ms | 146 ops/s | 342.39ms | 387.31ms | 24.54ms | 343.5MB | 160.3MB | 282.5KB | 20.7KB |
| Ink | 1 | 177.15ms | 0.0% | 171.97ms–182.50ms | 6 ops/s | 8.86s | 9.54s | 200.62ms | 1.25GB | 893.3MB | 4.1MB | 5.4MB |
| OpenTUI (React) | 1 | 264.78ms | 0.0% | 254.82ms–274.85ms | 4 ops/s | 13.24s | 15.23s | 1.66s | 5.44GB | 3.64GB | 302.4KB | 302.4KB |
| OpenTUI (Core) | 1 | 31.55ms | 0.0% | 31.26ms–31.85ms | 32 ops/s | 1.58s | 816.37ms | 805.85ms | 274.6MB | 78.1MB | 99.0KB | 99.0KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.24ms–8.41ms | 120 ops/s | 416.33ms | 82.02ms | 24.13ms | 0.00KB | 2.6MB | 238.6KB | 293.5KB |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 773µs | 0.0% | 749µs–799µs | 1.3K ops/s | 38.69ms | 48.58ms | 1.74ms | 92.0MB | 23.4MB | 295.3KB | 106.1KB |
| Ink | 1 | 22.60ms | 0.0% | 17.87ms–27.37ms | 44 ops/s | 1.13s | 410.89ms | 11.44ms | 249.8MB | 77.9MB | 92.7KB | 119.9KB |
| OpenTUI (React) | 1 | 5.93ms | 0.0% | 5.72ms–6.15ms | 168 ops/s | 296.78ms | 468.02ms | 19.55ms | 308.9MB | 90.2MB | 348.1KB | 348.1KB |
| OpenTUI (Core) | 1 | 1.26ms | 0.0% | 1.15ms–1.37ms | 795 ops/s | 62.91ms | 72.19ms | 19.91ms | 107.6MB | 38.9MB | 324.4KB | 324.4KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.29ms–8.37ms | 120 ops/s | 416.54ms | 20.49ms | 24.63ms | 0.00KB | 2.7MB | 242.5KB | 298.3KB |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.33ms | 0.0% | 1.29ms–1.37ms | 751 ops/s | 66.59ms | 102.05ms | 2.98ms | 121.3MB | 41.9MB | 628.7KB | 286.9KB |
| Ink | 1 | 34.10ms | 0.0% | 29.59ms–38.68ms | 29 ops/s | 1.70s | 1.17s | 29.65ms | 405.9MB | 155.5MB | 532.2KB | 672.3KB |
| OpenTUI (React) | 1 | 25.54ms | 0.0% | 24.94ms–26.15ms | 39 ops/s | 1.28s | 1.74s | 83.42ms | 1.05GB | 484.5MB | 829.7KB | 829.7KB |
| OpenTUI (Core) | 1 | 1.64ms | 0.0% | 1.57ms–1.72ms | 608 ops/s | 82.18ms | 97.05ms | 39.39ms | 115.6MB | 40.0MB | 845.1KB | 845.1KB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.25ms–8.36ms | 120 ops/s | 415.63ms | 24.43ms | 21.47ms | 0.00KB | 1.8MB | 238.6KB | 293.5KB |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 724µs | 0.0% | 699µs–751µs | 1.4K ops/s | 36.31ms | 50.19ms | 1.31ms | 88.8MB | 18.2MB | 129.4KB | 54.0KB |
| Ink | 1 | 21.14ms | 0.0% | 16.29ms–26.03ms | 47 ops/s | 1.06s | 258.84ms | 4.20ms | 141.4MB | 40.3MB | 37.8KB | 47.1KB |
| OpenTUI (React) | 1 | 2.59ms | 0.0% | 2.43ms–2.76ms | 386 ops/s | 129.69ms | 142.77ms | 6.44ms | 143.0MB | 46.3MB | 58.7KB | 58.7KB |
| OpenTUI (Core) | 1 | 1.22ms | 0.0% | 1.09ms–1.34ms | 817 ops/s | 61.22ms | 58.87ms | 9.06ms | 102.3MB | 38.2MB | 57.0KB | 57.0KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.27ms–8.36ms | 120 ops/s | 415.90ms | 18.02ms | 23.67ms | 0.00KB | 1.5MB | 131.4KB | 161.7KB |
| terminal-kit | 1 | 103µs | 0.0% | 93µs–112µs | 9.6K ops/s | 5.19ms | 11.23ms | 141µs | 84.9MB | 18.7MB | 0.00KB | 0.00KB |
| blessed | 1 | 198µs | 0.0% | 188µs–210µs | 5.0K ops/s | 10.00ms | 17.42ms | 2.30ms | 88.7MB | 22.0MB | 25.0KB | 0.00KB |
| Ratatui (Rust) | 1 | 82µs | 0.0% | 82µs–83µs | 12.1K ops/s | 4.12ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 346µs | 0.0% | 341µs–353µs | 2.9K ops/s | 17.34ms | 19.11ms | 167µs | 82.9MB | 14.6MB | 13.9KB | 5.35KB |
| Ink | 1 | 19.35ms | 0.0% | 14.49ms–24.22ms | 52 ops/s | 967.48ms | 134.23ms | 5.76ms | 132.5MB | 35.3MB | 4.15KB | 5.23KB |
| OpenTUI (React) | 1 | 2.66ms | 0.0% | 2.55ms–2.76ms | 376 ops/s | 133.14ms | 55.99ms | 4.79ms | 96.7MB | 39.2MB | 12.8KB | 12.8KB |
| OpenTUI (Core) | 1 | 1.19ms | 0.0% | 1.08ms–1.28ms | 840 ops/s | 59.51ms | 18.62ms | 2.05ms | 85.1MB | 37.6MB | 10.2KB | 10.2KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 415.98ms | 13.10ms | 18.92ms | 0.00KB | 470.0KB | 6.30KB | 7.96KB |
| blessed | 1 | 56µs | 0.0% | 53µs–60µs | 17.9K ops/s | 2.79ms | 7.71ms | 40µs | 85.8MB | 15.5MB | 1.12KB | 1.12KB |
| Ratatui (Rust) | 1 | 72µs | 0.0% | 72µs–72µs | 13.9K ops/s | 3.60ms | 3.85ms | 764µs | 2.3MB | n/a | 1.91KB | 1.91KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 389µs | 0.0% | 379µs–401µs | 2.6K ops/s | 19.46ms | 24.70ms | 449µs | 84.2MB | 18.2MB | 17.8KB | 6.55KB |
| Ink | 1 | 21.32ms | 0.0% | 16.39ms–26.29ms | 47 ops/s | 1.07s | 271.85ms | 7.40ms | 168.7MB | 48.7MB | 29.2KB | 38.6KB |
| OpenTUI (React) | 1 | 3.05ms | 0.0% | 2.92ms–3.19ms | 328 ops/s | 152.65ms | 159.81ms | 7.93ms | 161.1MB | 50.8MB | 118.1KB | 118.1KB |
| OpenTUI (Core) | 1 | 1.24ms | 0.0% | 1.12ms–1.35ms | 803 ops/s | 62.24ms | 67.52ms | 15.10ms | 106.3MB | 38.8MB | 12.9KB | 12.9KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.27ms–8.35ms | 120 ops/s | 415.84ms | 15.40ms | 21.00ms | 0.00KB | 1.7MB | 8.25KB | 17.1KB |
| blessed | 1 | 61µs | 0.0% | 58µs–66µs | 16.2K ops/s | 3.08ms | 9.30ms | 144µs | 87.0MB | 16.7MB | 2.89KB | 2.89KB |
| Ratatui (Rust) | 1 | 185µs | 0.0% | 184µs–185µs | 5.4K ops/s | 9.24ms | 10.65ms | 616µs | 2.4MB | n/a | 3.82KB | 3.82KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 728µs | 0.0% | 686µs–772µs | 1.4K ops/s | 36.41ms | 47.28ms | 999µs | 85.7MB | 20.2MB | 198.4KB | 34.4KB |
| Ink | 1 | 21.72ms | 0.0% | 16.71ms–26.75ms | 46 ops/s | 1.09s | 289.56ms | 9.36ms | 171.7MB | 47.3MB | 52.0KB | 66.3KB |
| OpenTUI (React) | 1 | 3.10ms | 0.0% | 2.94ms–3.27ms | 322 ops/s | 155.06ms | 162.10ms | 9.72ms | 160.6MB | 50.7MB | 251.9KB | 251.9KB |
| OpenTUI (Core) | 1 | 1.38ms | 0.0% | 1.28ms–1.48ms | 723 ops/s | 69.19ms | 68.50ms | 19.46ms | 106.6MB | 38.9MB | 204.2KB | 204.2KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.28ms–8.38ms | 120 ops/s | 416.54ms | 20.43ms | 25.19ms | 0.00KB | 2.5MB | 238.6KB | 293.5KB |
| blessed | 1 | 193µs | 0.0% | 172µs–228µs | 5.2K ops/s | 9.64ms | 17.20ms | 599µs | 89.0MB | 19.5MB | 66.9KB | 66.9KB |
| Ratatui (Rust) | 1 | 203µs | 0.0% | 201µs–205µs | 4.9K ops/s | 10.13ms | 11.51ms | 793µs | 2.4MB | n/a | 59.9KB | 59.9KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 731µs | 0.0% | 717µs–747µs | 1.4K ops/s | 36.59ms | 47.53ms | 1.19ms | 86.1MB | 20.9MB | 198.4KB | 87.9KB |
| Ink | 1 | 21.55ms | 0.0% | 16.59ms–26.57ms | 46 ops/s | 1.08s | 284.54ms | 8.56ms | 171.3MB | 38.9MB | 100.0KB | 125.5KB |
| OpenTUI (React) | 1 | 3.07ms | 0.0% | 2.95ms–3.19ms | 325 ops/s | 153.67ms | 164.87ms | 9.22ms | 163.3MB | 51.4MB | 362.9KB | 362.9KB |
| OpenTUI (Core) | 1 | 1.32ms | 0.0% | 1.22ms–1.43ms | 755 ops/s | 66.26ms | 70.06ms | 18.16ms | 106.0MB | 38.8MB | 363.4KB | 363.4KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.26ms–8.36ms | 120 ops/s | 415.88ms | 19.57ms | 23.04ms | 0.00KB | 3.0MB | 238.6KB | 293.5KB |
| blessed | 1 | 252µs | 0.0% | 243µs–262µs | 4.0K ops/s | 12.60ms | 19.42ms | 487µs | 95.1MB | 30.7MB | 171.5KB | 171.5KB |
| Ratatui (Rust) | 1 | 234µs | 0.0% | 233µs–236µs | 4.3K ops/s | 11.72ms | 13.22ms | 991µs | 2.5MB | n/a | 151.1KB | 151.1KB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.23ms | 0.0% | 1.21ms–1.24ms | 815 ops/s | 61.34ms | 71.94ms | 1.25ms | 88.5MB | 22.1MB | 226.6KB | 48.9KB |
| Ink | 1 | 22.06ms | 0.0% | 17.19ms–27.01ms | 45 ops/s | 1.10s | 299.13ms | 7.77ms | 171.0MB | 35.7MB | 133.2KB | 167.5KB |
| OpenTUI (React) | 1 | 3.17ms | 0.0% | 3.01ms–3.33ms | 316 ops/s | 158.42ms | 168.76ms | 9.12ms | 163.5MB | 51.4MB | 336.0KB | 336.0KB |
| OpenTUI (Core) | 1 | 1.27ms | 0.0% | 1.14ms–1.39ms | 789 ops/s | 63.37ms | 72.41ms | 16.27ms | 106.6MB | 38.8MB | 314.1KB | 314.1KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 416.21ms | 20.85ms | 24.97ms | 0.00KB | 2.6MB | 238.5KB | 293.4KB |
| blessed | 1 | 282µs | 0.0% | 264µs–312µs | 3.5K ops/s | 14.11ms | 20.85ms | 686µs | 91.0MB | 21.8MB | 78.7KB | 78.7KB |
| Ratatui (Rust) | 1 | 220µs | 0.0% | 218µs–221µs | 4.6K ops/s | 10.98ms | 12.38ms | 967µs | 2.5MB | n/a | 82.8KB | 82.8KB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 727µs | 0.0% | 711µs–744µs | 1.4K ops/s | 36.36ms | 47.19ms | 1.04ms | 86.1MB | 20.6MB | 198.4KB | 17.0KB |
| Ink | 1 | 21.62ms | 0.0% | 16.65ms–26.63ms | 46 ops/s | 1.08s | 284.91ms | 7.58ms | 172.3MB | 47.7MB | 49.5KB | 63.7KB |
| OpenTUI (React) | 1 | 3.09ms | 0.0% | 2.96ms–3.22ms | 324 ops/s | 154.52ms | 162.52ms | 8.24ms | 161.5MB | 51.0MB | 204.3KB | 204.3KB |
| OpenTUI (Core) | 1 | 1.22ms | 0.0% | 1.10ms–1.33ms | 821 ops/s | 60.87ms | 68.37ms | 15.59ms | 106.5MB | 38.8MB | 102.8KB | 102.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.37ms | 120 ops/s | 416.10ms | 20.18ms | 24.05ms | 0.00KB | 2.9MB | 232.7KB | 286.5KB |
| blessed | 1 | 192µs | 0.0% | 182µs–204µs | 5.2K ops/s | 9.61ms | 16.92ms | 500µs | 87.2MB | 19.0MB | 31.4KB | 39.2KB |
| Ratatui (Rust) | 1 | 190µs | 0.0% | 190µs–191µs | 5.3K ops/s | 9.52ms | 10.93ms | 672µs | 2.4MB | n/a | 25.0KB | 25.0KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 662µs | 0.0% | 649µs–677µs | 1.5K ops/s | 33.11ms | 44.58ms | 823µs | 85.8MB | 20.7MB | 198.4KB | 25.1KB |
| Ink | 1 | 21.51ms | 0.0% | 16.61ms–26.47ms | 46 ops/s | 1.08s | 275.72ms | 8.17ms | 168.1MB | 38.9MB | 42.4KB | 54.9KB |
| OpenTUI (React) | 1 | 3.11ms | 0.0% | 2.97ms–3.26ms | 321 ops/s | 155.75ms | 162.40ms | 8.92ms | 161.7MB | 51.2MB | 278.8KB | 278.8KB |
| OpenTUI (Core) | 1 | 1.32ms | 0.0% | 1.21ms–1.42ms | 760 ops/s | 65.77ms | 69.82ms | 19.25ms | 106.4MB | 38.7MB | 180.9KB | 180.9KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 416.12ms | 17.36ms | 20.89ms | 0.00KB | 2.9MB | 238.6KB | 293.5KB |
| blessed | 1 | 172µs | 0.0% | 162µs–186µs | 5.8K ops/s | 8.61ms | 16.77ms | 196µs | 87.5MB | 18.8MB | 51.6KB | 51.6KB |
| Ratatui (Rust) | 1 | 198µs | 0.0% | 198µs–199µs | 5.0K ops/s | 9.92ms | 11.39ms | 747µs | 2.5MB | n/a | 42.7KB | 42.7KB |

## terminal-full-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.24ms | 0.0% | 1.22ms–1.27ms | 806 ops/s | 62.06ms | 76.56ms | 1.72ms | 89.4MB | 15.1MB | 202.0KB | 101.0KB |
| Ink | 1 | 22.09ms | 0.0% | 17.20ms–27.02ms | 45 ops/s | 1.10s | 308.88ms | 8.26ms | 170.1MB | 35.8MB | 230.1KB | 287.6KB |
| OpenTUI (React) | 1 | 3.15ms | 0.0% | 2.99ms–3.32ms | 317 ops/s | 157.71ms | 166.83ms | 8.97ms | 162.2MB | 51.8MB | 483.5KB | 483.5KB |
| OpenTUI (Core) | 1 | 1.31ms | 0.0% | 1.20ms–1.41ms | 765 ops/s | 65.32ms | 72.10ms | 22.86ms | 107.3MB | 38.9MB | 889.2KB | 889.2KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.30ms–8.36ms | 120 ops/s | 416.39ms | 11.31ms | 12.88ms | 0.00KB | 1.7MB | 233.7KB | 287.8KB |
| blessed | 1 | 331µs | 0.0% | 295µs–392µs | 3.0K ops/s | 16.58ms | 25.70ms | 925µs | 100.3MB | 22.4MB | 180.8KB | 180.8KB |
| Ratatui (Rust) | 1 | 267µs | 0.0% | 265µs–269µs | 3.7K ops/s | 13.35ms | 14.69ms | 1.59ms | 2.8MB | n/a | 226.1KB | 226.1KB |

## terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 706µs | 0.0% | 689µs–724µs | 1.4K ops/s | 35.32ms | 48.28ms | 970µs | 86.7MB | 21.8MB | 195.3KB | 52.2KB |
| Ink | 1 | 21.00ms | 0.0% | 16.17ms–25.87ms | 48 ops/s | 1.05s | 256.33ms | 8.07ms | 172.9MB | 27.5MB | 123.0KB | 161.5KB |
| OpenTUI (React) | 1 | 3.11ms | 0.0% | 2.97ms–3.25ms | 322 ops/s | 155.52ms | 169.62ms | 10.50ms | 163.2MB | 51.3MB | 553.8KB | 553.8KB |
| OpenTUI (Core) | 1 | 1.20ms | 0.0% | 1.09ms–1.32ms | 830 ops/s | 60.23ms | 71.71ms | 21.43ms | 107.2MB | 38.9MB | 580.8KB | 580.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.29ms–8.36ms | 120 ops/s | 416.19ms | 17.03ms | 21.36ms | 0.00KB | 3.1MB | 221.3KB | 272.7KB |
| blessed | 1 | 221µs | 0.0% | 209µs–232µs | 4.5K ops/s | 11.05ms | 17.61ms | 517µs | 96.7MB | 31.8MB | 136.3KB | 136.3KB |
| Ratatui (Rust) | 1 | 234µs | 0.0% | 225µs–243µs | 4.3K ops/s | 11.70ms | 13.12ms | 1.15ms | 2.6MB | n/a | 168.8KB | 168.8KB |

## terminal-strict-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 950µs | 0.0% | 923µs–980µs | 1.1K ops/s | 47.52ms | 63.09ms | 1.76ms | 91.7MB | 19.3MB | 1.1MB | 138.1KB |
| Ink | 1 | 22.41ms | 0.0% | 17.68ms–27.17ms | 45 ops/s | 1.12s | 413.70ms | 10.17ms | 180.4MB | 45.4MB | 279.0KB | 348.3KB |
| OpenTUI (React) | 1 | 4.60ms | 0.0% | 4.41ms–4.81ms | 217 ops/s | 230.16ms | 360.50ms | 17.24ms | 237.5MB | 71.5MB | 527.3KB | 527.3KB |
| OpenTUI (Core) | 1 | 1.27ms | 0.0% | 1.17ms–1.37ms | 788 ops/s | 63.44ms | 90.28ms | 25.91ms | 116.8MB | 39.8MB | 449.5KB | 449.5KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 416.16ms | 57.45ms | 15.62ms | 0.00KB | 18.5MB | 224.0KB | 277.1KB |
| blessed | 1 | 334µs | 0.0% | 316µs–361µs | 3.0K ops/s | 16.71ms | 54.30ms | 1.09ms | 104.5MB | 23.6MB | 94.7KB | 94.7KB |
| Ratatui (Rust) | 1 | 189µs | 0.0% | 187µs–191µs | 5.3K ops/s | 9.45ms | 10.55ms | 1.19ms | 2.9MB | n/a | 134.6KB | 134.6KB |

## terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 976µs | 0.0% | 949µs–1.01ms | 1.0K ops/s | 48.84ms | 64.43ms | 2.02ms | 92.0MB | 19.4MB | 1.2MB | 129.1KB |
| Ink | 1 | 22.53ms | 0.0% | 17.86ms–27.26ms | 44 ops/s | 1.13s | 430.30ms | 10.64ms | 185.6MB | 58.9MB | 288.9KB | 358.2KB |
| OpenTUI (React) | 1 | 4.70ms | 0.0% | 4.49ms–4.93ms | 213 ops/s | 235.08ms | 364.37ms | 17.01ms | 237.3MB | 70.5MB | 502.3KB | 502.3KB |
| OpenTUI (Core) | 1 | 1.35ms | 0.0% | 1.26ms–1.45ms | 739 ops/s | 67.63ms | 91.67ms | 28.73ms | 116.8MB | 40.0MB | 443.8KB | 443.8KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 416.05ms | 47.28ms | 14.51ms | 0.00KB | 15.4MB | 226.6KB | 280.1KB |
| blessed | 1 | 342µs | 0.0% | 321µs–373µs | 2.9K ops/s | 17.11ms | 53.52ms | 869µs | 104.2MB | 23.9MB | 102.9KB | 102.9KB |
| Ratatui (Rust) | 1 | 193µs | 0.0% | 190µs–196µs | 5.2K ops/s | 9.64ms | 10.83ms | 1.12ms | 3.0MB | n/a | 140.4KB | 140.4KB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 798µs | 0.0% | 776µs–822µs | 1.3K ops/s | 39.90ms | 56.92ms | 1.52ms | 93.2MB | 17.9MB | 299.6KB | 106.1KB |
| Ink | 1 | 22.56ms | 0.0% | 17.91ms–27.28ms | 44 ops/s | 1.13s | 442.41ms | 13.13ms | 249.0MB | 55.0MB | 93.3KB | 120.6KB |
| OpenTUI (React) | 1 | 6.75ms | 0.0% | 6.55ms–6.96ms | 148 ops/s | 337.47ms | 525.88ms | 24.71ms | 366.1MB | 102.5MB | 350.9KB | 350.9KB |
| OpenTUI (Core) | 1 | 1.09ms | 0.0% | 971µs–1.21ms | 916 ops/s | 54.61ms | 71.68ms | 16.09ms | 107.0MB | 38.9MB | 328.1KB | 328.1KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 415.97ms | 13.02ms | 16.57ms | 0.00KB | 2.7MB | 242.5KB | 298.3KB |
| blessed | 1 | 154µs | 0.0% | 128µs–187µs | 6.5K ops/s | 7.69ms | 17.18ms | 533µs | 88.5MB | 19.6MB | 66.0KB | 66.0KB |
| Ratatui (Rust) | 1 | 129µs | 0.0% | 127µs–132µs | 7.7K ops/s | 6.47ms | 6.82ms | 978µs | 2.4MB | n/a | 75.5KB | 75.5KB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 526µs | 0.0% | 486µs–569µs | 1.9K ops/s | 26.31ms | 34.47ms | 749µs | 87.3MB | 21.5MB | 96.3KB | 6.03KB |
| Ink | 1 | 21.11ms | 0.0% | 16.28ms–25.97ms | 47 ops/s | 1.06s | 259.15ms | 9.31ms | 166.0MB | 49.2MB | 156.7KB | 196.8KB |
| OpenTUI (React) | 1 | 3.11ms | 0.0% | 2.99ms–3.23ms | 322 ops/s | 155.50ms | 167.70ms | 8.29ms | 168.2MB | 51.9MB | 68.4KB | 68.4KB |
| OpenTUI (Core) | 1 | 1.18ms | 0.0% | 1.07ms–1.30ms | 844 ops/s | 59.23ms | 69.45ms | 15.63ms | 107.1MB | 38.8MB | 13.0KB | 13.0KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.28ms–8.36ms | 120 ops/s | 416.20ms | 17.62ms | 17.06ms | 0.00KB | 942.0KB | 14.2KB | 24.2KB |
| blessed | 1 | 133µs | 0.0% | 117µs–153µs | 7.5K ops/s | 6.65ms | 16.84ms | 129µs | 87.5MB | 22.6MB | 5.56KB | 5.56KB |
| Ratatui (Rust) | 1 | 182µs | 0.0% | 181µs–183µs | 5.5K ops/s | 9.10ms | 10.49ms | 639µs | 2.5MB | n/a | 6.72KB | 6.72KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | Ink | OpenTUI (React) | OpenTUI (Core) | terminal-kit | blessed | Ratatui (Rust) |
|---|---:|---:|---:|---:|---:|---:|
| startup | 2.6x slower [2.4x, 2.9x] | 3.7x slower [3.5x, 3.9x] | 3.0x slower [2.7x, 3.3x] | 16.8x faster [14.5x, 19.6x] | 1.3x faster [1.1x, 1.5x] | 8.9x faster [8.6x, 9.3x] |
| tree-construction (items=10) | 252.8x slower [162.5x, 367.9x] | 34.7x slower [27.6x, 43.0x] | 13.4x slower [9.9x, 17.5x] | 1.2x slower [0.9x, 1.4x] (inconclusive) | 3.1x slower [2.4x, 4.0x] | 10.4x slower [8.6x, 12.5x] |
| tree-construction (items=100) | 118.0x slower [88.4x, 151.4x] | 51.2x slower [46.1x, 56.5x] | 7.6x slower [6.7x, 8.6x] | 1.0x faster [0.9x, 1.2x] (inconclusive) | 8.7x slower [7.9x, 9.6x] | 4.4x slower [4.0x, 4.8x] |
| tree-construction (items=500) | 64.6x slower [55.3x, 74.8x] | 64.5x slower [59.9x, 69.6x] | 11.0x slower [10.3x, 11.9x] | 1.2x slower [1.1x, 1.4x] | 12.6x slower [11.7x, 13.6x] | 1.6x slower [1.5x, 1.7x] |
| tree-construction (items=1000) | 51.0x slower [45.5x, 57.1x] | 66.3x slower [61.3x, 71.5x] | 11.4x slower [10.7x, 12.1x] | 1.2x slower [1.1x, 1.3x] | 12.8x slower [12.0x, 13.6x] | 1.5x slower [1.4x, 1.6x] |
| rerender | 51.2x slower [37.0x, 66.5x] | 6.9x slower [6.4x, 7.5x] | 3.0x slower [2.6x, 3.4x] | 6.5x faster [6.0x, 6.9x] | 5.5x faster [4.8x, 6.2x] | 5.6x faster [5.3x, 5.8x] |
| content-update | 37.3x slower [31.8x, 43.4x] | 50.0x slower [46.2x, 53.9x] | 7.1x slower [6.6x, 7.6x] | 1.0x slower [0.9x, 1.1x] (inconclusive) | 2.5x faster [2.1x, 2.8x] | 1.1x slower [1.0x, 1.2x] |
| layout-stress (rows=40,cols=4) | 18.7x slower [15.1x, 22.5x] | 10.5x slower [10.1x, 11.0x] | 1.0x slower [0.9x, 1.1x] (inconclusive) | N/A | N/A | N/A |
| scroll-stress (items=2000) | 25.9x slower [24.1x, 27.6x] | 38.7x slower [35.7x, 41.5x] | 4.6x slower [4.4x, 4.8x] | N/A | N/A | N/A |
| virtual-list (items=100000,viewport=40) | 29.2x slower [22.4x, 36.5x] | 7.7x slower [7.2x, 8.2x] | 1.6x slower [1.4x, 1.8x] | N/A | N/A | N/A |
| tables (rows=100,cols=8) | 25.6x slower [21.6x, 29.9x] | 19.2x slower [18.2x, 20.2x] | 1.2x slower [1.1x, 1.3x] | N/A | N/A | N/A |
| memory-profile | 29.2x slower [21.7x, 37.2x] | 3.6x slower [3.2x, 3.9x] | 1.7x slower [1.5x, 1.9x] | 7.1x faster [6.2x, 8.0x] | 3.7x faster [3.3x, 4.0x] | 8.8x faster [8.4x, 9.2x] |
| terminal-rerender | 55.8x slower [41.0x, 71.0x] | 7.7x slower [7.2x, 8.1x] | 3.4x slower [3.1x, 3.7x] | N/A | 6.2x faster [5.7x, 6.7x] | 4.8x faster [4.7x, 4.9x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 54.8x slower [40.9x, 69.3x] | 7.8x slower [7.3x, 8.4x] | 3.2x slower [2.8x, 3.6x] | N/A | 6.3x faster [5.8x, 6.9x] | 2.1x faster [2.0x, 2.2x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 29.8x slower [21.6x, 39.0x] | 4.3x slower [3.8x, 4.8x] | 1.9x slower [1.7x, 2.2x] | N/A | 3.8x faster [3.0x, 4.5x] | 3.6x faster [3.4x, 3.8x] |
| terminal-screen-transition (rows=40,cols=120) | 29.5x slower [22.2x, 37.1x] | 4.2x slower [3.9x, 4.5x] | 1.8x slower [1.6x, 2.0x] | N/A | 2.9x faster [2.7x, 3.1x] | 3.1x faster [3.0x, 3.2x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 18.0x slower [13.8x, 22.3x] | 2.6x slower [2.4x, 2.7x] | 1.0x slower [0.9x, 1.1x] (inconclusive) | N/A | 4.4x faster [3.9x, 4.7x] | 5.6x faster [5.5x, 5.7x] |
| terminal-input-latency (rows=40,cols=120) | 29.7x slower [22.4x, 37.5x] | 4.3x slower [4.0x, 4.5x] | 1.7x slower [1.5x, 1.9x] | N/A | 3.8x faster [3.5x, 4.1x] | 3.8x faster [3.7x, 3.9x] |
| terminal-memory-soak (rows=40,cols=120) | 32.5x slower [24.5x, 40.8x] | 4.7x slower [4.4x, 5.0x] | 2.0x slower [1.8x, 2.2x] | N/A | 3.9x faster [3.5x, 4.2x] | 3.3x faster [3.3x, 3.4x] |
| terminal-full-ui (rows=40,cols=120,services=24) | 17.8x slower [13.6x, 22.2x] | 2.5x slower [2.4x, 2.7x] | 1.1x slower [0.9x, 1.2x] (inconclusive) | N/A | 3.7x faster [3.1x, 4.3x] | 4.6x faster [4.5x, 4.8x] |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 29.8x slower [22.3x, 37.5x] | 4.4x slower [4.1x, 4.7x] | 1.7x slower [1.5x, 1.9x] | N/A | 3.2x faster [3.0x, 3.5x] | 3.0x faster [2.8x, 3.2x] |
| terminal-strict-ui (rows=40,cols=120,services=24) | 23.6x slower [18.0x, 29.4x] | 4.8x slower [4.5x, 5.2x] | 1.3x slower [1.2x, 1.5x] | N/A | 2.8x faster [2.6x, 3.1x] | 5.0x faster [4.8x, 5.3x] |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 23.1x slower [17.8x, 28.7x] | 4.8x slower [4.5x, 5.2x] | 1.4x slower [1.3x, 1.5x] | N/A | 2.9x faster [2.5x, 3.1x] | 5.1x faster [4.8x, 5.3x] |
| terminal-virtual-list (items=100000,viewport=40) | 28.3x slower [21.8x, 35.2x] | 8.5x slower [8.0x, 9.0x] | 1.4x slower [1.2x, 1.6x] | N/A | 5.2x faster [4.1x, 6.4x] | 6.2x faster [5.9x, 6.5x] |
| terminal-table (rows=40,cols=8) | 40.1x slower [28.6x, 53.5x] | 5.9x slower [5.3x, 6.7x] | 2.3x slower [1.9x, 2.7x] | N/A | 4.0x faster [3.2x, 4.9x] | 2.9x faster [2.7x, 3.1x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 129.7MB | 40.2MB | +38.1MB | +26.0MB | N/A | N/A |
| startup | Ink | 341.6MB | 74.2MB | +146.4MB | +51.2MB | N/A | N/A |
| startup | OpenTUI (React) | 244.4MB | 109.0MB | +103.1MB | +58.0MB | N/A | N/A |
| startup | OpenTUI (Core) | 138.0MB | 53.1MB | +28.3MB | +12.4MB | N/A | N/A |
| startup | Bubble Tea (Go) | 0.00KB | 1.2MB | 0KB | +861.0KB | N/A | N/A |
| startup | terminal-kit | 141.6MB | 48.6MB | +47.6MB | +32.2MB | N/A | N/A |
| startup | blessed | 308.4MB | 130.3MB | +186.1MB | +99.2MB | N/A | N/A |
| startup | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 81.5MB | 17.8MB | +1.9MB | +4.7MB | N/A | N/A |
| tree-construction (items=10) | Ink | 135.8MB | 28.8MB | +1.2MB | +7.5MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI (React) | 160.1MB | 50.1MB | +37.9MB | +9.4MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI (Core) | 93.7MB | 37.9MB | +8.0MB | +338.0KB | N/A | N/A |
| tree-construction (items=10) | Bubble Tea (Go) | 0.00KB | 818.0KB | 0KB | +454.0KB | N/A | N/A |
| tree-construction (items=10) | terminal-kit | 84.6MB | 18.0MB | +384.0KB | +3.6MB | N/A | N/A |
| tree-construction (items=10) | blessed | 89.2MB | 19.2MB | +3.0MB | +4.1MB | N/A | N/A |
| tree-construction (items=10) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 92.8MB | 20.9MB | +6.7MB | +6.6MB | N/A | N/A |
| tree-construction (items=100) | Ink | 270.2MB | 108.8MB | +78.6MB | +84.1MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI (React) | 505.3MB | 152.0MB | +307.7MB | +94.1MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI (Core) | 116.9MB | 40.2MB | +15.2MB | +1.6MB | N/A | N/A |
| tree-construction (items=100) | Bubble Tea (Go) | 0.00KB | 842.0KB | 0KB | +428.0KB | N/A | N/A |
| tree-construction (items=100) | terminal-kit | 85.3MB | 15.0MB | +144.0KB | +606.0KB | N/A | N/A |
| tree-construction (items=100) | blessed | 110.8MB | 29.6MB | +3.8MB | +12.7MB | N/A | N/A |
| tree-construction (items=100) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 143.2MB | 58.8MB | +27.2MB | +41.0MB | N/A | N/A |
| tree-construction (items=500) | Ink | 453.1MB | 277.2MB | +115.3MB | +240.4MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI (React) | 1.63GB | 832.3MB | +1.15GB | +678.4MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI (Core) | 221.9MB | 46.6MB | +81.3MB | +6.7MB | N/A | N/A |
| tree-construction (items=500) | Bubble Tea (Go) | 0.00KB | 3.0MB | 0KB | +2.4MB | N/A | N/A |
| tree-construction (items=500) | terminal-kit | 88.1MB | 17.8MB | +144.0KB | +3.4MB | N/A | N/A |
| tree-construction (items=500) | blessed | 296.1MB | 100.4MB | +139.2MB | +73.8MB | N/A | N/A |
| tree-construction (items=500) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 214.8MB | 99.0MB | +68.7MB | +76.7MB | N/A | N/A |
| tree-construction (items=1000) | Ink | 632.0MB | 388.4MB | +93.9MB | +336.1MB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI (React) | 3.07GB | 1.48GB | +2.32GB | +1.23GB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI (Core) | 243.2MB | 55.8MB | +62.5MB | +14.2MB | N/A | N/A |
| tree-construction (items=1000) | Bubble Tea (Go) | 0.00KB | 1.7MB | 0KB | +942.0KB | N/A | N/A |
| tree-construction (items=1000) | terminal-kit | 88.9MB | 20.9MB | +32.0KB | +6.5MB | N/A | N/A |
| tree-construction (items=1000) | blessed | 420.4MB | 186.1MB | +150.0MB | +147.4MB | N/A | N/A |
| tree-construction (items=1000) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| rerender | Rezi (native) | 83.1MB | 15.6MB | +272.0KB | +2.4MB | N/A | N/A |
| rerender | Ink | 128.5MB | 34.1MB | +7.6MB | +13.3MB | N/A | N/A |
| rerender | OpenTUI (React) | 120.3MB | 40.4MB | +30.0MB | +2.1MB | N/A | N/A |
| rerender | OpenTUI (Core) | 85.9MB | 37.6MB | +6.0MB | +213.0KB | N/A | N/A |
| rerender | Bubble Tea (Go) | 0.00KB | 506.0KB | 0KB | +147.0KB | N/A | N/A |
| rerender | terminal-kit | 83.5MB | 15.6MB | +16.0KB | +1.0MB | N/A | N/A |
| rerender | blessed | 85.5MB | 18.3MB | +240.0KB | +3.4MB | N/A | N/A |
| rerender | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| content-update | Rezi (native) | 188.0MB | 99.4MB | +60.1MB | +79.9MB | N/A | N/A |
| content-update | Ink | 450.3MB | 139.8MB | +133.3MB | +100.7MB | N/A | N/A |
| content-update | OpenTUI (React) | 2.10GB | 721.4MB | +1.54GB | +522.0MB | N/A | N/A |
| content-update | OpenTUI (Core) | 228.1MB | 46.6MB | +84.7MB | +6.6MB | N/A | N/A |
| content-update | Bubble Tea (Go) | 0.00KB | 1.3MB | 0KB | +754.0KB | N/A | N/A |
| content-update | terminal-kit | 95.0MB | 21.2MB | +112.0KB | +6.7MB | N/A | N/A |
| content-update | blessed | 161.6MB | 59.4MB | +30.4MB | +31.2MB | N/A | N/A |
| content-update | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 120.9MB | 38.3MB | +16.5MB | +22.1MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Ink | 273.0MB | 96.0MB | +82.3MB | +68.8MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI (React) | 550.7MB | 172.6MB | +333.6MB | +105.9MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI (Core) | 112.5MB | 39.5MB | +13.3MB | +1.1MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Bubble Tea (Go) | 0.00KB | 1.2MB | 0KB | +823.0KB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 343.5MB | 160.3MB | +149.6MB | +126.1MB | N/A | N/A |
| scroll-stress (items=2000) | Ink | 1.25GB | 893.3MB | +588.3MB | +793.8MB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI (React) | 5.44GB | 3.64GB | +3.76GB | +2.99GB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI (Core) | 274.6MB | 78.1MB | +41.1MB | +32.7MB | N/A | N/A |
| scroll-stress (items=2000) | Bubble Tea (Go) | 0.00KB | 2.6MB | 0KB | +1.3MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 92.0MB | 23.4MB | +6.9MB | +9.1MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Ink | 249.8MB | 77.9MB | +102.2MB | +54.0MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI (React) | 308.9MB | 90.2MB | +148.3MB | +42.3MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI (Core) | 107.6MB | 38.9MB | +15.4MB | +712.0KB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 0.00KB | 2.7MB | 0KB | +2.3MB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 121.3MB | 41.9MB | +16.8MB | +25.4MB | N/A | N/A |
| tables (rows=100,cols=8) | Ink | 405.9MB | 155.5MB | +129.1MB | +120.5MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI (React) | 1.05GB | 484.5MB | +748.0MB | +383.1MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI (Core) | 115.6MB | 40.0MB | +11.6MB | +1.7MB | N/A | N/A |
| tables (rows=100,cols=8) | Bubble Tea (Go) | 0.00KB | 1.8MB | 0KB | +1.4MB | N/A | N/A |
| memory-profile | Rezi (native) | 88.8MB | 18.2MB | +5.4MB | +4.4MB | 0.0000 KB/iter | yes |
| memory-profile | Ink | 141.4MB | 40.3MB | +464.0KB | +18.9MB | 0.0000 KB/iter | yes |
| memory-profile | OpenTUI (React) | 143.0MB | 46.3MB | +40.6MB | +6.6MB | N/A | N/A |
| memory-profile | OpenTUI (Core) | 102.3MB | 38.2MB | +15.7MB | +495.0KB | N/A | N/A |
| memory-profile | Bubble Tea (Go) | 0.00KB | 1.5MB | 0KB | +1.2MB | N/A | N/A |
| memory-profile | terminal-kit | 84.9MB | 18.7MB | +240.0KB | +4.3MB | 0.0000 KB/iter | yes |
| memory-profile | blessed | 88.7MB | 22.0MB | +2.1MB | +6.9MB | 0.0000 KB/iter | yes |
| memory-profile | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| terminal-rerender | Rezi (native) | 82.9MB | 14.6MB | +192.0KB | +1.6MB | N/A | N/A |
| terminal-rerender | Ink | 132.5MB | 35.3MB | +15.0MB | +14.7MB | N/A | N/A |
| terminal-rerender | OpenTUI (React) | 96.7MB | 39.2MB | +11.6MB | +969.0KB | N/A | N/A |
| terminal-rerender | OpenTUI (Core) | 85.1MB | 37.6MB | +5.8MB | +172.0KB | N/A | N/A |
| terminal-rerender | Bubble Tea (Go) | 0.00KB | 470.0KB | 0KB | +111.0KB | N/A | N/A |
| terminal-rerender | blessed | 85.8MB | 15.5MB | +176.0KB | +554.0KB | N/A | N/A |
| terminal-rerender | Ratatui (Rust) | 2.3MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 84.2MB | 18.2MB | +720.0KB | +4.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ink | 168.7MB | 48.7MB | +34.2MB | +27.4MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI (React) | 161.1MB | 50.8MB | +44.5MB | +9.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI (Core) | 106.3MB | 38.8MB | +16.1MB | +624.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Bubble Tea (Go) | 0.00KB | 1.7MB | 0KB | +1.3MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | blessed | 87.0MB | 16.7MB | +864.0KB | +1.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ratatui (Rust) | 2.4MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 85.7MB | 20.2MB | +2.9MB | +6.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ink | 171.7MB | 47.3MB | +36.1MB | +25.7MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI (React) | 160.6MB | 50.7MB | +44.6MB | +9.6MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI (Core) | 106.6MB | 38.9MB | +16.3MB | +739.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Bubble Tea (Go) | 0.00KB | 2.5MB | 0KB | +2.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | blessed | 89.0MB | 19.5MB | +1.8MB | +4.2MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ratatui (Rust) | 2.4MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 86.1MB | 20.9MB | +3.1MB | +7.6MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ink | 171.3MB | 38.9MB | +36.0MB | +17.2MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI (React) | 163.3MB | 51.4MB | +46.8MB | +10.7MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI (Core) | 106.0MB | 38.8MB | +15.9MB | +652.0KB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 3.0MB | 0KB | +2.6MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | blessed | 95.1MB | 30.7MB | +6.7MB | +14.9MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 88.5MB | 22.1MB | +5.6MB | +8.6MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ink | 171.0MB | 35.7MB | +36.7MB | +13.3MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI (React) | 163.5MB | 51.4MB | +45.7MB | +10.6MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI (Core) | 106.6MB | 38.8MB | +15.8MB | +791.0KB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Bubble Tea (Go) | 0.00KB | 2.6MB | 0KB | +2.2MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | blessed | 91.0MB | 21.8MB | +3.2MB | +6.4MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 86.1MB | 20.6MB | +2.9MB | +7.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ink | 172.3MB | 47.7MB | +30.8MB | +26.0MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI (React) | 161.5MB | 51.0MB | +46.5MB | +10.4MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI (Core) | 106.5MB | 38.8MB | +16.7MB | +781.0KB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 2.9MB | 0KB | +2.5MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | blessed | 87.2MB | 19.0MB | +288.0KB | +3.9MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ratatui (Rust) | 2.4MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 85.8MB | 20.7MB | +3.1MB | +7.3MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ink | 168.1MB | 38.9MB | +36.3MB | +17.2MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI (React) | 161.7MB | 51.2MB | +46.3MB | +10.3MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI (Core) | 106.4MB | 38.7MB | +16.0MB | +716.0KB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 2.9MB | 0KB | +2.5MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | blessed | 87.5MB | 18.8MB | +480.0KB | +3.6MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Rezi (native) | 89.4MB | 15.1MB | +6.1MB | +1.6MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ink | 170.1MB | 35.8MB | +36.5MB | +13.4MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | OpenTUI (React) | 162.2MB | 51.8MB | +46.5MB | +10.9MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | OpenTUI (Core) | 107.3MB | 38.9MB | +16.6MB | +681.0KB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Bubble Tea (Go) | 0.00KB | 1.7MB | 0KB | +1.4MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | blessed | 100.3MB | 22.4MB | +9.9MB | +6.5MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 2.8MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 86.7MB | 21.8MB | +4.1MB | +8.4MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 172.9MB | 27.5MB | +30.9MB | +5.9MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (React) | 163.2MB | 51.3MB | +45.4MB | +10.5MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (Core) | 107.2MB | 38.9MB | +16.5MB | +868.0KB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Bubble Tea (Go) | 0.00KB | 3.1MB | 0KB | +2.8MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | blessed | 96.7MB | 31.8MB | +7.6MB | +15.7MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Rezi (native) | 91.7MB | 19.3MB | +7.2MB | +4.9MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ink | 180.4MB | 45.4MB | +38.3MB | +21.7MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | OpenTUI (React) | 237.5MB | 71.5MB | +92.4MB | +26.3MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | OpenTUI (Core) | 116.8MB | 39.8MB | +15.4MB | +1.2MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Bubble Tea (Go) | 0.00KB | 18.5MB | 0KB | +6.1MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | blessed | 104.5MB | 23.6MB | +11.1MB | +7.8MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 2.9MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 92.0MB | 19.4MB | +7.3MB | +5.0MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 185.6MB | 58.9MB | +42.7MB | +35.2MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (React) | 237.3MB | 70.5MB | +91.9MB | +25.3MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (Core) | 116.8MB | 40.0MB | +15.0MB | +1.5MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Bubble Tea (Go) | 0.00KB | 15.4MB | 0KB | +3.0MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | blessed | 104.2MB | 23.9MB | +10.4MB | +8.1MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 3.0MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 93.2MB | 17.9MB | +7.4MB | +3.4MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ink | 249.0MB | 55.0MB | +103.0MB | +30.8MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI (React) | 366.1MB | 102.5MB | +197.5MB | +50.7MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI (Core) | 107.0MB | 38.9MB | +15.3MB | +721.0KB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 0.00KB | 2.7MB | 0KB | +2.3MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | blessed | 88.5MB | 19.6MB | +2.0MB | +4.3MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ratatui (Rust) | 2.4MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 87.3MB | 21.5MB | +3.9MB | +8.2MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ink | 166.0MB | 49.2MB | +34.4MB | +27.9MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI (React) | 168.2MB | 51.9MB | +48.0MB | +10.9MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI (Core) | 107.1MB | 38.8MB | +15.6MB | +638.0KB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Bubble Tea (Go) | 0.00KB | 942.0KB | 0KB | +566.0KB | N/A | N/A |
| terminal-table (rows=40,cols=8) | blessed | 87.5MB | 22.6MB | +704.0KB | +7.4MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
