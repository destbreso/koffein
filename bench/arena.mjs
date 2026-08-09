// Maintainer script: regenerate BENCHMARKS.md and its charts for koffein, using
// the cache-arena benchmark harness as the (neutral, third-party) measurement
// source. The numbers in BENCHMARKS.md come from here.
//
//   npm run bench:arena
//
// cache-arena and the competitor caches it compares against are devDependencies
// (cache-arena lazy-imports the competitors, so they must be installed here for
// the full field to show up). koffein is measured on the SAME seeded workloads and
// through the SAME uniform driver as every other cache, so the comparison is
// apples to apples. koffein's default policy is W-TinyLFU; the `transitory` package
// is the other npm W-TinyLFU, included for a same-family sanity check.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  standardWorkloads,
  competitors,
  measureAllResidency,
  missRatioCurves,
  throughputAcrossProcesses,
  buildReport,
} from "cache-arena";

import { createSubjects } from "./subject-entry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Read off the harness that actually ran, rather than a version typed into
// prose. This report went two minors out of date once because it said
// "cache-arena" and not which one, so nothing in the file could contradict it.
const ARENA_VERSION = JSON.parse(
  await readFile(join(root, "node_modules/cache-arena/package.json"), "utf8"),
).version;
// koffein as a benchmark subject, and the rest of the panel, live in
// `subject-entry.mjs`. They are defined there rather than here because a
// replicate has to be able to rebuild them in its own process, and a panel
// defined in two places is two panels the day one of them is edited.

const workloads = standardWorkloads();
const { missing } = await competitors();
// The panel comes from `subject-entry.mjs` so that the replicates below build
// the same one this process does. Seeded throughout, so the only residual
// run-to-run variation is transitory's own internal (unseeded) admission coin.
const subjects = await createSubjects();

console.log(`cache-arena: ${subjects.length} caches over ${workloads.length} workloads`);
if (missing.length) console.log(`(not installed, skipped: ${missing.join(", ")})`);

const mrc = missRatioCurves({ subjects, workloads, includeOpt: true });

// The efficiency axis above is deterministic and measured once. The clock is
// not, so it is measured again from scratch in a fresh process five times, and
// two caches are ranked only when all five agreed on the direction. A pair they
// split is printed as unordered, which is a result and not a gap.
const throughput = await throughputAcrossProcesses({
  subjects: {
    module: pathToFileURL(join(root, "bench/subject-entry.mjs")).href,
    exportName: "createSubjects",
  },
  workloads,
  residency: measureAllResidency(subjects),
  trials: 12,
  warmup: 3,
});
for (const line of throughput.lost) console.log(`lost: ${line}`);

const report = buildReport({
  mrc,
  throughput,
  emphasize: "koffein",
  meta: {
    title: "koffein benchmark report",
    node: process.version,
    generatedAt: new Date().toISOString(),
    notes:
      `Measured with cache-arena@${ARENA_VERSION} (github.com/destbreso/cache-arena). koffein's default policy ` +
      "is W-TinyLFU; `transitory` is the other npm W-TinyLFU, included for a same-family " +
      "comparison. Workloads are fixed-seed and the reference policies and koffein are seeded, " +
      "so their rows reproduce exactly; transitory has its own unseeded admission coin and may " +
      "vary by a fraction of a point between runs.",
  },
});

await writeFile(join(root, "BENCHMARKS.md"), report.markdown, "utf8");
for (const chart of report.charts) {
  const full = join(root, chart.path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, chart.svg, "utf8");
}

console.log(`Wrote BENCHMARKS.md and ${report.charts.length} charts under ${root}`);
