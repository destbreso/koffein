// Load what ships, not what compiles.
//
//   npm run verify:dist
//
// No test in this repo imports from dist/, so the ESM build, the CJS build and
// the type declarations were never exercised by anything before a publish:
// `prepublishOnly` built them and sent them. A bundler misconfiguration is
// invisible to a suite that only ever reads src.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const failures = [];
const ok = (what) => console.log(`  ok    ${what}`);
const bad = (what, detail) => {
  failures.push(what);
  console.log(`  FAIL  ${what}\n        ${detail}`);
};

/** Storing, returning, missing and evicting: the four things a cache is. */
function exercise(label, { Cache, WTinyLFU }) {
  if (typeof Cache !== "function") return bad(`${label} exports Cache`, "not a constructor");
  if (typeof WTinyLFU !== "function") return bad(`${label} exports WTinyLFU`, "not a constructor");

  const cache = new Cache(64);
  if (cache.get("nothing") !== undefined) return bad(`${label} misses on an absent key`, "returned a value");
  cache.set("a", 1);
  if (cache.get("a") !== 1) return bad(`${label} returns what it stored`, `got ${cache.get("a")}`);
  for (let i = 0; i < 5_000; i++) cache.set(i, i);
  if (cache.stats().size > 64) return bad(`${label} stays within capacity`, `held ${cache.stats().size} of 64`);
  ok(`${label} stores, returns, misses and evicts`);
}

console.log("loading the built artifacts\n");

for (const [label, entry] of [
  ["esm", "dist/index.js"],
  ["cjs", "dist/index.cjs"],
]) {
  const path = join(root, entry);
  if (!existsSync(path)) {
    bad(`${entry} exists`, "build first");
    continue;
  }
  try {
    exercise(label, label === "cjs" ? require(path) : await import(path));
  } catch (err) {
    bad(`${entry} loads`, err.message);
  }
}

for (const types of ["dist/index.d.ts", "dist/index.d.cts"]) {
  if (existsSync(join(root, types))) ok(`${types} ships`);
  else bad(`${types} ships`, "missing from the build output");
}

console.log(
  failures.length === 0
    ? "\nthe built artifacts load and behave. Safe to publish."
    : `\n${failures.length} check(s) failed. Do not publish this build.`,
);
process.exit(failures.length === 0 ? 0 : 1);
