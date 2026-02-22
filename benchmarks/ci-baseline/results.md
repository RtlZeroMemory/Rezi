# Benchmark Results

> 2026-02-22T05:55:14.417Z | Node v20.19.5 | Bun 1.3.9 | rustc rustc 1.93.0 (254b59607 2026-01-19) | cargo cargo 1.93.0 (083ac5135 2025-12-15) | Linux 6.6.87.2-microsoft-standard-WSL2 | linux x64 | AMD Ryzen 7 9800X3D 8-Core Processor (12 cores) | RAM 15993MB | governor=n/a | wsl=yes

> WARNING: Results collected on WSL/virtualized kernel; expect higher timer and I/O jitter.

> Invocation: suite=terminal matchup=none scenario=all framework=rezi-native warmup=50 iterations=800 quick=no io=stub opentuiDriver=react replicates=1 discardFirstReplicate=no shuffleFrameworkOrder=no shuffleSeed=rezi-bench-seed envCheck=warn cpuAffinity=none

> Byte columns: "Bytes(local)" = framework-local counter; "Bytes(pty)" = observed PTY bytes (cross-framework comparable in PTY mode).

## terminal-rerender

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 36µs | 0.0% | 34µs–39µs | 27.6K ops/s | 29.00ms | 61.03ms | 4.35ms | 78.6MB | 19.4MB | 156.3KB | n/a |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=1)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 64µs | 0.0% | 61µs–67µs | 15.5K ops/s | 51.46ms | 99.92ms | 8.41ms | 87.6MB | 29.9MB | 243.8KB | n/a |

## terminal-frame-fill (rows=40,cols=120,dirtyLines=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 104µs | 0.0% | 100µs–109µs | 9.6K ops/s | 83.73ms | 133.45ms | 13.43ms | 90.7MB | 31.5MB | 2.8MB | n/a |

## terminal-screen-transition (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 114µs | 0.0% | 109µs–120µs | 8.7K ops/s | 92.01ms | 164.39ms | 4.90ms | 91.4MB | 32.9MB | 2.8MB | n/a |

## terminal-fps-stream (rows=40,cols=120,channels=12)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.97ms | 0.0% | 1.96ms–1.98ms | 507 ops/s | 1.58s | 1.62s | 45.76ms | 104.0MB | 40.2MB | 3.2MB | n/a |

## terminal-input-latency (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 104µs | 0.0% | 99µs–109µs | 9.6K ops/s | 83.38ms | 142.49ms | 22.04ms | 84.2MB | 26.7MB | 2.8MB | n/a |

## terminal-memory-soak (rows=40,cols=120)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 102µs | 0.0% | 98µs–106µs | 9.8K ops/s | 81.78ms | 142.90ms | 6.97ms | 91.5MB | 33.8MB | 2.8MB | n/a |

## terminal-full-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 1.88ms | 0.0% | 1.87ms–1.89ms | 533 ops/s | 1.50s | 1.55s | 53.67ms | 106.5MB | 35.7MB | 2.8MB | n/a |

## terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 112µs | 0.0% | 108µs–118µs | 8.8K ops/s | 90.56ms | 153.14ms | 21.66ms | 91.0MB | 32.2MB | 2.7MB | n/a |

## terminal-strict-ui (rows=40,cols=120,services=24)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 723µs | 0.0% | 697µs–754µs | 1.4K ops/s | 579.10ms | 876.51ms | 60.36ms | 175.4MB | 96.6MB | 14.7MB | n/a |

## terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 677µs | 0.0% | 652µs–707µs | 1.5K ops/s | 542.37ms | 815.59ms | 71.25ms | 262.1MB | 185.3MB | 14.7MB | n/a |

## terminal-virtual-list (items=100000,viewport=40)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 572µs | 0.0% | 540µs–614µs | 1.7K ops/s | 458.57ms | 609.11ms | 62.09ms | 228.7MB | 153.1MB | 3.3MB | n/a |

## terminal-table (rows=40,cols=8)

| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes(local) | Bytes(pty) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rezi (native) | 1 | 83µs | 0.0% | 79µs–87µs | 11.9K ops/s | 67.09ms | 134.22ms | 2.68ms | 88.6MB | 31.4MB | 1.4MB | n/a |

## Relative Performance (vs Rezi native)

> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.

| Scenario |  |
|---||
| terminal-rerender |  |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) |  |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) |  |
| terminal-screen-transition (rows=40,cols=120) |  |
| terminal-fps-stream (rows=40,cols=120,channels=12) |  |
| terminal-input-latency (rows=40,cols=120) |  |
| terminal-memory-soak (rows=40,cols=120) |  |
| terminal-full-ui (rows=40,cols=120,services=24) |  |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) |  |
| terminal-strict-ui (rows=40,cols=120,services=24) |  |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) |  |
| terminal-virtual-list (items=100000,viewport=40) |  |
| terminal-table (rows=40,cols=8) |  |

## Memory Comparison

| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |
|---|---|---:|---:|---:|---:|---:|---:|
| terminal-rerender | Rezi (native) | 78.6MB | 19.4MB | +14.9MB | +2.9MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=1) | Rezi (native) | 87.6MB | 29.9MB | +18.8MB | +18.8MB | N/A | N/A |
| terminal-frame-fill (rows=40,cols=120,dirtyLines=40) | Rezi (native) | 90.7MB | 31.5MB | +20.2MB | +20.3MB | N/A | N/A |
| terminal-screen-transition (rows=40,cols=120) | Rezi (native) | 91.4MB | 32.9MB | +21.0MB | +18.3MB | N/A | N/A |
| terminal-fps-stream (rows=40,cols=120,channels=12) | Rezi (native) | 104.0MB | 40.2MB | +26.4MB | +3.8MB | N/A | N/A |
| terminal-input-latency (rows=40,cols=120) | Rezi (native) | 84.2MB | 26.7MB | +11.6MB | +10.6MB | N/A | N/A |
| terminal-memory-soak (rows=40,cols=120) | Rezi (native) | 91.5MB | 33.8MB | +20.9MB | +22.5MB | N/A | N/A |
| terminal-full-ui (rows=40,cols=120,services=24) | Rezi (native) | 106.5MB | 35.7MB | +31.3MB | +8.9MB | N/A | N/A |
| terminal-full-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 91.0MB | 32.2MB | +20.7MB | +21.1MB | N/A | N/A |
| terminal-strict-ui (rows=40,cols=120,services=24) | Rezi (native) | 175.4MB | 96.6MB | +85.1MB | +40.5MB | N/A | N/A |
| terminal-strict-ui-navigation (rows=40,cols=120,services=24,dwell=8) | Rezi (native) | 262.1MB | 185.3MB | +179.9MB | +171.9MB | N/A | N/A |
| terminal-virtual-list (items=100000,viewport=40) | Rezi (native) | 228.7MB | 153.1MB | +59.5MB | +87.8MB | N/A | N/A |
| terminal-table (rows=40,cols=8) | Rezi (native) | 88.6MB | 31.4MB | +18.1MB | +18.3MB | N/A | N/A |
