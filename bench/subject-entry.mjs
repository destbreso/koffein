// The panel this report measures, in a form a separate process can rebuild.
//
// cache-arena times the throughput axis in K separate processes, and a
// `Subject` is closures: `make` builds a cache, and a closure does not cross a
// process boundary. So the harness is not handed the panel, it is told how to
// build it, and this is that description. `bench/arena.mjs` points at this file
// and every replicate imports it and calls `createSubjects`.
//
// It has to be deterministic, because five processes building five different
// panels would not be five repeats of one experiment. Everything randomized
// here is seeded from the same constant: koffein's admission tie-break coin and
// cache-arena's Random reference policy. What is left unseeded is `transitory`,
// which carries its own internal coin and is the one row whose run-to-run
// variation is genuinely its own.

import { adapter, competitors, mulberry32, referencePolicies } from "cache-arena";

import { Cache, WTinyLFU } from "../dist/index.js";

export const SEED = 1;

export async function createSubjects() {
  const koffein = adapter({
    name: "koffein",
    policy: "W-TinyLFU",
    source: "koffein",
    make: (capacity) => new Cache(capacity, { policy: new WTinyLFU({ random: mulberry32(SEED) }) }),
  });
  const { subjects: competitorSubjects } = await competitors();
  return [koffein, ...referencePolicies(mulberry32(SEED)), ...competitorSubjects];
}
