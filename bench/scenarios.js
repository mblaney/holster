// The write scenarios the benchmark runs. Each one gives the records to
// write as [soul, data] pairs, how many to write at once, and a sample of
// records to read back afterwards to check they really reached disk.

// A small seeded random number generator, so every run writes the same
// data.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const letters = "abcdefghijklmnopqrstuvwxyz      "

// Text of the given length made of letters and spaces, the same for the
// same seed.
function text(length, seed) {
  const next = random(seed)
  let result = ""
  for (let i = 0; i < length; i++) {
    result += letters[Math.floor(next() * letters.length)]
  }
  return result
}

// A typical small record, such as a post or a message.
const small = i => ({title: `Record ${i}`, body: text(100, i), n: i})

// Every tenth record, plus the last, to read back.
const everyTenth = count =>
  [...Array(count).keys()].filter(i => i % 10 === 0 || i === count - 1)

function* records(count, soul, data) {
  for (let i = 0; i < count; i++) yield [soul(i), data(i)]
}

export const scenarios = {
  "small-sequential": {
    description: "10,000 small records, one at a time",
    concurrency: 1,
    records: () => records(10000, i => `small${i}`, small),
    verify: () => everyTenth(10000).map(i => [`small${i}`, small(i)]),
  },
  "small-concurrent": {
    description: "10,000 small records, 100 at a time",
    concurrency: 100,
    records: () => records(10000, i => `small${i}`, small),
    verify: () => everyTenth(10000).map(i => [`small${i}`, small(i)]),
  },
  // Many writes in flight at once, which suits Gun's batching. These and
  // user-small-concurrent make up the short preset.
  "small-burst": {
    description: "10,000 small records, 1,000 at a time",
    concurrency: 1000,
    records: () => records(10000, i => `burst${i}`, small),
    verify: () => everyTenth(10000).map(i => [`burst${i}`, small(i)]),
  },
  "large-1kb-concurrent": {
    description: "1,000 records of 1 KB, 100 at a time",
    concurrency: 100,
    records: () =>
      records(
        1000,
        i => `concurrent1k${i}`,
        i => ({body: text(1024, i)}),
      ),
    verify: () =>
      everyTenth(1000).map(i => [`concurrent1k${i}`, {body: text(1024, i)}]),
  },
  "many-properties": {
    description: "10,000 properties added to one node",
    concurrency: 1,
    records: () =>
      records(
        10000,
        () => "properties",
        i => ({[`p${i}`]: text(20, i)}),
      ),
    verify: () => [
      [
        "properties",
        Object.fromEntries(everyTenth(10000).map(i => [`p${i}`, text(20, i)])),
      ],
    ],
  },
  "large-1kb": {
    description: "1,000 records of 1 KB",
    concurrency: 1,
    records: () =>
      records(
        1000,
        i => `large1k${i}`,
        i => ({body: text(1024, i)}),
      ),
    verify: () =>
      everyTenth(1000).map(i => [`large1k${i}`, {body: text(1024, i)}]),
  },
  "large-10kb": {
    description: "500 records of 10 KB",
    concurrency: 1,
    records: () =>
      records(
        500,
        i => `large10k${i}`,
        i => ({body: text(10240, i)}),
      ),
    verify: () =>
      everyTenth(500).map(i => [`large10k${i}`, {body: text(10240, i)}]),
  },
  "large-100kb": {
    description: "100 records of 100 KB",
    concurrency: 1,
    records: () =>
      records(
        100,
        i => `large100k${i}`,
        i => ({body: text(102400, i)}),
      ),
    verify: () =>
      everyTenth(100).map(i => [`large100k${i}`, {body: text(102400, i)}]),
  },
  overwrite: {
    description: "1,000 records each written 10 times",
    concurrency: 1,
    records: function* () {
      for (let round = 0; round < 10; round++) {
        for (let i = 0; i < 1000; i++) {
          yield [`overwrite${i}`, {round, body: text(100, round * 1000 + i)}]
        }
      }
    },
    verify: () =>
      everyTenth(1000).map(i => [
        `overwrite${i}`,
        {round: 9, body: text(100, 9000 + i)},
      ]),
  },
  // Written by a logged in user, so every write is signed. These are smaller
  // than the others since signing takes longer.
  "user-small-sequential": {
    description: "1,000 small records written by a user, one at a time",
    layer: "user",
    concurrency: 1,
    records: () => records(1000, i => `usersmall${i}`, small),
    verify: () => everyTenth(1000).map(i => [`usersmall${i}`, small(i)]),
  },
  "user-small-concurrent": {
    description: "2,000 small records written by a user, 100 at a time",
    layer: "user",
    concurrency: 100,
    records: () => records(2000, i => `userconcurrent${i}`, small),
    verify: () => everyTenth(2000).map(i => [`userconcurrent${i}`, small(i)]),
  },
  "user-overwrite": {
    description: "200 records written by a user, each written 5 times",
    layer: "user",
    concurrency: 1,
    records: function* () {
      for (let round = 0; round < 5; round++) {
        for (let i = 0; i < 200; i++) {
          yield [`useroverwrite${i}`, {round, body: text(100, round * 200 + i)}]
        }
      }
    },
    verify: () =>
      everyTenth(200).map(i => [
        `useroverwrite${i}`,
        {round: 4, body: text(100, 800 + i)},
      ]),
  },
  // Below the API, the way store.put writes each property, so encoding and
  // file writes are measured without the rest of put.
  "radisk-direct": {
    description:
      "10,000 small records' properties written to radisk, 100 at a time",
    layer: "radisk",
    concurrency: 100,
    records: function* () {
      const state = 1700000000000
      for (let i = 0; i < 10000; i++) {
        for (const [key, value] of Object.entries(small(i))) {
          yield [`radisk${i}\x05${key}`, [value, state]]
        }
      }
    },
    verify: () =>
      everyTenth(10000).flatMap(i =>
        Object.entries(small(i)).map(([key, value]) => [
          `radisk${i}\x05${key}`,
          [value, 1700000000000],
        ]),
      ),
  },
}
