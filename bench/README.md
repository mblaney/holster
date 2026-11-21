# Holster write benchmark

Measures how fast holster writes data to disk, with Gun alongside for
comparison. Each scenario runs in a fresh process that writes to a new data
folder, then a second process reads back a sample of the records to check
they really reached disk.

Run the commands below from the holster folder, not from `bench`.

## Setup

The benchmark has its own dependencies, so Gun isn't a dependency of holster
itself. Install them once with:

```
npm install --prefix bench
```

## Running

The full comparison, about an hour:

```
npm run bench -- --gun-until 1 --cpu 0-3
```

Pass `--gun-until 1` whenever you compare the two, since it's the only
setting that makes the results comparable. Holster's radisk also waits 1ms
before writing a batch, so this gives Gun the same 1ms write delay. Gun's own
default is 250ms, which the full run uses unless this is set, so without it
each Gun write waits a quarter of a second and the results compare the delays
rather than the libraries. Gun lost records at every delay we tried, its
default included, so the shorter delay doesn't account for the records it
fails to read back.

`--cpu 0-3` runs every process on CPUs 0 to 3, using `taskset`, so it's for
Linux. On a CPU with cores of different speeds, results otherwise vary
depending on which cores the processes are given. Use the list of your
fastest cores, and give it more than one, since node also uses threads for
garbage collection and file writes. On Linux,
`/sys/devices/cpu_core/cpus` lists the performance cores when a CPU has
them.

A shorter run of just the concurrent scenarios takes a couple of minutes.
The short preset sets Gun's write delay to 1ms itself, so it doesn't need
`--gun-until 1`:

```
npm run bench:short -- --cpu 0-3
```

## Options

| Option               | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `--preset short`     | Only the concurrent scenarios, as `bench:short` does. |
| `--libs holster`     | Run one library, `holster` or `gun`.                  |
| `--scenarios a,b`    | Run only the named scenarios.                         |
| `--repeat 1`         | Run each scenario once instead of three times.        |
| `--label name`       | Add a name to the saved results file.                 |
| `--gun-until ms`     | Gun's write delay.                                    |
| `--holster-batch n`  | Radisk's batch size, 10,000 by default.               |
| `--holster-write ms` | Radisk's write delay, 1ms by default.                 |
| `--cpu list`         | Run every process on these CPUs, such as `0-3`.       |
| `--keep`             | Keep each run's data folder in `bench/data`.          |

## Scenarios

| Scenario              | What it writes                                                    |
| --------------------- | ----------------------------------------------------------------- |
| small-sequential      | 10,000 small records, one at a time                               |
| small-concurrent      | 10,000 small records, 100 at a time                               |
| small-burst           | 10,000 small records, 1,000 at a time                             |
| large-1kb-concurrent  | 1,000 records of 1 KB, 100 at a time                              |
| many-properties       | 10,000 properties added to one node                               |
| large-1kb             | 1,000 records of 1 KB                                             |
| large-10kb            | 500 records of 10 KB                                              |
| large-100kb           | 100 records of 100 KB                                             |
| overwrite             | 1,000 records each written 10 times                               |
| user-small-sequential | 1,000 small records written by a user, one at a time              |
| user-small-concurrent | 2,000 small records written by a user, 100 at a time              |
| user-overwrite        | 200 records written by a user, each written 5 times               |
| radisk-direct         | 10,000 small records' properties written to radisk, 100 at a time |

The user scenarios create and log in a user before timing starts, so every
write is signed. radisk-direct writes below the API, the way holster's store
writes each property.

## Results

The header line describes the setup: versions, write delays, the CPU and any
pinning, and the filesystem. The table gives each scenario's writes per
second, total time, latency percentiles, data on disk, peak memory, and how
many of the sampled records read back correctly. Numbers are the median of
the repeated runs.

Every run is saved as JSON in `bench/results`, named with the date and any
label, including each individual run alongside the medians.

The data folders are created in `bench/data`, so results depend on that
disk. A copy of the benchmark under a memory-backed folder such as `/tmp`
runs faster, and its results aren't comparable with runs on disk.
