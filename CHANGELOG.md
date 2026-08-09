# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to adhere
to [Semantic Versioning](https://semver.org/).

## [0.6.1]

**"Keys can be any type" was true for storage and quietly false for everything this cache is for.** The default hash sends anything that is not a string or an integer through `String(key)`, so every plain object collapses onto the single counter `"[object Object]"`, the frequency sketch can no longer tell a hot key from a one-hit scan, and scan resistance stops working. Measured: a hot object key touched fifty times is evicted by a 200-key sweep, while the identical test with string keys survives. The warning now sits at the point of the claim rather than a paragraph later, and all three behaviours are pinned by tests, including the failure, so the README's warning has something behind it.

**Two public exports had no tests at all.** The `hash` option of `WTinyLFU`, which is the escape hatch for the trap above, and `IntrusiveList`, advertised as "handy when writing your own", were both documented and untouched by the suite.

**The headline said less than it knew.** The +84% is against plain LRU, the weakest live policy, at the most extreme cache size; at 10% of footprint it is +8%. And at the exact column quoted, koffein sits at the bottom of the top group behind S3-FIFO, `transitory`, SIEVE and LFU. The table now says so. The claim that survives, that a good modern policy beats LRU by a lot and this is one, is the useful one anyway. Also corrected: koffein was described as the only family recovering any hits on a pure loop, where the table shows it at 0.0% below a quarter of footprint and Random at 2.0%.

**Nothing loaded the build before publishing it.** No test imports from `dist/`, so the ESM output, the CJS output and the declarations were only ever exercised by a consumer. `npm run verify:dist` loads both entry points and drives a real cache through them, and `prepublishOnly` runs the typecheck, the suite, the build and that gate rather than the build alone.

Also: the git remote still pointed at `destbreso/caffea` and worked only through GitHub's rename redirect.

## [Unreleased]

### Changed

- **Renamed the package from `caffea` to `koffein`.** Same cache, same API; only
  the name changed (`npm install koffein`, `import { Cache } from "koffein"`). The
  old `caffea` package on npm is deprecated and points here.

### Next

- Possibly stale-while-revalidate memoization. The core is feature-complete; the
  next bump is likely the stabilization to 1.0.

## [0.6.0]

### Added

- String policy selection backed by an **extensible** registry.
  `new Cache(cap, { policy: "lru" })` selects a policy by name, and
  `registerPolicy(name, factory)` makes your OWN policy selectable the same way,
  so the selector adapts to custom policies instead of knowing only the built-ins
  (a selector that did not do this would quietly undo the whole point of the
  pluggable interface). Built-ins `"w-tinylfu"`, `"lru"`, and `"lfu"` are
  pre-registered; `policyNames()` lists what is available; an unknown name throws
  a `RangeError` that lists the known names. The registry stores factories, so
  every cache gets a fresh policy instance. Exported `registerPolicy`,
  `policyNames`, and the `PolicyFactory` type.

## [0.5.0]

### Added

- `memo(fn, options?)`: memoize a sync or async function on top of a cache
  (W-TinyLFU + optional TTL by default). Async-aware: it caches the *promise*, so
  concurrent calls for the same key share one in-flight computation (the function
  runs once, not once per caller), and it evicts the entry if that promise
  rejects, so a failure is never cached and the next call retries. Keys default to
  the first argument (pass `keyFn` for multi-argument functions); `capacity`,
  `ttl`, `clock`, and `policy` pass through to the cache. The returned function
  carries `.cache`, `.delete(...args)`, `.clear()`, and `.stats()`. A result of
  `undefined` is treated as "no result" and is not cached. Covered by tests
  (sync and async caching, in-flight de-duplication, rejection not cached,
  custom keys, TTL expiry, and the invalidation surface).

## [0.4.0]

### Changed (breaking, pre-1.0)

- The eviction policy is now pluggable. `new Cache(cap, { policy })` selects it
  and defaults to `new WTinyLFU()`, so `new Cache(cap)` behaves exactly as before.
  The `hash` and `random` options moved off the `Cache` onto `WTinyLFU`
  (`new WTinyLFU({ hash, random })`), since they only ever configured the
  W-TinyLFU sketch and admission coin.
- TTL and the eviction policy are now cleanly orthogonal: TTL correctness stays
  eager (checked on every read, whatever policy is installed), but the internal
  "an expired entry is the free eviction victim" shortcut from 0.3.0 is gone,
  because the policy no longer knows about time. Expiry is still lazy on reads.

### Added

- `EvictionPolicy<K, V>` interface and three built-in policies: `WTinyLFU`
  (the default), `LRU`, and `LFU`. Install one with `{ policy: new LRU() }`, or
  implement the interface to plug in your own. Built on the shared intrusive
  list, so every built-in is allocation-free. Exported the `Node`,
  `EvictionPolicy`, and `WTinyLFUOptions` types.
- The hit-ratio bake-off now drives the shipped policies (swapped by one line)
  instead of separate reference implementations; the numbers are byte-identical,
  which is a nice check that the built-ins match the textbook algorithms.

## [0.3.0]

### Added

- TTL (expire after write). `new Cache(cap, { ttl })` sets a cache-wide default;
  `set(key, value, ttl)` overrides it per entry; omit both and entries never
  expire. Expiry is lazy: an expired entry reads as a miss and is unlinked on the
  next access, and it is the preferred (free) victim if the eviction policy meets
  it first. The clock is injectable via `options.clock` (defaults to `Date.now`)
  so expiry is deterministic under test. Invalid TTLs throw `RangeError`. Covered
  by tests (per-entry and default expiry, override, never-expire, refresh on
  write, cleanup on access, `has` / `peek` semantics, bounded eviction with TTLs).
- Exported the `CacheOptions` type.

## [0.2.0]

### Added

- `Cache<K, V>`: a real W-TinyLFU cache. An LRU admission window (~1%) in front
  of a Segmented LRU main region (probation + protected ~80%), with the frequency
  sketch gating admission: a candidate aged out of the window is admitted only if
  it has been seen at least as often as the entry it would replace, so a one-hit
  scan cannot evict a proven-hot entry. Ties break on a coin flip (Caffeine's
  anti-hashDoS admission). Surface: `get` / `set` / `has` / `peek` / `delete` /
  `clear` and `stats()`; keys of any type (built-in hashing for strings and
  integers, overridable via `options.hash`). Built on an intrusive doubly-linked
  list for O(1) moves between segments. Covered by tests (bounded size under
  load, scan resistance, a frequently requested key winning admission, and a high
  hit ratio on a skewed workload).
- Hit-ratio bake-off (`bench/bakeoff.mjs`, `npm run bench:cache`): drives koffein,
  a textbook LRU, and a textbook in-cache LFU through identical seeded traces
  (Zipfian skew, scan pollution, and a shifting working set) and reports hit
  ratio, scoring all three with one `has`-gated driver so no key is double
  counted. koffein is the only policy that is never the worst: it beats LRU by
  ~9-10 points on skew and scan, and it beats a no-aging LFU by ~32 points on the
  shifting workload (where LFU gets stuck on stale keys).

## [0.1.0]

### Added

- `FrequencySketch`: a Count-Min Sketch with 4-bit saturating counters and
  periodic aging (the frequency estimator behind TinyLFU / W-TinyLFU admission).
  One-sided error (never underestimates), saturating at 15, recency-biased aging
  every `10 x capacity` increments. Covered by correctness tests (Count-Min
  guarantee, saturation, deterministic aging, input validation).
