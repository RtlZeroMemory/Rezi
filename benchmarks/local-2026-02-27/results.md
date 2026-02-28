# Benchmark Results

> 2026-02-27T15:31:20.396Z | Node v24.12.0 | Bun n/a | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Darwin 25.2.0 | darwin arm64 | Apple M4 Pro (12 cores) | RAM 24576MB | governor=n/a | wsl=no
> Invocation: suite=all matchup=none scenario=all framework=all warmup=default iterations=default quick=no io=stub opentuiDriver=react replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=off cpuAffinity=none
> Byte columns: "Bytes(local)" = framework-local counter; "Bytes(pty)" = observed PTY bytes (cross-framework comparable in PTY mode).

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.69ms | 0.0% | 1.63ms–1.76ms | 582 ops/s | 171.84ms | 169.61ms | 10.91ms | 158.9MB | 40.9MB | 415.2KB | n/a |
| Ink | 1 | 3.94ms | 0.0% | 3.80ms–4.11ms | 157 ops/s | 635.27ms | 833.43ms | 36.56ms | 403.9MB | 96.5MB | 122.0KB | n/a |
| terminal-kit | 1 | 123µs | 0.0% | 90µs–185µs | 1.1K ops/s | 93.60ms | 147.04ms | 10.48ms | 180.4MB | 67.5MB | 0.00KB | n/a |
| blessed | 1 | 1.18ms | 0.0% | 1.04ms–1.37ms | 299 ops/s | 334.13ms | 573.92ms | 67.93ms | 364.0MB | 251.5MB | 189.7KB | n/a |
| Ratatui (Rust) | 1 | 187µs | 0.0% | 185µs–188µs | 5.1K ops/s | 19.50ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 40µs | 0.0% | 39µs–43µs | 24.5K ops/s | 20.37ms | 51.09ms | 2.50ms | 100.9MB | 25.6MB | 148.4KB | n/a |
| Ink | 1 | 23.48ms | 0.0% | 22.15ms–24.99ms | 43 ops/s | 11.74s | 3.48s | 88.93ms | 230.8MB | 84.9MB | 271.4KB | n/a |
| terminal-kit | 1 | 49µs | 0.0% | 48µs–50µs | 20.2K ops/s | 24.74ms | 35.82ms | 213µs | 85.0MB | 21.4MB | 0.00KB | n/a |
| blessed | 1 | 201µs | 0.0% | 199µs–205µs | 5.0K ops/s | 100.88ms | 127.73ms | 29.37ms | 109.8MB | 28.8MB | 11.3KB | n/a |
| Ratatui (Rust) | 1 | 844µs | 0.0% | 843µs–847µs | 1.2K ops/s | 422.13ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 157µs | 0.0% | 152µs–165µs | 6.3K ops/s | 78.96ms | 134.63ms | 6.42ms | 137.2MB | 50.0MB | 148.4KB | n/a |
| Ink | 1 | 25.79ms | 0.0% | 24.27ms–27.46ms | 39 ops/s | 12.89s | 5.73s | 98.93ms | 354.6MB | 162.3MB | 1.1MB | n/a |
| terminal-kit | 1 | 179µs | 0.0% | 178µs–182µs | 5.6K ops/s | 89.96ms | 99.68ms | 451µs | 88.1MB | 21.6MB | 0.00KB | n/a |
| blessed | 1 | 1.62ms | 0.0% | 1.61ms–1.63ms | 617 ops/s | 810.32ms | 609.91ms | 229.02ms | 143.6MB | 48.9MB | 11.3KB | n/a |
| Ratatui (Rust) | 1 | 914µs | 0.0% | 913µs–916µs | 1.1K ops/s | 457.12ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 685µs | 0.0% | 668µs–707µs | 1.5K ops/s | 342.59ms | 412.61ms | 25.51ms | 344.4MB | 155.9MB | 148.4KB | n/a |
| Ink | 1 | 48.17ms | 0.0% | 46.73ms–49.65ms | 21 ops/s | 24.09s | 19.51s | 381.69ms | 1.06GB | 824.3MB | 5.7MB | n/a |
| terminal-kit | 1 | 894µs | 0.0% | 890µs–902µs | 1.1K ops/s | 447.48ms | 453.87ms | 2.02ms | 87.9MB | 22.3MB | 0.00KB | n/a |
| blessed | 1 | 9.23ms | 0.0% | 9.10ms–9.43ms | 108 ops/s | 4.62s | 4.25s | 1.15s | 373.0MB | 184.1MB | 11.3KB | n/a |
| Ratatui (Rust) | 1 | 1.24ms | 0.0% | 1.23ms–1.24ms | 809 ops/s | 617.77ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.32ms | 0.0% | 1.30ms–1.35ms | 757 ops/s | 660.54ms | 776.97ms | 22.14ms | 370.7MB | 172.2MB | 148.4KB | n/a |
| Ink | 1 | 78.81ms | 0.0% | 77.27ms–80.54ms | 13 ops/s | 39.41s | 37.92s | 835.03ms | 2.26GB | 1.64GB | 11.4MB | n/a |
| terminal-kit | 1 | 1.87ms | 0.0% | 1.87ms–1.88ms | 534 ops/s | 936.60ms | 944.31ms | 2.84ms | 88.0MB | 21.4MB | 0.00KB | n/a |
| blessed | 1 | 18.64ms | 0.0% | 18.55ms–18.75ms | 54 ops/s | 9.32s | 8.80s | 2.22s | 420.9MB | 215.3MB | 11.3KB | n/a |
| Ratatui (Rust) | 1 | 2.41ms | 0.0% | 2.38ms–2.46ms | 414 ops/s | 1.21s | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 21µs | 0.0% | 20µs–22µs | 48.1K ops/s | 20.80ms | 43.71ms | 2.52ms | 104.0MB | 23.7MB | 496.1KB | n/a |
| Ink | 1 | 19.48ms | 0.0% | 18.44ms–20.55ms | 51 ops/s | 19.49s | 2.51s | 46.52ms | 141.3MB | 41.8MB | 134.0KB | n/a |
| terminal-kit | 1 | 43µs | 0.0% | 43µs–43µs | 23.2K ops/s | 43.14ms | 50.87ms | 553µs | 85.5MB | 20.3MB | 0.00KB | n/a |
| blessed | 1 | 39µs | 0.0% | 38µs–40µs | 25.7K ops/s | 38.94ms | 61.85ms | 9.42ms | 90.1MB | 23.0MB | 39.3KB | n/a |
| Ratatui (Rust) | 1 | 68µs | 0.0% | 68µs–68µs | 14.6K ops/s | 68.40ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.17ms | 0.0% | 1.14ms–1.21ms | 853 ops/s | 585.96ms | 725.68ms | 24.20ms | 358.6MB | 203.4MB | 19.4MB | n/a |
| Ink | 1 | 44.86ms | 0.0% | 43.40ms–46.38ms | 22 ops/s | 22.43s | 17.72s | 352.62ms | 1.03GB | 766.6MB | 9.2MB | n/a |
| terminal-kit | 1 | 1.21ms | 0.0% | 1.20ms–1.22ms | 826 ops/s | 605.58ms | 609.81ms | 4.90ms | 94.6MB | 21.8MB | 0.00KB | n/a |
| blessed | 1 | 506µs | 0.0% | 470µs–549µs | 2.0K ops/s | 253.08ms | 322.54ms | 30.48ms | 361.9MB | 172.0MB | 67.8KB | n/a |
| Ratatui (Rust) | 1 | 1.34ms | 0.0% | 1.34ms–1.35ms | 744 ops/s | 671.81ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 672µs | 0.0% | 660µs–685µs | 1.5K ops/s | 201.90ms | 256.45ms | 7.46ms | 146.1MB | 59.5MB | 4.4MB | n/a |
| Ink | 1 | 25.70ms | 0.0% | 23.77ms–27.51ms | 39 ops/s | 7.71s | 3.61s | 76.29ms | 416.5MB | 219.5MB | 2.2MB | n/a |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 6.87ms | 0.0% | 6.60ms–7.20ms | 146 ops/s | 343.34ms | 385.72ms | 30.56ms | 342.0MB | 163.8MB | 282.5KB | n/a |
| Ink | 1 | 180.42ms | 0.0% | 174.27ms–186.83ms | 6 ops/s | 9.02s | 9.84s | 309.70ms | 1.46GB | 426.0MB | 2.4MB | n/a |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 150µs | 0.0% | 146µs–154µs | 6.7K ops/s | 150.26ms | 232.55ms | 9.81ms | 149.9MB | 56.0MB | 6.0MB | n/a |
| Ink | 1 | 25.75ms | 0.0% | 24.71ms–26.82ms | 39 ops/s | 25.75s | 11.28s | 253.27ms | 343.0MB | 160.4MB | 1.2MB | n/a |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 586µs | 0.0% | 572µs–601µs | 1.7K ops/s | 175.94ms | 248.66ms | 7.64ms | 143.6MB | 53.6MB | 3.8MB | n/a |
| Ink | 1 | 32.83ms | 0.0% | 31.06ms–34.61ms | 30 ops/s | 9.85s | 6.76s | 247.45ms | 866.0MB | 502.7MB | 1.8MB | n/a |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 173µs | 0.0% | 163µs–187µs | 5.8K ops/s | 347.41ms | 515.21ms | 32.55ms | 307.6MB | 153.0MB | 5.2MB | n/a |
| Ink | 1 | 22.58ms | 0.0% | 21.88ms–23.29ms | 44 ops/s | 45.16s | 11.76s | 258.80ms | 267.6MB | 121.8MB | 1.4MB | n/a |
| terminal-kit | 1 | 59µs | 0.0% | 58µs–60µs | 16.9K ops/s | 118.00ms | 124.22ms | 1.76ms | 96.7MB | 30.1MB | 0.00KB | n/a |
| blessed | 1 | 150µs | 0.0% | 149µs–151µs | 6.6K ops/s | 300.82ms | 299.07ms | 71.47ms | 111.4MB | 32.8MB | 997.9KB | n/a |
| Ratatui (Rust) | 1 | 79µs | 0.0% | 78µs–79µs | 12.7K ops/s | 157.16ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | n/a |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 17µs | 0.0% | 16µs–18µs | 58.7K ops/s | 17.05ms | 40.28ms | 2.96ms | 108.7MB | 23.6MB | 277.7KB | n/a |
| Ink | 1 | 18.82ms | 0.0% | 17.77ms–19.87ms | 53 ops/s | 18.82s | 1.79s | 36.39ms | 139.9MB | 39.2MB | 75.3KB | n/a |
| Ratatui (Rust) | 1 | 62µs | 0.0% | 62µs–62µs | 16.1K ops/s | 62.18ms | 68.35ms | 291µs | 2.4MB | n/a | 0.00KB | n/a |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 45µs | 0.0% | 43µs–47µs | 22.2K ops/s | 22.56ms | 51.90ms | 2.39ms | 101.1MB | 28.0MB | 177.7KB | n/a |
| Ink | 1 | 25.49ms | 0.0% | 24.08ms–27.06ms | 39 ops/s | 12.74s | 4.48s | 115.93ms | 247.2MB | 77.1MB | 292.4KB | n/a |
| Ratatui (Rust) | 1 | 176µs | 0.0% | 175µs–176µs | 5.7K ops/s | 87.83ms | 96.72ms | 173µs | 2.6MB | n/a | 0.00KB | n/a |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 82µs | 0.0% | 80µs–86µs | 12.1K ops/s | 41.38ms | 83.85ms | 3.61ms | 108.8MB | 26.5MB | 1.9MB | n/a |
| Ink | 1 | 25.94ms | 0.0% | 24.44ms–27.67ms | 39 ops/s | 12.97s | 4.81s | 82.52ms | 262.5MB | 80.3MB | 536.8KB | n/a |
| Ratatui (Rust) | 1 | 178µs | 0.0% | 178µs–179µs | 5.6K ops/s | 89.14ms | 98.15ms | 140µs | 2.6MB | n/a | 0.00KB | n/a |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 75µs | 0.0% | 73µs–79µs | 13.2K ops/s | 75.87ms | 141.22ms | 6.21ms | 124.0MB | 41.4MB | 3.9MB | n/a |
| Ink | 1 | 25.54ms | 0.0% | 24.47ms–26.62ms | 39 ops/s | 25.54s | 9.17s | 139.73ms | 285.3MB | 103.7MB | 2.0MB | n/a |
| Ratatui (Rust) | 1 | 183µs | 0.0% | 182µs–183µs | 5.5K ops/s | 182.71ms | 200.68ms | 473µs | 2.8MB | n/a | 0.00KB | n/a |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 600µs | 0.0% | 597µs–603µs | 1.7K ops/s | 720.19ms | 799.48ms | 10.53ms | 123.7MB | 43.4MB | 5.3MB | n/a |
| Ink | 1 | 26.17ms | 0.0% | 25.27ms–27.07ms | 38 ops/s | 31.41s | 11.77s | 145.86ms | 293.3MB | 114.3MB | 3.1MB | n/a |
| Ratatui (Rust) | 1 | 189µs | 0.0% | 188µs–189µs | 5.3K ops/s | 226.33ms | 245.32ms | 381µs | 2.7MB | n/a | 0.00KB | n/a |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 92µs | 0.0% | 90µs–95µs | 10.8K ops/s | 92.33ms | 153.02ms | 6.75ms | 110.2MB | 26.6MB | 3.9MB | n/a |
| Ink | 1 | 25.42ms | 0.0% | 24.36ms–26.51ms | 39 ops/s | 25.43s | 9.15s | 125.65ms | 272.8MB | 119.1MB | 1009.3KB | n/a |
| Ratatui (Rust) | 1 | 174µs | 0.0% | 173µs–174µs | 5.8K ops/s | 173.57ms | 191.01ms | 235µs | 2.6MB | n/a | 0.00KB | n/a |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 70µs | 0.0% | 68µs–73µs | 14.2K ops/s | 84.29ms | 153.39ms | 6.04ms | 134.9MB | 39.3MB | 4.7MB | n/a |
| Ink | 1 | 25.85ms | 0.0% | 24.95ms–26.77ms | 39 ops/s | 31.02s | 11.21s | 138.81ms | 291.3MB | 117.3MB | 1.0MB | n/a |
| Ratatui (Rust) | 1 | 176µs | 0.0% | 176µs–176µs | 5.7K ops/s | 211.20ms | 238.03ms | 355µs | 2.8MB | n/a | 0.00KB | n/a |

## terminal-full-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 555µs | 0.0% | 553µs–558µs | 1.8K ops/s | 666.89ms | 749.97ms | 9.61ms | 123.5MB | 36.2MB | 4.7MB | n/a |
| Ink | 1 | 26.55ms | 0.0% | 25.64ms–27.46ms | 38 ops/s | 31.86s | 12.11s | 139.38ms | 306.5MB | 128.2MB | 5.4MB | n/a |
| Ratatui (Rust) | 1 | 194µs | 0.0% | 194µs–195µs | 5.1K ops/s | 233.12ms | 256.75ms | 431µs | 3.1MB | n/a | 0.00KB | n/a |

## terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 78µs | 0.0% | 76µs–81µs | 12.8K ops/s | 94.10ms | 184.31ms | 6.63ms | 131.2MB | 41.0MB | 4.6MB | n/a |
| Ink | 1 | 25.54ms | 0.0% | 24.66ms–26.45ms | 39 ops/s | 30.66s | 10.77s | 155.55ms | 287.2MB | 114.9MB | 2.9MB | n/a |
| Ratatui (Rust) | 1 | 177µs | 0.0% | 177µs–178µs | 5.6K ops/s | 212.82ms | 233.95ms | 416µs | 3.1MB | n/a | 0.00KB | n/a |

## terminal-strict-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 263µs | 0.0% | 255µs–271µs | 3.8K ops/s | 315.85ms | 438.20ms | 17.52ms | 197.8MB | 72.7MB | 27.0MB | n/a |
| Ink | 1 | 25.77ms | 0.0% | 24.82ms–26.69ms | 39 ops/s | 30.92s | 13.42s | 165.33ms | 360.2MB | 175.6MB | 6.5MB | n/a |
| Ratatui (Rust) | 1 | 140µs | 0.0% | 140µs–140µs | 7.1K ops/s | 168.28ms | 185.37ms | 403µs | 3.2MB | n/a | 0.00KB | n/a |

## terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 328µs | 0.0% | 318µs–337µs | 3.0K ops/s | 393.64ms | 504.55ms | 15.91ms | 192.3MB | 85.3MB | 28.0MB | n/a |
| Ink | 1 | 25.78ms | 0.0% | 24.83ms–26.72ms | 39 ops/s | 30.94s | 13.36s | 251.23ms | 355.7MB | 166.1MB | 6.8MB | n/a |
| Ratatui (Rust) | 1 | 145µs | 0.0% | 145µs–146µs | 6.9K ops/s | 174.63ms | 190.32ms | 1.69ms | 3.2MB | n/a | 0.00KB | n/a |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 161µs | 0.0% | 157µs–166µs | 6.2K ops/s | 161.44ms | 247.18ms | 10.76ms | 149.0MB | 68.7MB | 6.1MB | n/a |
| Ink | 1 | 25.92ms | 0.0% | 24.87ms–27.00ms | 39 ops/s | 25.92s | 11.57s | 183.52ms | 341.9MB | 160.0MB | 1.2MB | n/a |
| Ratatui (Rust) | 1 | 90µs | 0.0% | 90µs–90µs | 11.1K ops/s | 90.30ms | 99.26ms | 192µs | 2.5MB | n/a | 0.00KB | n/a |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 58µs | 0.0% | 57µs–61µs | 17.0K ops/s | 29.35ms | 60.90ms | 2.36ms | 101.8MB | 27.4MB | 1.0MB | n/a |
| Ink | 1 | 25.31ms | 0.0% | 23.92ms–26.89ms | 40 ops/s | 12.66s | 4.41s | 64.00ms | 243.7MB | 54.8MB | 1.5MB | n/a |
| Ratatui (Rust) | 1 | 168µs | 0.0% | 168µs–168µs | 6.0K ops/s | 83.88ms | 92.45ms | 128µs | 2.6MB | n/a | 0.00KB | n/a |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | Ink | terminal-kit | blessed | Ratatui (Rust) |
|---|---:|---:|---:|---:|
| startup | 2.3x slower [2.2x, 2.5x] | 13.7x faster [8.8x, 19.5x] | 1.4x faster [1.2x, 1.7x] | 9.0x faster [8.6x, 9.5x] |
| tree-construction (items=10) | 580.7x slower [514.0x, 648.1x] | 1.2x slower [1.1x, 1.3x] | 5.0x slower [4.6x, 5.3x] | 20.9x slower [19.6x, 22.0x] |
| tree-construction (items=100) | 163.8x slower [147.1x, 180.3x] | 1.1x slower [1.1x, 1.2x] | 10.3x slower [9.8x, 10.7x] | 5.8x slower [5.5x, 6.0x] |
| tree-construction (items=500) | 70.4x slower [66.1x, 74.3x] | 1.3x slower [1.3x, 1.4x] | 13.5x slower [12.9x, 14.1x] | 1.8x slower [1.7x, 1.9x] |
| tree-construction (items=1000) | 59.7x slower [57.2x, 62.1x] | 1.4x slower [1.4x, 1.5x] | 14.1x slower [13.7x, 14.5x] | 1.8x slower [1.8x, 1.9x] |
| rerender | 948.0x slower [845.4x, 1049.7x] | 2.1x slower [2.0x, 2.2x] | 1.9x slower [1.7x, 2.0x] | 3.3x slower [3.1x, 3.5x] |
| content-update | 38.3x slower [35.9x, 40.6x] | 1.0x slower [1.0x, 1.1x] (inconclusive) | 2.3x faster [2.1x, 2.6x] | 1.1x slower [1.1x, 1.2x] |
| layout-stress (rows=40,cols=4) | 38.2x slower [34.7x, 41.7x] | N/A | N/A | N/A |
| scroll-stress (items=2000) | 26.3x slower [24.2x, 28.3x] | N/A | N/A | N/A |
| virtual-list (items=100000,viewport=40) | 171.9x slower [160.8x, 183.1x] | N/A | N/A | N/A |
| tables (rows=100,cols=8) | 56.1x slower [51.6x, 60.5x] | N/A | N/A | N/A |
| memory-profile | 130.3x slower [117.1x, 142.5x] | 2.9x faster [2.7x, 3.2x] | 1.2x faster [1.1x, 1.3x] | 2.2x faster [2.1x, 2.4x] |
| terminal-rerender | 1118.8x slower [996.5x, 1234.9x] | N/A | N/A | 3.7x slower [3.5x, 3.9x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 568.7x slower [516.0x, 622.5x] | N/A | N/A | 3.9x slower [3.8x, 4.0x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 315.0x slower [285.0x, 347.5x] | N/A | N/A | 2.2x slower [2.1x, 2.2x] |
| terminal-screen-transition (rows=40,cols=120) | 338.3x slower [310.8x, 363.7x] | N/A | N/A | 2.4x slower [2.3x, 2.5x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 43.6x slower [41.9x, 45.3x] | N/A | N/A | 3.2x faster [3.2x, 3.2x] |
| terminal-input-latency (rows=40,cols=120) | 276.5x slower [256.7x, 295.7x] | N/A | N/A | 1.9x slower [1.8x, 1.9x] |
| terminal-memory-soak (rows=40,cols=120) | 369.8x slower [343.9x, 395.3x] | N/A | N/A | 2.5x slower [2.4x, 2.6x] |
| terminal-full-ui (rows=40,cols=120,services=24) | 47.8x slower [45.9x, 49.7x] | N/A | N/A | 2.9x faster [2.8x, 2.9x] |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 327.2x slower [306.2x, 347.7x] | N/A | N/A | 2.3x slower [2.2x, 2.3x] |
| terminal-strict-ui (rows=40,cols=120,services=24) | 98.1x slower [91.7x, 104.6x] | N/A | N/A | 1.9x faster [1.8x, 1.9x] |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 78.7x slower [73.7x, 83.9x] | N/A | N/A | 2.3x faster [2.2x, 2.3x] |
| terminal-virtual-list (items=100000,viewport=40) | 161.0x slower [150.2x, 171.7x] | N/A | N/A | 1.8x faster [1.7x, 1.8x] |
| terminal-table (rows=40,cols=8) | 433.6x slower [394.1x, 474.1x] | N/A | N/A | 2.9x slower [2.8x, 3.0x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 158.9MB | 40.9MB | +67.3MB | +22.8MB | N/A | N/A |
| startup | Ink | 403.9MB | 96.5MB | +210.8MB | +37.6MB | N/A | N/A |
| startup | terminal-kit | 180.4MB | 67.5MB | +87.5MB | +51.2MB | N/A | N/A |
| startup | blessed | 364.0MB | 251.5MB | +241.1MB | +220.5MB | N/A | N/A |
| startup | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 100.9MB | 25.6MB | +16.4MB | +12.4MB | N/A | N/A |
| tree-construction (items=10) | Ink | 230.8MB | 84.9MB | +95.3MB | +62.9MB | N/A | N/A |
| tree-construction (items=10) | terminal-kit | 85.0MB | 21.4MB | +256.0KB | +2.4MB | N/A | N/A |
| tree-construction (items=10) | blessed | 109.8MB | 28.8MB | +20.8MB | +1.9MB | N/A | N/A |
| tree-construction (items=10) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 137.2MB | 50.0MB | +46.8MB | +35.9MB | N/A | N/A |
| tree-construction (items=100) | Ink | 354.6MB | 162.3MB | +65.8MB | +70.3MB | N/A | N/A |
| tree-construction (items=100) | terminal-kit | 88.1MB | 21.6MB | +128.0KB | +7.2MB | N/A | N/A |
| tree-construction (items=100) | blessed | 143.6MB | 48.9MB | +33.2MB | +13.9MB | N/A | N/A |
| tree-construction (items=100) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 344.4MB | 155.9MB | +210.0MB | +61.7MB | N/A | N/A |
| tree-construction (items=500) | Ink | 1.06GB | 824.3MB | +670.5MB | +774.4MB | N/A | N/A |
| tree-construction (items=500) | terminal-kit | 87.9MB | 22.3MB | +16.0KB | +7.9MB | N/A | N/A |
| tree-construction (items=500) | blessed | 373.0MB | 184.1MB | +75.7MB | +157.4MB | N/A | N/A |
| tree-construction (items=500) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 370.7MB | 172.2MB | +156.2MB | +110.0MB | N/A | N/A |
| tree-construction (items=1000) | Ink | 2.26GB | 1.64GB | +1.73GB | +1.56GB | N/A | N/A |
| tree-construction (items=1000) | terminal-kit | 88.0MB | 21.4MB | +32.0KB | +7.0MB | N/A | N/A |
| tree-construction (items=1000) | blessed | 420.9MB | 215.3MB | +47.4MB | +82.0MB | N/A | N/A |
| tree-construction (items=1000) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| rerender | Rezi (native) | 104.0MB | 23.7MB | +21.6MB | +6.9MB | N/A | N/A |
| rerender | Ink | 141.3MB | 41.8MB | +11.7MB | +16.5MB | N/A | N/A |
| rerender | terminal-kit | 85.5MB | 20.3MB | +256.0KB | +6.0MB | N/A | N/A |
| rerender | blessed | 90.1MB | 23.0MB | +4.0MB | +6.9MB | N/A | N/A |
| rerender | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| content-update | Rezi (native) | 358.6MB | 203.4MB | +186.7MB | +140.5MB | N/A | N/A |
| content-update | Ink | 1.03GB | 766.6MB | +620.0MB | +714.1MB | N/A | N/A |
| content-update | terminal-kit | 94.6MB | 21.8MB | +48.0KB | +1.6MB | N/A | N/A |
| content-update | blessed | 361.9MB | 172.0MB | +201.3MB | +143.8MB | N/A | N/A |
| content-update | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 146.1MB | 59.5MB | +37.3MB | +43.8MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Ink | 416.5MB | 219.5MB | +138.9MB | +182.1MB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 342.0MB | 163.8MB | +149.6MB | +130.2MB | N/A | N/A |
| scroll-stress (items=2000) | Ink | 1.46GB | 426.0MB | +905.2MB | +326.7MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 149.9MB | 56.0MB | +56.2MB | +40.5MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Ink | 343.0MB | 160.4MB | +87.4MB | +128.9MB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 143.6MB | 53.6MB | +31.3MB | +37.2MB | N/A | N/A |
| tables (rows=100,cols=8) | Ink | 866.0MB | 502.7MB | +509.6MB | +440.8MB | N/A | N/A |
| memory-profile | Rezi (native) | 307.6MB | 153.0MB | +211.1MB | +139.1MB | 113.9506 KB/iter | no |
| memory-profile | Ink | 267.6MB | 121.8MB | +132.6MB | +98.1MB | 49.5551 KB/iter | no |
| memory-profile | terminal-kit | 96.7MB | 30.1MB | +11.5MB | +5.5MB | 7.2202 KB/iter | no |
| memory-profile | blessed | 111.4MB | 32.8MB | +20.6MB | +10.1MB | 8.4198 KB/iter | no |
| memory-profile | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| terminal-rerender | Rezi (native) | 108.7MB | 23.6MB | +29.4MB | +11.0MB | N/A | N/A |
| terminal-rerender | Ink | 139.9MB | 39.2MB | +8.8MB | +12.4MB | N/A | N/A |
| terminal-rerender | Ratatui (Rust) | 2.4MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 101.1MB | 28.0MB | +18.9MB | +15.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ink | 247.2MB | 77.1MB | +69.4MB | +10.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 108.8MB | 26.5MB | +22.4MB | +11.2MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ink | 262.5MB | 80.3MB | +91.5MB | +27.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 124.0MB | 41.4MB | +37.3MB | +12.9MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ink | 285.3MB | 103.7MB | +110.9MB | +48.8MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ratatui (Rust) | 2.8MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 123.7MB | 43.4MB | +37.8MB | +8.2MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ink | 293.3MB | 114.3MB | +114.5MB | +77.3MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ratatui (Rust) | 2.7MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 110.2MB | 26.6MB | +23.7MB | +13.3MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ink | 272.8MB | 119.1MB | +97.2MB | +88.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 134.9MB | 39.3MB | +47.0MB | +14.3MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ink | 291.3MB | 117.3MB | +51.3MB | +75.4MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ratatui (Rust) | 2.8MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Rezi (native) | 123.5MB | 36.2MB | +37.8MB | +22.9MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ink | 306.5MB | 128.2MB | +116.7MB | +82.3MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 3.1MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 131.2MB | 41.0MB | +43.7MB | +14.2MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 287.2MB | 114.9MB | +101.6MB | +84.4MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 3.1MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Rezi (native) | 197.8MB | 72.7MB | +105.2MB | +56.3MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ink | 360.2MB | 175.6MB | +115.9MB | +144.9MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 3.2MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 192.3MB | 85.3MB | +100.0MB | +68.7MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 355.7MB | 166.1MB | +111.8MB | +135.2MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 3.2MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 149.0MB | 68.7MB | +61.0MB | +54.3MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ink | 341.9MB | 160.0MB | +92.0MB | +131.8MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 101.8MB | 27.4MB | +15.8MB | +14.3MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ink | 243.7MB | 54.8MB | +69.6MB | +9.7MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
