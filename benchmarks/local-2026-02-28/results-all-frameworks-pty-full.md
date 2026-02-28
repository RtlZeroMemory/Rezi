# Benchmark Results

> 2026-02-28T01:45:15.748Z | Node v24.12.0 | Bun 1.3.10 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Darwin 25.2.0 | darwin arm64 | Apple M4 Pro (12 cores) | RAM 24576MB | governor=n/a | wsl=no
> Invocation: suite=all matchup=none scenario=all framework=all warmup=default iterations=default quick=no io=pty opentuiDriver=react replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=off cpuAffinity=none
> Byte columns: "Bytes(local)" = framework-local counter; "Bytes(pty)" = observed PTY bytes (cross-framework comparable in PTY mode).

## startup

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.66ms | 0.0% | 1.61ms–1.71ms | 593 ops/s | 168.53ms | 145.43ms | 8.97ms | 174.8MB | 61.0MB | 415.2KB | 0.00KB |
| Ink | 1 | 3.95ms | 0.0% | 3.81ms–4.12ms | 156 ops/s | 640.12ms | 837.32ms | 38.11ms | 424.2MB | 72.5MB | 210.7KB | 0.01KB |
| OpenTUI (React) | 1 | 6.09ms | 0.0% | 5.97ms–6.22ms | 33 ops/s | 3.07s | 1.07s | 141.24ms | 342.0MB | 108.6MB | 1.2MB | 1.2MB |
| OpenTUI (Core) | 1 | 4.27ms | 0.0% | 4.06ms–4.47ms | 34 ops/s | 2.98s | 667.53ms | 158.48ms | 163.6MB | 65.5MB | 928.0KB | 928.0KB |
| Bubble Tea (Go) | 1 | 8.67ms | 0.0% | 8.65ms–8.69ms | 53 ops/s | 1.90s | 50.37ms | 75.37ms | 0.00KB | 1.9MB | 623.7KB | 697.7KB |
| terminal-kit | 1 | 94µs | 0.0% | 88µs–100µs | 1.1K ops/s | 94.29ms | 148.20ms | 9.81ms | 181.2MB | 68.0MB | 0.00KB | 0.00KB |
| blessed | 1 | 1.12ms | 0.0% | 1.03ms–1.22ms | 311 ops/s | 321.31ms | 531.61ms | 62.68ms | 377.5MB | 240.4MB | 189.7KB | 0.00KB |
| Ratatui (Rust) | 1 | 189µs | 0.0% | 188µs–191µs | 5.1K ops/s | 19.78ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=10)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 39µs | 0.0% | 37µs–41µs | 25.6K ops/s | 19.53ms | 52.93ms | 2.43ms | 101.2MB | 25.7MB | 148.4KB | 0.00KB |
| Ink | 1 | 20.39ms | 0.0% | 19.04ms–21.94ms | 49 ops/s | 10.20s | 1.82s | 29.14ms | 179.5MB | 60.1MB | 363.7KB | 0.01KB |
| OpenTUI (React) | 1 | 3.75ms | 0.0% | 3.67ms–3.85ms | 266 ops/s | 1.88s | 1.64s | 67.80ms | 470.1MB | 146.0MB | 342.6KB | 342.6KB |
| OpenTUI (Core) | 1 | 1.14ms | 0.0% | 1.10ms–1.17ms | 879 ops/s | 568.83ms | 191.49ms | 62.19ms | 103.0MB | 39.7MB | 42.8KB | 42.8KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 75.53ms | 119.40ms | 0.00KB | 3.0MB | 68.8KB | 83.2KB |
| terminal-kit | 1 | 50µs | 0.0% | 49µs–51µs | 20.0K ops/s | 24.98ms | 36.31ms | 227µs | 85.4MB | 21.4MB | 0.00KB | 0.00KB |
| blessed | 1 | 206µs | 0.0% | 204µs–209µs | 4.8K ops/s | 103.17ms | 128.94ms | 30.13ms | 109.7MB | 26.1MB | 11.3KB | 0.00KB |
| Ratatui (Rust) | 1 | 847µs | 0.0% | 846µs–849µs | 1.2K ops/s | 423.61ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=100)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 153µs | 0.0% | 148µs–161µs | 6.5K ops/s | 76.84ms | 132.81ms | 5.82ms | 136.2MB | 44.3MB | 148.4KB | 0.00KB |
| Ink | 1 | 24.16ms | 0.0% | 22.77ms–25.68ms | 41 ops/s | 12.08s | 4.83s | 78.16ms | 353.8MB | 177.8MB | 2.0MB | 0.01KB |
| OpenTUI (React) | 1 | 24.38ms | 0.0% | 23.77ms–25.11ms | 41 ops/s | 12.19s | 14.01s | 495.09ms | 2.81GB | 1.03GB | 2.6MB | 2.6MB |
| OpenTUI (Core) | 1 | 1.51ms | 0.0% | 1.49ms–1.53ms | 663 ops/s | 754.13ms | 487.49ms | 326.04ms | 126.3MB | 54.3MB | 52.4KB | 52.4KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 87.04ms | 117.10ms | 0.00KB | 2.9MB | 113.3KB | 191.2KB |
| terminal-kit | 1 | 177µs | 0.0% | 175µs–179µs | 5.6K ops/s | 88.66ms | 99.35ms | 479µs | 87.8MB | 21.6MB | 0.00KB | 0.00KB |
| blessed | 1 | 1.70ms | 0.0% | 1.69ms–1.71ms | 589 ops/s | 849.06ms | 630.32ms | 248.07ms | 143.4MB | 46.1MB | 11.3KB | 0.00KB |
| Ratatui (Rust) | 1 | 913µs | 0.0% | 912µs–915µs | 1.1K ops/s | 456.68ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=500)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 675µs | 0.0% | 660µs–695µs | 1.5K ops/s | 337.78ms | 400.53ms | 21.17ms | 334.0MB | 186.3MB | 148.4KB | 0.00KB |
| Ink | 1 | 47.52ms | 0.0% | 46.13ms–48.98ms | 21 ops/s | 23.76s | 19.19s | 292.17ms | 1.06GB | 725.4MB | 10.0MB | 0.01KB |
| OpenTUI (React) | 1 | 126.30ms | 0.0% | 122.95ms–130.18ms | 8 ops/s | 63.15s | 75.15s | 4.42s | 8.29GB | 5.73GB | 13.1MB | 13.1MB |
| OpenTUI (Core) | 1 | 8.08ms | 0.0% | 8.04ms–8.13ms | 124 ops/s | 4.04s | 2.03s | 2.09s | 232.9MB | 111.3MB | 111.8KB | 111.8KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 181.49ms | 144.66ms | 0.00KB | 3.3MB | 308.6KB | 667.8KB |
| terminal-kit | 1 | 875µs | 0.0% | 871µs–881µs | 1.1K ops/s | 437.55ms | 444.10ms | 708µs | 87.9MB | 22.4MB | 0.00KB | 0.00KB |
| blessed | 1 | 9.11ms | 0.0% | 9.04ms–9.18ms | 110 ops/s | 4.55s | 4.13s | 1.20s | 374.1MB | 202.3MB | 11.3KB | 0.00KB |
| Ratatui (Rust) | 1 | 1.23ms | 0.0% | 1.22ms–1.23ms | 815 ops/s | 613.80ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## tree-construction (items=1000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.31ms | 0.0% | 1.29ms–1.35ms | 761 ops/s | 656.67ms | 780.98ms | 17.93ms | 386.3MB | 224.9MB | 148.4KB | 0.00KB |
| Ink | 1 | 79.60ms | 0.0% | 78.07ms–81.34ms | 13 ops/s | 39.80s | 38.71s | 573.84ms | 2.03GB | 1019.2MB | 20.0MB | 0.01KB |
| OpenTUI (React) | 1 | 277.10ms | 0.0% | 268.86ms–286.50ms | 4 ops/s | 138.55s | 266.08s | 16.65s | 10.09GB | 9.74GB | 28.6MB | 28.6MB |
| OpenTUI (Core) | 1 | 17.35ms | 0.0% | 17.29ms–17.43ms | 58 ops/s | 8.68s | 4.37s | 4.41s | 253.3MB | 156.2MB | 186.0KB | 186.0KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 288.91ms | 163.31ms | 0.00KB | 3.7MB | 553.2KB | 1.2MB |
| terminal-kit | 1 | 1.84ms | 0.0% | 1.84ms–1.85ms | 543 ops/s | 921.33ms | 930.19ms | 1.27ms | 88.2MB | 21.6MB | 0.00KB | 0.00KB |
| blessed | 1 | 19.14ms | 0.0% | 19.05ms–19.25ms | 52 ops/s | 9.57s | 8.81s | 2.45s | 428.8MB | 226.1MB | 11.3KB | 0.00KB |
| Ratatui (Rust) | 1 | 2.33ms | 0.0% | 2.33ms–2.33ms | 430 ops/s | 1.16s | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 330µs | 0.0% | 329µs–332µs | 3.0K ops/s | 330.88ms | 354.51ms | 2.98ms | 97.7MB | 25.0MB | 496.1KB | 7.61KB |
| Ink | 1 | 19.22ms | 0.0% | 18.15ms–20.30ms | 52 ops/s | 19.22s | 1.76s | 45.56ms | 165.8MB | 41.0MB | 151.6KB | 172.0KB |
| OpenTUI (React) | 1 | 2.90ms | 0.0% | 2.85ms–2.94ms | 345 ops/s | 2.90s | 1.34s | 85.18ms | 215.3MB | 70.5MB | 176.8KB | 176.8KB |
| OpenTUI (Core) | 1 | 1.26ms | 0.0% | 1.23ms–1.29ms | 790 ops/s | 1.27s | 323.36ms | 83.05ms | 101.8MB | 38.8MB | 118.3KB | 118.3KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.31ms–8.36ms | 120 ops/s | 8.33s | 180.00ms | 267.10ms | 0.00KB | 3.2MB | 244.9KB | 272.0KB |
| terminal-kit | 1 | 42µs | 0.0% | 42µs–42µs | 23.7K ops/s | 42.25ms | 50.38ms | 280µs | 86.2MB | 20.4MB | 0.00KB | 0.00KB |
| blessed | 1 | 39µs | 0.0% | 38µs–40µs | 25.4K ops/s | 39.40ms | 60.91ms | 9.78ms | 89.9MB | 23.1MB | 39.3KB | 0.00KB |
| Ratatui (Rust) | 1 | 70µs | 0.0% | 69µs–70µs | 14.4K ops/s | 69.59ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## content-update

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.13ms | 0.0% | 1.11ms–1.16ms | 882 ops/s | 567.16ms | 712.84ms | 16.57ms | 367.1MB | 156.0MB | 19.4MB | 0.00KB |
| Ink | 1 | 45.76ms | 0.0% | 44.30ms–47.27ms | 22 ops/s | 22.88s | 19.37s | 354.38ms | 1.06GB | 653.7MB | 13.5MB | 0.01KB |
| OpenTUI (React) | 1 | 171.66ms | 0.0% | 166.99ms–177.22ms | 6 ops/s | 85.83s | 98.07s | 8.19s | 7.04GB | 7.21GB | 17.1MB | 17.1MB |
| OpenTUI (Core) | 1 | 8.33ms | 0.0% | 8.28ms–8.40ms | 120 ops/s | 4.17s | 2.16s | 2.08s | 237.9MB | 110.4MB | 156.5KB | 156.5KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.31ms–8.35ms | 120 ops/s | 4.17s | 339.43ms | 216.71ms | 0.00KB | 3.4MB | 426.3KB | 797.7KB |
| terminal-kit | 1 | 1.22ms | 0.0% | 1.22ms–1.23ms | 817 ops/s | 611.93ms | 615.77ms | 4.85ms | 94.6MB | 21.9MB | 0.00KB | 0.00KB |
| blessed | 1 | 497µs | 0.0% | 463µs–538µs | 2.0K ops/s | 248.72ms | 318.82ms | 25.93ms | 360.1MB | 172.5MB | 67.8KB | 0.00KB |
| Ratatui (Rust) | 1 | 1.37ms | 0.0% | 1.35ms–1.40ms | 729 ops/s | 685.55ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## layout-stress (rows=40,cols=4)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.27ms | 0.0% | 1.25ms–1.28ms | 789 ops/s | 380.42ms | 424.47ms | 10.65ms | 144.3MB | 50.8MB | 4.4MB | 1.4MB |
| Ink | 1 | 25.53ms | 0.0% | 23.63ms–27.37ms | 39 ops/s | 7.66s | 3.50s | 87.77ms | 424.9MB | 215.4MB | 2.7MB | 3.2MB |
| OpenTUI (React) | 1 | 24.37ms | 0.0% | 23.77ms–25.00ms | 41 ops/s | 7.31s | 8.30s | 397.63ms | 2.16GB | 1.04GB | 2.8MB | 2.8MB |
| OpenTUI (Core) | 1 | 1.33ms | 0.0% | 1.29ms–1.37ms | 752 ops/s | 398.82ms | 284.22ms | 176.03ms | 123.2MB | 46.6MB | 2.5MB | 2.5MB |
| Bubble Tea (Go) | 1 | 8.30ms | 0.0% | 8.21ms–8.39ms | 120 ops/s | 2.49s | 153.33ms | 158.91ms | 0.00KB | 2.2MB | 720.3KB | 859.0KB |

## scroll-stress (items=2000)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 6.99ms | 0.0% | 6.79ms–7.25ms | 143 ops/s | 349.44ms | 402.63ms | 23.92ms | 357.9MB | 110.5MB | 282.5KB | 20.7KB |
| Ink | 1 | 182.35ms | 0.0% | 176.93ms–187.85ms | 5 ops/s | 9.12s | 9.89s | 301.13ms | 1.36GB | 618.0MB | 4.1MB | 5.4MB |
| OpenTUI (React) | 1 | 271.49ms | 0.0% | 261.66ms–281.59ms | 4 ops/s | 13.57s | 15.35s | 1.76s | 7.42GB | 4.01GB | 310.7KB | 310.7KB |
| OpenTUI (Core) | 1 | 32.58ms | 0.0% | 32.04ms–33.15ms | 31 ops/s | 1.63s | 834.65ms | 834.66ms | 273.2MB | 78.1MB | 99.0KB | 99.0KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.24ms–8.39ms | 120 ops/s | 415.91ms | 107.05ms | 33.96ms | 0.00KB | 2.6MB | 238.6KB | 293.5KB |

## virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 639µs | 0.0% | 635µs–643µs | 1.6K ops/s | 639.27ms | 712.66ms | 18.12ms | 139.2MB | 45.0MB | 6.0MB | 1.7MB |
| Ink | 1 | 25.81ms | 0.0% | 24.75ms–26.91ms | 39 ops/s | 25.82s | 11.02s | 229.18ms | 352.1MB | 138.0MB | 1.9MB | 2.1MB |
| OpenTUI (React) | 1 | 22.03ms | 0.0% | 21.54ms–22.57ms | 45 ops/s | 22.03s | 24.60s | 840.31ms | 3.04GB | 1.19GB | 6.1MB | 6.1MB |
| OpenTUI (Core) | 1 | 1.20ms | 0.0% | 1.18ms–1.23ms | 831 ops/s | 1.20s | 559.55ms | 336.04ms | 120.1MB | 51.8MB | 5.6MB | 5.6MB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.28ms–8.35ms | 120 ops/s | 8.32s | 535.31ms | 601.82ms | 0.00KB | 2.1MB | 4.7MB | 5.2MB |

## tables (rows=100,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.13ms | 0.0% | 1.12ms–1.14ms | 884 ops/s | 339.34ms | 400.09ms | 10.23ms | 144.3MB | 49.1MB | 3.8MB | 1.5MB |
| Ink | 1 | 33.29ms | 0.0% | 31.44ms–35.18ms | 30 ops/s | 9.99s | 6.44s | 177.83ms | 853.0MB | 558.3MB | 3.1MB | 3.7MB |
| OpenTUI (React) | 1 | 53.30ms | 0.0% | 51.56ms–54.98ms | 19 ops/s | 15.99s | 18.82s | 920.07ms | 4.93GB | 1.94GB | 4.7MB | 4.7MB |
| OpenTUI (Core) | 1 | 1.54ms | 0.0% | 1.51ms–1.57ms | 650 ops/s | 461.76ms | 345.50ms | 217.25ms | 128.5MB | 49.3MB | 4.7MB | 4.7MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.25ms–8.41ms | 120 ops/s | 2.50s | 212.34ms | 180.59ms | 0.00KB | 3.2MB | 1.4MB | 1.6MB |

## memory-profile

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 644µs | 0.0% | 629µs–665µs | 1.6K ops/s | 1.29s | 1.50s | 38.30ms | 301.0MB | 124.4MB | 5.2MB | 1.6MB |
| Ink | 1 | 23.03ms | 0.0% | 22.33ms–23.74ms | 43 ops/s | 46.06s | 12.75s | 271.82ms | 282.3MB | 128.2MB | 1.5MB | 1.6MB |
| OpenTUI (React) | 1 | 7.17ms | 0.0% | 7.00ms–7.34ms | 139 ops/s | 14.34s | 12.76s | 323.75ms | 878.2MB | 296.1MB | 1.8MB | 1.8MB |
| OpenTUI (Core) | 1 | 1.19ms | 0.0% | 1.18ms–1.21ms | 837 ops/s | 2.39s | 1.12s | 589.40ms | 114.1MB | 51.5MB | 1.7MB | 1.7MB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.28ms–8.35ms | 120 ops/s | 16.62s | 876.81ms | 1.11s | 0.00KB | 3.3MB | 5.1MB | 5.3MB |
| terminal-kit | 1 | 60µs | 0.0% | 59µs–61µs | 16.6K ops/s | 120.38ms | 127.10ms | 1.48ms | 96.4MB | 30.2MB | 0.00KB | 0.00KB |
| blessed | 1 | 154µs | 0.0% | 153µs–155µs | 6.5K ops/s | 308.72ms | 302.65ms | 76.90ms | 111.8MB | 31.6MB | 997.9KB | 0.00KB |
| Ratatui (Rust) | 1 | 80µs | 0.0% | 80µs–80µs | 12.5K ops/s | 159.41ms | 0ns | 0ns | 0.00KB | n/a | 0.00KB | 0.00KB |

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 323µs | 0.0% | 322µs–324µs | 3.1K ops/s | 323.48ms | 346.74ms | 3.16ms | 99.0MB | 23.9MB | 277.7KB | 5.44KB |
| Ink | 1 | 18.84ms | 0.0% | 17.80ms–19.90ms | 53 ops/s | 18.84s | 1.63s | 62.78ms | 141.9MB | 38.4MB | 84.1KB | 95.7KB |
| OpenTUI (React) | 1 | 2.63ms | 0.0% | 2.59ms–2.67ms | 380 ops/s | 2.63s | 1.08s | 94.95ms | 157.0MB | 52.8MB | 127.2KB | 127.2KB |
| OpenTUI (Core) | 1 | 1.18ms | 0.0% | 1.15ms–1.21ms | 847 ops/s | 1.18s | 324.73ms | 74.29ms | 101.5MB | 38.5MB | 78.4KB | 78.4KB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.30ms–8.34ms | 120 ops/s | 8.32s | 253.00ms | 376.65ms | 0.00KB | 2.5MB | 125.9KB | 139.9KB |
| blessed | 1 | 43µs | 0.0% | 42µs–43µs | 23.3K ops/s | 42.86ms | 54.52ms | 716µs | 89.6MB | 22.6MB | 18.5KB | 18.5KB |
| Ratatui (Rust) | 1 | 72µs | 0.0% | 72µs–72µs | 13.9K ops/s | 71.79ms | 69.43ms | 9.64ms | 2.3MB | n/a | 34.5KB | 34.5KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 363µs | 0.0% | 361µs–366µs | 2.8K ops/s | 181.63ms | 214.18ms | 4.60ms | 102.0MB | 28.5MB | 177.7KB | 17.7KB |
| Ink | 1 | 21.73ms | 0.0% | 20.31ms–23.34ms | 46 ops/s | 10.87s | 2.56s | 47.20ms | 242.6MB | 55.3MB | 292.4KB | 343.8KB |
| OpenTUI (React) | 1 | 3.35ms | 0.0% | 3.29ms–3.41ms | 299 ops/s | 1.67s | 1.38s | 74.19ms | 525.3MB | 153.4MB | 1.3MB | 1.3MB |
| OpenTUI (Core) | 1 | 1.18ms | 0.0% | 1.14ms–1.21ms | 848 ops/s | 589.44ms | 275.80ms | 138.45ms | 117.6MB | 44.6MB | 66.8KB | 66.8KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 138.98ms | 192.91ms | 0.00KB | 3.0MB | 82.5KB | 116.6KB |
| blessed | 1 | 45µs | 0.0% | 44µs–46µs | 22.2K ops/s | 22.49ms | 42.31ms | 517µs | 87.2MB | 21.0MB | 16.4KB | 16.4KB |
| Ratatui (Rust) | 1 | 185µs | 0.0% | 184µs–185µs | 5.4K ops/s | 92.41ms | 96.46ms | 5.38ms | 2.5MB | n/a | 26.8KB | 26.8KB |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 637µs | 0.0% | 634µs–641µs | 1.6K ops/s | 318.57ms | 364.12ms | 5.80ms | 103.9MB | 27.3MB | 1.9MB | 272.6KB |
| Ink | 1 | 21.79ms | 0.0% | 20.39ms–23.37ms | 46 ops/s | 10.89s | 2.66s | 57.22ms | 262.2MB | 80.5MB | 536.8KB | 611.3KB |
| OpenTUI (React) | 1 | 3.35ms | 0.0% | 3.29ms–3.42ms | 298 ops/s | 1.68s | 1.36s | 77.68ms | 520.0MB | 153.0MB | 2.5MB | 2.5MB |
| OpenTUI (Core) | 1 | 1.18ms | 0.0% | 1.14ms–1.21ms | 850 ops/s | 587.90ms | 281.28ms | 150.63ms | 117.5MB | 44.5MB | 1.8MB | 1.8MB |
| Bubble Tea (Go) | 1 | 8.31ms | 0.0% | 8.27ms–8.34ms | 120 ops/s | 4.16s | 171.34ms | 210.44ms | 0.00KB | 3.5MB | 2.3MB | 2.6MB |
| blessed | 1 | 185µs | 0.0% | 174µs–200µs | 5.4K ops/s | 92.67ms | 113.48ms | 3.87ms | 115.4MB | 34.7MB | 599.7KB | 599.7KB |
| Ratatui (Rust) | 1 | 200µs | 0.0% | 199µs–200µs | 5.0K ops/s | 99.81ms | 103.49ms | 6.31ms | 2.5MB | n/a | 543.7KB | 543.7KB |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 658µs | 0.0% | 656µs–662µs | 1.5K ops/s | 658.94ms | 715.44ms | 14.49ms | 120.3MB | 36.1MB | 3.9MB | 1.5MB |
| Ink | 1 | 21.27ms | 0.0% | 20.19ms–22.37ms | 47 ops/s | 21.28s | 6.67s | 136.56ms | 289.7MB | 111.1MB | 2.0MB | 2.2MB |
| OpenTUI (React) | 1 | 5.14ms | 0.0% | 5.02ms–5.27ms | 195 ops/s | 5.14s | 4.44s | 192.42ms | 873.3MB | 326.2MB | 6.4MB | 6.4MB |
| OpenTUI (Core) | 1 | 1.19ms | 0.0% | 1.16ms–1.21ms | 843 ops/s | 1.19s | 479.45ms | 309.23ms | 119.6MB | 51.1MB | 6.4MB | 6.4MB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.30ms–8.34ms | 120 ops/s | 8.32s | 345.49ms | 403.07ms | 0.00KB | 2.8MB | 4.7MB | 5.2MB |
| blessed | 1 | 255µs | 0.0% | 238µs–280µs | 3.9K ops/s | 255.61ms | 363.94ms | 26.08ms | 262.6MB | 114.7MB | 3.1MB | 3.1MB |
| Ratatui (Rust) | 1 | 242µs | 0.0% | 239µs–246µs | 4.1K ops/s | 242.16ms | 241.73ms | 20.14ms | 2.8MB | n/a | 2.7MB | 2.7MB |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.16ms | 0.0% | 1.16ms–1.16ms | 862 ops/s | 1.39s | 1.47s | 14.91ms | 127.7MB | 43.3MB | 5.3MB | 908.7KB |
| Ink | 1 | 22.23ms | 0.0% | 21.25ms–23.20ms | 45 ops/s | 26.68s | 7.02s | 121.43ms | 290.7MB | 122.5MB | 3.1MB | 3.4MB |
| OpenTUI (React) | 1 | 5.97ms | 0.0% | 5.84ms–6.10ms | 167 ops/s | 7.17s | 6.29s | 239.13ms | 999.7MB | 350.8MB | 7.7MB | 7.7MB |
| OpenTUI (Core) | 1 | 1.27ms | 0.0% | 1.25ms–1.30ms | 785 ops/s | 1.53s | 643.72ms | 380.06ms | 119.0MB | 53.3MB | 6.4MB | 6.4MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 10.00s | 514.70ms | 584.21ms | 0.00KB | 3.1MB | 5.6MB | 6.1MB |
| blessed | 1 | 268µs | 0.0% | 261µs–276µs | 3.7K ops/s | 321.92ms | 350.31ms | 6.08ms | 155.6MB | 45.5MB | 1.6MB | 1.6MB |
| Ratatui (Rust) | 1 | 219µs | 0.0% | 218µs–219µs | 4.6K ops/s | 262.27ms | 263.75ms | 18.78ms | 2.6MB | n/a | 1.7MB | 1.7MB |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 648µs | 0.0% | 646µs–651µs | 1.5K ops/s | 648.58ms | 710.57ms | 12.46ms | 107.8MB | 29.1MB | 3.9MB | 219.2KB |
| Ink | 1 | 21.85ms | 0.0% | 20.76ms–22.97ms | 46 ops/s | 21.86s | 5.36s | 98.02ms | 269.8MB | 105.6MB | 1009.3KB | 1.1MB |
| OpenTUI (React) | 1 | 5.15ms | 0.0% | 5.03ms–5.28ms | 194 ops/s | 5.15s | 4.36s | 180.76ms | 865.6MB | 325.9MB | 3.8MB | 3.8MB |
| OpenTUI (Core) | 1 | 1.24ms | 0.0% | 1.22ms–1.27ms | 804 ops/s | 1.24s | 487.45ms | 302.13ms | 119.8MB | 51.0MB | 1.7MB | 1.7MB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.30ms–8.34ms | 120 ops/s | 8.32s | 429.94ms | 488.20ms | 0.00KB | 3.3MB | 4.5MB | 5.0MB |
| blessed | 1 | 169µs | 0.0% | 167µs–173µs | 5.9K ops/s | 169.79ms | 188.34ms | 7.54ms | 101.6MB | 28.5MB | 628.0KB | 692.4KB |
| Ratatui (Rust) | 1 | 187µs | 0.0% | 187µs–188µs | 5.3K ops/s | 187.34ms | 195.02ms | 11.23ms | 2.6MB | n/a | 442.1KB | 442.1KB |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 624µs | 0.0% | 622µs–627µs | 1.6K ops/s | 749.16ms | 817.52ms | 11.29ms | 125.8MB | 42.0MB | 4.7MB | 453.4KB |
| Ink | 1 | 21.77ms | 0.0% | 20.81ms–22.72ms | 46 ops/s | 26.12s | 6.34s | 103.29ms | 291.2MB | 129.4MB | 1.0MB | 1.2MB |
| OpenTUI (React) | 1 | 6.12ms | 0.0% | 5.99ms–6.26ms | 163 ops/s | 7.35s | 6.49s | 242.34ms | 1.01GB | 335.8MB | 5.5MB | 5.5MB |
| OpenTUI (Core) | 1 | 1.27ms | 0.0% | 1.24ms–1.29ms | 790 ops/s | 1.52s | 583.19ms | 376.60ms | 121.2MB | 53.9MB | 3.8MB | 3.8MB |
| Bubble Tea (Go) | 1 | 8.32ms | 0.0% | 8.31ms–8.34ms | 120 ops/s | 9.99s | 511.50ms | 579.31ms | 0.00KB | 3.4MB | 5.6MB | 6.3MB |
| blessed | 1 | 152µs | 0.0% | 147µs–157µs | 6.6K ops/s | 182.41ms | 192.63ms | 3.91ms | 141.7MB | 47.9MB | 1.1MB | 1.1MB |
| Ratatui (Rust) | 1 | 197µs | 0.0% | 197µs–197µs | 5.1K ops/s | 236.64ms | 252.25ms | 14.44ms | 2.6MB | n/a | 943.1KB | 943.1KB |

## terminal-full-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.14ms | 0.0% | 1.14ms–1.15ms | 874 ops/s | 1.37s | 1.44s | 18.54ms | 129.4MB | 44.0MB | 4.7MB | 2.0MB |
| Ink | 1 | 22.34ms | 0.0% | 21.37ms–23.30ms | 45 ops/s | 26.81s | 7.21s | 127.38ms | 300.6MB | 134.2MB | 5.4MB | 6.0MB |
| OpenTUI (React) | 1 | 6.10ms | 0.0% | 5.96ms–6.23ms | 164 ops/s | 7.32s | 6.53s | 277.39ms | 1.01GB | 335.0MB | 12.6MB | 12.6MB |
| OpenTUI (Core) | 1 | 1.32ms | 0.0% | 1.29ms–1.34ms | 760 ops/s | 1.58s | 696.08ms | 426.25ms | 131.3MB | 54.4MB | 18.0MB | 18.0MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 10.00s | 733.21ms | 561.38ms | 0.00KB | 3.3MB | 5.5MB | 6.1MB |
| blessed | 1 | 314µs | 0.0% | 298µs–333µs | 3.2K ops/s | 376.86ms | 434.80ms | 21.75ms | 259.5MB | 128.0MB | 3.7MB | 3.7MB |
| Ratatui (Rust) | 1 | 258µs | 0.0% | 258µs–259µs | 3.9K ops/s | 310.21ms | 313.29ms | 28.51ms | 2.9MB | n/a | 4.8MB | 4.8MB |

## terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 632µs | 0.0% | 629µs–635µs | 1.6K ops/s | 758.52ms | 845.10ms | 12.66ms | 128.0MB | 41.1MB | 4.6MB | 1021.9KB |
| Ink | 1 | 21.72ms | 0.0% | 20.77ms–22.66ms | 46 ops/s | 26.06s | 6.23s | 116.54ms | 285.6MB | 118.4MB | 2.9MB | 3.3MB |
| OpenTUI (React) | 1 | 5.98ms | 0.0% | 5.85ms–6.11ms | 167 ops/s | 7.18s | 6.37s | 253.32ms | 1.00GB | 329.3MB | 9.6MB | 9.6MB |
| OpenTUI (Core) | 1 | 1.26ms | 0.0% | 1.24ms–1.29ms | 792 ops/s | 1.52s | 646.57ms | 400.19ms | 131.9MB | 53.7MB | 11.3MB | 11.3MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 10.00s | 517.71ms | 573.59ms | 0.00KB | 3.1MB | 5.2MB | 5.8MB |
| blessed | 1 | 212µs | 0.0% | 198µs–231µs | 4.7K ops/s | 255.45ms | 302.77ms | 18.20ms | 247.4MB | 96.3MB | 2.7MB | 2.7MB |
| Ratatui (Rust) | 1 | 226µs | 0.0% | 225µs–228µs | 4.4K ops/s | 271.78ms | 275.10ms | 22.55ms | 3.0MB | n/a | 3.4MB | 3.4MB |

## terminal-strict-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 873µs | 0.0% | 866µs–881µs | 1.1K ops/s | 1.05s | 1.14s | 28.00ms | 201.2MB | 99.9MB | 27.0MB | 2.7MB |
| Ink | 1 | 22.14ms | 0.0% | 21.23ms–23.04ms | 45 ops/s | 26.57s | 8.68s | 151.74ms | 385.7MB | 164.1MB | 6.5MB | 7.3MB |
| OpenTUI (React) | 1 | 26.36ms | 0.0% | 25.63ms–27.02ms | 38 ops/s | 31.63s | 32.93s | 606.28ms | 2.22GB | 742.9MB | 11.0MB | 11.0MB |
| OpenTUI (Core) | 1 | 1.27ms | 0.0% | 1.26ms–1.29ms | 784 ops/s | 1.53s | 837.58ms | 602.48ms | 141.4MB | 69.6MB | 9.3MB | 9.3MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 10.00s | 2.09s | 455.50ms | 0.00KB | 30.7MB | 5.2MB | 5.8MB |
| blessed | 1 | 302µs | 0.0% | 290µs–315µs | 3.3K ops/s | 362.50ms | 399.91ms | 14.46ms | 205.6MB | 88.2MB | 1.9MB | 1.9MB |
| Ratatui (Rust) | 1 | 183µs | 0.0% | 183µs–183µs | 5.5K ops/s | 219.72ms | 219.97ms | 21.53ms | 3.0MB | n/a | 2.8MB | 2.8MB |

## terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 950µs | 0.0% | 941µs–959µs | 1.1K ops/s | 1.14s | 1.23s | 27.36ms | 200.0MB | 87.7MB | 28.0MB | 2.5MB |
| Ink | 1 | 22.19ms | 0.0% | 21.28ms–23.09ms | 45 ops/s | 26.63s | 8.80s | 139.52ms | 371.1MB | 193.7MB | 6.8MB | 7.5MB |
| OpenTUI (React) | 1 | 15.89ms | 0.0% | 15.54ms–16.23ms | 63 ops/s | 19.07s | 20.08s | 519.63ms | 2.22GB | 827.4MB | 10.4MB | 10.4MB |
| OpenTUI (Core) | 1 | 1.26ms | 0.0% | 1.25ms–1.28ms | 791 ops/s | 1.52s | 838.20ms | 596.30ms | 143.3MB | 69.8MB | 9.2MB | 9.2MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 10.00s | 2.11s | 460.72ms | 0.00KB | 26.4MB | 5.3MB | 5.9MB |
| blessed | 1 | 316µs | 0.0% | 303µs–332µs | 3.2K ops/s | 379.31ms | 417.27ms | 20.43ms | 245.5MB | 99.9MB | 2.2MB | 2.2MB |
| Ratatui (Rust) | 1 | 187µs | 0.0% | 186µs–187µs | 5.4K ops/s | 224.16ms | 225.37ms | 21.21ms | 3.2MB | n/a | 2.9MB | 2.9MB |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 644µs | 0.0% | 641µs–648µs | 1.6K ops/s | 644.47ms | 734.87ms | 16.22ms | 138.2MB | 45.4MB | 6.1MB | 1.7MB |
| Ink | 1 | 22.32ms | 0.0% | 21.25ms–23.41ms | 45 ops/s | 22.32s | 7.34s | 120.46ms | 370.8MB | 176.9MB | 1.9MB | 2.1MB |
| OpenTUI (React) | 1 | 25.59ms | 0.0% | 24.99ms–26.24ms | 39 ops/s | 25.59s | 28.82s | 653.47ms | 3.50GB | 1.46GB | 6.2MB | 6.2MB |
| OpenTUI (Core) | 1 | 1.28ms | 0.0% | 1.25ms–1.30ms | 783 ops/s | 1.28s | 530.48ms | 320.75ms | 121.8MB | 51.7MB | 5.7MB | 5.7MB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 8.33s | 432.16ms | 476.05ms | 0.00KB | 2.1MB | 4.7MB | 5.3MB |
| blessed | 1 | 124µs | 0.0% | 116µs–132µs | 8.1K ops/s | 123.89ms | 147.63ms | 4.67ms | 149.9MB | 56.4MB | 1.2MB | 1.2MB |
| Ratatui (Rust) | 1 | 121µs | 0.0% | 121µs–121µs | 8.3K ops/s | 121.01ms | 115.75ms | 15.22ms | 2.5MB | n/a | 1.3MB | 1.3MB |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 445µs | 0.0% | 440µs–451µs | 2.2K ops/s | 222.97ms | 257.01ms | 4.84ms | 106.8MB | 28.5MB | 1.0MB | 11.6KB |
| Ink | 1 | 21.78ms | 0.0% | 20.32ms–23.41ms | 46 ops/s | 10.89s | 2.54s | 52.72ms | 242.8MB | 77.2MB | 1.5MB | 1.7MB |
| OpenTUI (React) | 1 | 3.45ms | 0.0% | 3.39ms–3.52ms | 290 ops/s | 1.73s | 1.44s | 75.85ms | 541.0MB | 139.0MB | 1001.7KB | 1001.7KB |
| OpenTUI (Core) | 1 | 1.23ms | 0.0% | 1.19ms–1.27ms | 815 ops/s | 613.80ms | 308.94ms | 147.52ms | 121.4MB | 44.8MB | 69.4KB | 69.4KB |
| Bubble Tea (Go) | 1 | 8.33ms | 0.0% | 8.32ms–8.34ms | 120 ops/s | 4.17s | 260.62ms | 215.41ms | 0.00KB | 2.5MB | 141.6KB | 181.6KB |
| blessed | 1 | 102µs | 0.0% | 100µs–105µs | 9.8K ops/s | 51.26ms | 67.29ms | 1.54ms | 108.2MB | 29.6MB | 25.4KB | 25.4KB |
| Ratatui (Rust) | 1 | 177µs | 0.0% | 177µs–178µs | 5.6K ops/s | 88.57ms | 92.43ms | 5.42ms | 2.5MB | n/a | 30.8KB | 30.8KB |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario | Ink | OpenTUI (React) | OpenTUI (Core) | terminal-kit | blessed | Ratatui (Rust) |
|---|---:|---:|---:|---:|---:|---:|
| startup | 2.4x slower [2.2x, 2.6x] | 3.7x slower [3.5x, 3.9x] | 2.6x slower [2.4x, 2.8x] | 17.7x faster [16.1x, 19.5x] | 1.5x faster [1.3x, 1.6x] | 8.8x faster [8.5x, 9.0x] |
| tree-construction (items=10) | 527.2x slower [467.6x, 589.9x] | 97.0x slower [90.2x, 103.5x] | 29.4x slower [27.1x, 31.6x] | 1.3x slower [1.2x, 1.4x] | 5.3x slower [5.0x, 5.6x] | 21.9x slower [20.8x, 22.8x] |
| tree-construction (items=100) | 157.7x slower [141.8x, 173.3x] | 159.1x slower [148.0x, 169.4x] | 9.8x slower [9.3x, 10.4x] | 1.2x slower [1.1x, 1.2x] | 11.1x slower [10.5x, 11.5x] | 6.0x slower [5.7x, 6.2x] |
| tree-construction (items=500) | 70.4x slower [66.4x, 74.2x] | 187.1x slower [177.0x, 197.1x] | 12.0x slower [11.6x, 12.3x] | 1.3x slower [1.3x, 1.3x] | 13.5x slower [13.0x, 13.9x] | 1.8x slower [1.8x, 1.9x] |
| tree-construction (items=1000) | 60.6x slower [58.0x, 63.2x] | 211.1x slower [199.9x, 222.6x] | 13.2x slower [12.9x, 13.5x] | 1.4x slower [1.4x, 1.4x] | 14.6x slower [14.2x, 15.0x] | 1.8x slower [1.7x, 1.8x] |
| rerender | 58.2x slower [54.7x, 61.6x] | 8.8x slower [8.6x, 8.9x] | 3.8x slower [3.7x, 3.9x] | 7.9x faster [7.8x, 8.0x] | 8.5x faster [8.3x, 8.6x] | 4.8x faster [4.7x, 4.8x] |
| content-update | 40.4x slower [38.0x, 42.6x] | 151.4x slower [143.4x, 159.7x] | 7.3x slower [7.1x, 7.6x] | 1.1x slower [1.0x, 1.1x] | 2.3x faster [2.1x, 2.5x] | 1.2x slower [1.2x, 1.3x] |
| layout-stress (rows=40,cols=4) | 20.1x slower [18.4x, 21.8x] | 19.2x slower [18.5x, 19.9x] | 1.0x slower [1.0x, 1.1x] | N/A | N/A | N/A |
| scroll-stress (items=2000) | 26.1x slower [24.4x, 27.7x] | 38.9x slower [36.1x, 41.5x] | 4.7x slower [4.4x, 4.9x] | N/A | N/A | N/A |
| virtual-list (items=100000,viewport=40) | 40.4x slower [38.5x, 42.4x] | 34.5x slower [33.5x, 35.5x] | 1.9x slower [1.8x, 1.9x] | N/A | N/A | N/A |
| tables (rows=100,cols=8) | 29.4x slower [27.5x, 31.4x] | 47.1x slower [45.1x, 49.1x] | 1.4x slower [1.3x, 1.4x] | N/A | N/A | N/A |
| memory-profile | 35.8x slower [33.6x, 37.8x] | 11.1x slower [10.5x, 11.7x] | 1.9x slower [1.8x, 1.9x] | 10.7x faster [10.2x, 11.2x] | 4.2x faster [4.0x, 4.3x] | 8.1x faster [7.9x, 8.4x] |
| terminal-rerender | 58.3x slower [54.9x, 61.8x] | 8.1x slower [8.0x, 8.3x] | 3.7x slower [3.5x, 3.7x] | N/A | 7.6x faster [7.4x, 7.7x] | 4.5x faster [4.5x, 4.5x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | 59.9x slower [55.5x, 64.7x] | 9.2x slower [9.0x, 9.5x] | 3.2x slower [3.1x, 3.4x] | N/A | 8.1x faster [7.9x, 8.3x] | 2.0x faster [1.9x, 2.0x] |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | 34.2x slower [31.8x, 36.9x] | 5.3x slower [5.1x, 5.4x] | 1.8x slower [1.8x, 1.9x] | N/A | 3.4x faster [3.2x, 3.7x] | 3.2x faster [3.2x, 3.2x] |
| terminal-screen-transition (rows=40,cols=120) | 32.3x slower [30.5x, 34.1x] | 7.8x slower [7.6x, 8.0x] | 1.8x slower [1.8x, 1.8x] | N/A | 2.6x faster [2.3x, 2.8x] | 2.7x faster [2.7x, 2.8x] |
| terminal-fps-stream (rows=40,cols=120,channels=12) | 19.2x slower [18.3x, 20.0x] | 5.1x slower [5.0x, 5.3x] | 1.1x slower [1.1x, 1.1x] | N/A | 4.3x faster [4.2x, 4.5x] | 5.3x faster [5.3x, 5.3x] |
| terminal-input-latency (rows=40,cols=120) | 33.7x slower [31.9x, 35.6x] | 7.9x slower [7.7x, 8.2x] | 1.9x slower [1.9x, 2.0x] | N/A | 3.8x faster [3.7x, 3.9x] | 3.5x faster [3.4x, 3.5x] |
| terminal-memory-soak (rows=40,cols=120) | 34.9x slower [33.2x, 36.5x] | 9.8x slower [9.6x, 10.1x] | 2.0x slower [2.0x, 2.1x] | N/A | 4.1x faster [4.0x, 4.2x] | 3.2x faster [3.1x, 3.2x] |
| terminal-full-ui (rows=40,cols=120,services=24) | 19.5x slower [18.6x, 20.4x] | 5.3x slower [5.2x, 5.5x] | 1.2x slower [1.1x, 1.2x] | N/A | 3.6x faster [3.4x, 3.9x] | 4.4x faster [4.4x, 4.4x] |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 34.4x slower [32.7x, 36.0x] | 9.5x slower [9.2x, 9.7x] | 2.0x slower [2.0x, 2.0x] | N/A | 3.0x faster [2.7x, 3.2x] | 2.8x faster [2.8x, 2.8x] |
| terminal-strict-ui (rows=40,cols=120,services=24) | 25.4x slower [24.1x, 26.6x] | 30.2x slower [29.1x, 31.2x] | 1.5x slower [1.4x, 1.5x] | N/A | 2.9x faster [2.8x, 3.0x] | 4.8x faster [4.7x, 4.8x] |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | 23.4x slower [22.2x, 24.5x] | 16.7x slower [16.2x, 17.2x] | 1.3x slower [1.3x, 1.4x] | N/A | 3.0x faster [2.8x, 3.2x] | 5.1x faster [5.0x, 5.2x] |
| terminal-virtual-list (items=100000,viewport=40) | 34.7x slower [32.8x, 36.5x] | 39.7x slower [38.6x, 40.9x] | 2.0x slower [1.9x, 2.0x] | N/A | 5.2x faster [4.9x, 5.6x] | 5.3x faster [5.3x, 5.4x] |
| terminal-table (rows=40,cols=8) | 48.9x slower [45.0x, 53.2x] | 7.8x slower [7.5x, 8.0x] | 2.8x slower [2.6x, 2.9x] | N/A | 4.4x faster [4.2x, 4.5x] | 2.5x faster [2.5x, 2.6x] |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| startup | Rezi (native) | 174.8MB | 61.0MB | +75.1MB | +46.8MB | N/A | N/A |
| startup | Ink | 424.2MB | 72.5MB | +231.3MB | +26.4MB | N/A | N/A |
| startup | OpenTUI (React) | 342.0MB | 108.6MB | +202.5MB | +1.8MB | N/A | N/A |
| startup | OpenTUI (Core) | 163.6MB | 65.5MB | +54.8MB | +24.8MB | N/A | N/A |
| startup | Bubble Tea (Go) | 0.00KB | 1.9MB | 0KB | +1.5MB | N/A | N/A |
| startup | terminal-kit | 181.2MB | 68.0MB | +87.4MB | +51.6MB | N/A | N/A |
| startup | blessed | 377.5MB | 240.4MB | +255.5MB | +209.3MB | N/A | N/A |
| startup | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=10) | Rezi (native) | 101.2MB | 25.7MB | +17.5MB | +12.4MB | N/A | N/A |
| tree-construction (items=10) | Ink | 179.5MB | 60.1MB | +44.3MB | +18.3MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI (React) | 470.1MB | 146.0MB | +319.4MB | +97.3MB | N/A | N/A |
| tree-construction (items=10) | OpenTUI (Core) | 103.0MB | 39.7MB | +13.6MB | +1.9MB | N/A | N/A |
| tree-construction (items=10) | Bubble Tea (Go) | 0.00KB | 3.0MB | 0KB | +1.3MB | N/A | N/A |
| tree-construction (items=10) | terminal-kit | 85.4MB | 21.4MB | +304.0KB | +2.3MB | N/A | N/A |
| tree-construction (items=10) | blessed | 109.7MB | 26.1MB | +21.1MB | +10.8MB | N/A | N/A |
| tree-construction (items=10) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=100) | Rezi (native) | 136.2MB | 44.3MB | +48.7MB | +20.2MB | N/A | N/A |
| tree-construction (items=100) | Ink | 353.8MB | 177.8MB | +97.5MB | +151.6MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI (React) | 2.81GB | 1.03GB | +2.38GB | +924.5MB | N/A | N/A |
| tree-construction (items=100) | OpenTUI (Core) | 126.3MB | 54.3MB | +13.9MB | +14.5MB | N/A | N/A |
| tree-construction (items=100) | Bubble Tea (Go) | 0.00KB | 2.9MB | 0KB | +943.0KB | N/A | N/A |
| tree-construction (items=100) | terminal-kit | 87.8MB | 21.6MB | +128.0KB | +7.2MB | N/A | N/A |
| tree-construction (items=100) | blessed | 143.4MB | 46.1MB | +33.2MB | +5.9MB | N/A | N/A |
| tree-construction (items=100) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=500) | Rezi (native) | 334.0MB | 186.3MB | +191.9MB | +166.6MB | N/A | N/A |
| tree-construction (items=500) | Ink | 1.06GB | 725.4MB | +662.7MB | +675.2MB | N/A | N/A |
| tree-construction (items=500) | OpenTUI (React) | 8.29GB | 5.73GB | +6.91GB | +5.11GB | N/A | N/A |
| tree-construction (items=500) | OpenTUI (Core) | 232.9MB | 111.3MB | +9.8MB | +64.5MB | N/A | N/A |
| tree-construction (items=500) | Bubble Tea (Go) | 0.00KB | 3.3MB | 0KB | +1.6MB | N/A | N/A |
| tree-construction (items=500) | terminal-kit | 87.9MB | 22.4MB | +32.0KB | +7.9MB | N/A | N/A |
| tree-construction (items=500) | blessed | 374.1MB | 202.3MB | +83.5MB | +175.5MB | N/A | N/A |
| tree-construction (items=500) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| tree-construction (items=1000) | Rezi (native) | 386.3MB | 224.9MB | +164.8MB | +52.8MB | N/A | N/A |
| tree-construction (items=1000) | Ink | 2.03GB | 1019.2MB | +1.50GB | +937.8MB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI (React) | 10.09GB | 9.74GB | +6.35GB | +8.52GB | N/A | N/A |
| tree-construction (items=1000) | OpenTUI (Core) | 253.3MB | 156.2MB | +12.1MB | +14.1MB | N/A | N/A |
| tree-construction (items=1000) | Bubble Tea (Go) | 0.00KB | 3.7MB | 0KB | +870.0KB | N/A | N/A |
| tree-construction (items=1000) | terminal-kit | 88.2MB | 21.6MB | +48.0KB | +7.1MB | N/A | N/A |
| tree-construction (items=1000) | blessed | 428.8MB | 226.1MB | +55.8MB | +66.5MB | N/A | N/A |
| tree-construction (items=1000) | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| rerender | Rezi (native) | 97.7MB | 25.0MB | +14.4MB | +6.7MB | N/A | N/A |
| rerender | Ink | 165.8MB | 41.0MB | +32.5MB | +8.2MB | N/A | N/A |
| rerender | OpenTUI (React) | 215.3MB | 70.5MB | +91.6MB | +29.0MB | N/A | N/A |
| rerender | OpenTUI (Core) | 101.8MB | 38.8MB | +14.0MB | +1.2MB | N/A | N/A |
| rerender | Bubble Tea (Go) | 0.00KB | 3.2MB | 0KB | +2.8MB | N/A | N/A |
| rerender | terminal-kit | 86.2MB | 20.4MB | +224.0KB | +6.0MB | N/A | N/A |
| rerender | blessed | 89.9MB | 23.1MB | +3.5MB | +7.0MB | N/A | N/A |
| rerender | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| content-update | Rezi (native) | 367.1MB | 156.0MB | +162.5MB | +86.8MB | N/A | N/A |
| content-update | Ink | 1.06GB | 653.7MB | +679.4MB | +398.5MB | N/A | N/A |
| content-update | OpenTUI (React) | 7.04GB | 7.21GB | +5.00GB | +6.37GB | N/A | N/A |
| content-update | OpenTUI (Core) | 237.9MB | 110.4MB | +10.5MB | +63.6MB | N/A | N/A |
| content-update | Bubble Tea (Go) | 0.00KB | 3.4MB | 0KB | +1.3MB | N/A | N/A |
| content-update | terminal-kit | 94.6MB | 21.9MB | +96.0KB | +1.6MB | N/A | N/A |
| content-update | blessed | 360.1MB | 172.5MB | +202.3MB | +144.2MB | N/A | N/A |
| content-update | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| layout-stress (rows=40,cols=4) | Rezi (native) | 144.3MB | 50.8MB | +22.9MB | +31.7MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Ink | 424.9MB | 215.4MB | +139.0MB | +177.8MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI (React) | 2.16GB | 1.04GB | +1.68GB | +909.0MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | OpenTUI (Core) | 123.2MB | 46.6MB | +10.5MB | +7.3MB | N/A | N/A |
| layout-stress (rows=40,cols=4) | Bubble Tea (Go) | 0.00KB | 2.2MB | 0KB | +1.8MB | N/A | N/A |
| scroll-stress (items=2000) | Rezi (native) | 357.9MB | 110.5MB | +109.1MB | +67.7MB | N/A | N/A |
| scroll-stress (items=2000) | Ink | 1.36GB | 618.0MB | +794.3MB | +518.5MB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI (React) | 7.42GB | 4.01GB | +5.80GB | +3.41GB | N/A | N/A |
| scroll-stress (items=2000) | OpenTUI (Core) | 273.2MB | 78.1MB | +39.8MB | +32.8MB | N/A | N/A |
| scroll-stress (items=2000) | Bubble Tea (Go) | 0.00KB | 2.6MB | 0KB | +1.3MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Rezi (native) | 139.2MB | 45.0MB | +43.9MB | +20.9MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Ink | 352.1MB | 138.0MB | +101.4MB | +102.7MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI (React) | 3.04GB | 1.19GB | +2.60GB | +996.2MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | OpenTUI (Core) | 120.1MB | 51.8MB | +11.2MB | +12.5MB | N/A | N/A |
| virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 0.00KB | 2.1MB | 0KB | +316.0KB | N/A | N/A |
| tables (rows=100,cols=8) | Rezi (native) | 144.3MB | 49.1MB | +23.7MB | +31.3MB | N/A | N/A |
| tables (rows=100,cols=8) | Ink | 853.0MB | 558.3MB | +444.2MB | +270.2MB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI (React) | 4.93GB | 1.94GB | +4.04GB | +1.56GB | N/A | N/A |
| tables (rows=100,cols=8) | OpenTUI (Core) | 128.5MB | 49.3MB | +15.0MB | +9.3MB | N/A | N/A |
| tables (rows=100,cols=8) | Bubble Tea (Go) | 0.00KB | 3.2MB | 0KB | +2.3MB | N/A | N/A |
| memory-profile | Rezi (native) | 301.0MB | 124.4MB | +214.3MB | +73.3MB | 121.9214 KB/iter | no |
| memory-profile | Ink | 282.3MB | 128.2MB | +144.6MB | +53.8MB | 65.7010 KB/iter | no |
| memory-profile | OpenTUI (React) | 878.2MB | 296.1MB | +743.2MB | +251.0MB | N/A | N/A |
| memory-profile | OpenTUI (Core) | 114.1MB | 51.5MB | +13.3MB | +13.4MB | N/A | N/A |
| memory-profile | Bubble Tea (Go) | 0.00KB | 3.3MB | 0KB | +1.8MB | N/A | N/A |
| memory-profile | terminal-kit | 96.4MB | 30.2MB | +11.3MB | +5.6MB | 7.0829 KB/iter | no |
| memory-profile | blessed | 111.8MB | 31.6MB | +21.8MB | +3.9MB | 8.6139 KB/iter | no |
| memory-profile | Ratatui (Rust) | 0.00KB | n/a | 0KB | n/a | N/A | N/A |
| terminal-rerender | Rezi (native) | 99.0MB | 23.9MB | +16.6MB | +10.7MB | N/A | N/A |
| terminal-rerender | Ink | 141.9MB | 38.4MB | +8.5MB | +10.5MB | N/A | N/A |
| terminal-rerender | OpenTUI (React) | 157.0MB | 52.8MB | +53.0MB | +13.0MB | N/A | N/A |
| terminal-rerender | OpenTUI (Core) | 101.5MB | 38.5MB | +14.2MB | +873.0KB | N/A | N/A |
| terminal-rerender | Bubble Tea (Go) | 0.00KB | 2.5MB | 0KB | +2.1MB | N/A | N/A |
| terminal-rerender | blessed | 89.6MB | 22.6MB | +3.0MB | +1.7MB | N/A | N/A |
| terminal-rerender | Ratatui (Rust) | 2.3MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 102.0MB | 28.5MB | +18.9MB | +14.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ink | 242.6MB | 55.3MB | +75.1MB | +12.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI (React) | 525.3MB | 153.4MB | +370.8MB | +104.5MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | OpenTUI (Core) | 117.6MB | 44.6MB | +11.8MB | +5.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Bubble Tea (Go) | 0.00KB | 3.0MB | 0KB | +247.0KB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | blessed | 87.2MB | 21.0MB | +1.7MB | +5.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 103.9MB | 27.3MB | +19.7MB | +11.4MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ink | 262.2MB | 80.5MB | +91.7MB | +27.7MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI (React) | 520.0MB | 153.0MB | +365.1MB | +103.7MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | OpenTUI (Core) | 117.5MB | 44.5MB | +10.9MB | +5.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Bubble Tea (Go) | 0.00KB | 3.5MB | 0KB | +2.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | blessed | 115.4MB | 34.7MB | +22.5MB | +13.1MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 120.3MB | 36.1MB | +33.5MB | +10.0MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ink | 289.7MB | 111.1MB | +106.9MB | +62.7MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI (React) | 873.3MB | 326.2MB | +680.7MB | +267.6MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | OpenTUI (Core) | 119.6MB | 51.1MB | +11.1MB | +11.8MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 2.8MB | 0KB | +2.4MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | blessed | 262.6MB | 114.7MB | +156.2MB | +81.6MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Ratatui (Rust) | 2.8MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 127.7MB | 43.3MB | +37.3MB | +14.4MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ink | 290.7MB | 122.5MB | +117.0MB | +71.0MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI (React) | 999.7MB | 350.8MB | +806.2MB | +269.1MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | OpenTUI (Core) | 119.0MB | 53.3MB | +11.1MB | +14.1MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Bubble Tea (Go) | 0.00KB | 3.1MB | 0KB | +2.8MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | blessed | 155.6MB | 45.5MB | +56.6MB | +17.6MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 107.8MB | 29.1MB | +20.9MB | +15.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ink | 269.8MB | 105.6MB | +92.2MB | +54.1MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI (React) | 865.6MB | 325.9MB | +676.5MB | +267.3MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | OpenTUI (Core) | 119.8MB | 51.0MB | +12.0MB | +11.7MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 3.3MB | 0KB | +2.9MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | blessed | 101.6MB | 28.5MB | +12.9MB | +6.2MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 125.8MB | 42.0MB | +35.2MB | +18.2MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ink | 291.2MB | 129.4MB | +51.9MB | +101.8MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI (React) | 1.01GB | 335.8MB | +808.7MB | +263.8MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | OpenTUI (Core) | 121.2MB | 53.9MB | +13.3MB | +14.1MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Bubble Tea (Go) | 0.00KB | 3.4MB | 0KB | +373.0KB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | blessed | 141.7MB | 47.9MB | +40.5MB | +31.5MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Ratatui (Rust) | 2.6MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Rezi (native) | 129.4MB | 44.0MB | +38.6MB | +11.1MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ink | 300.6MB | 134.2MB | +104.1MB | +97.7MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | OpenTUI (React) | 1.01GB | 335.0MB | +822.6MB | +267.5MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | OpenTUI (Core) | 131.3MB | 54.4MB | +21.0MB | +14.7MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Bubble Tea (Go) | 0.00KB | 3.3MB | 0KB | +3.0MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | blessed | 259.5MB | 128.0MB | +147.0MB | +106.7MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 2.9MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 128.0MB | 41.1MB | +37.5MB | +12.4MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 285.6MB | 118.4MB | +109.6MB | +92.6MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (React) | 1.00GB | 329.3MB | +820.5MB | +262.1MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (Core) | 131.9MB | 53.7MB | +22.0MB | +14.0MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Bubble Tea (Go) | 0.00KB | 3.1MB | 0KB | +515.0KB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | blessed | 247.4MB | 96.3MB | +137.5MB | +57.3MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 3.0MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Rezi (native) | 201.2MB | 99.9MB | +103.6MB | +82.7MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ink | 385.7MB | 164.1MB | +125.9MB | +131.9MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | OpenTUI (React) | 2.22GB | 742.9MB | +1.89GB | +642.3MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | OpenTUI (Core) | 141.4MB | 69.6MB | +13.7MB | +28.0MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Bubble Tea (Go) | 0.00KB | 30.7MB | 0KB | +11.5MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | blessed | 205.6MB | 88.2MB | +91.9MB | +52.3MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Ratatui (Rust) | 3.0MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 200.0MB | 87.7MB | +102.6MB | +70.5MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ink | 371.1MB | 193.7MB | +109.3MB | +161.7MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (React) | 2.22GB | 827.4MB | +1.89GB | +727.2MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | OpenTUI (Core) | 143.3MB | 69.8MB | +16.0MB | +28.3MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Bubble Tea (Go) | 0.00KB | 26.4MB | 0KB | +7.0MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | blessed | 245.5MB | 99.9MB | +129.2MB | +36.0MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Ratatui (Rust) | 3.2MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 138.2MB | 45.4MB | +41.9MB | +26.7MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ink | 370.8MB | 176.9MB | +120.0MB | +121.1MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI (React) | 3.50GB | 1.46GB | +3.01GB | +1.31GB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | OpenTUI (Core) | 121.8MB | 51.7MB | +14.4MB | +12.3MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Bubble Tea (Go) | 0.00KB | 2.1MB | 0KB | +235.0KB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | blessed | 149.9MB | 56.4MB | +56.1MB | +40.0MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 106.8MB | 28.5MB | +22.6MB | +14.8MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ink | 242.8MB | 77.2MB | +75.7MB | +55.6MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI (React) | 541.0MB | 139.0MB | +381.4MB | +90.2MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | OpenTUI (Core) | 121.4MB | 44.8MB | +14.1MB | +6.2MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Bubble Tea (Go) | 0.00KB | 2.5MB | 0KB | +2.0MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | blessed | 108.2MB | 29.6MB | +16.6MB | +14.3MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Ratatui (Rust) | 2.5MB | n/a | 0KB | n/a | N/A | N/A |
