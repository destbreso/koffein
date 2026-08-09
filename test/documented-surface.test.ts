// Two things the README documents, exports, and sells, that nothing tested.
//
// `hash` is the escape hatch that makes object keys usable at all: without one,
// the default hashes through String(key), every plain object collapses onto
// "[object Object]", and the admission control this cache exists for stops
// working. `IntrusiveList` is a public export advertised as "handy when writing
// your own". A documented promise that no test touches is a promise the next
// refactor is free to break.

import { describe, expect, it } from "vitest";
import { Cache, WTinyLFU, IntrusiveList } from "../src/index";
import { Node } from "../src/list";

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

describe("the hash option, which object keys need", () => {
  type Key = { tenant: string; id: number };
  const hot: Key = { tenant: "acme", id: 1 };

  const survivesAScan = (cache: Cache<Key, string>): boolean => {
    cache.set(hot, "hot");
    for (let i = 0; i < 50; i++) cache.get(hot);
    // A sweep of keys nobody will ask for again. Admission control is supposed
    // to refuse them entry over a key with fifty recorded uses.
    for (let i = 0; i < 200; i++) cache.set({ tenant: "scan", id: i }, "cold");
    return cache.get(hot) !== undefined;
  };

  it("keeps a hot object key through a scan when the hash reads the content", () => {
    const cache = new Cache<Key, string>(32, {
      policy: new WTinyLFU<Key, string>({ hash: (k) => fnv1a(`${k.tenant}:${k.id}`) }),
    });
    expect(survivesAScan(cache)).toBe(true);
  });

  it("documents the trap: without one, every object key shares a counter", () => {
    // Not a wish, a fact about the default, pinned so it cannot change quietly
    // and so the README's warning has something behind it.
    const cache = new Cache<Key, string>(32);
    expect(survivesAScan(cache)).toBe(false);
  });

  it("leaves string keys unaffected, which is why the trap is easy to miss", () => {
    const cache = new Cache<string, string>(32);
    cache.set("hot", "hot");
    for (let i = 0; i < 50; i++) cache.get("hot");
    for (let i = 0; i < 200; i++) cache.set(`scan:${i}`, "cold");
    expect(cache.get("hot")).toBe("hot");
  });
});

describe("IntrusiveList, a public export", () => {
  it("keeps most-recently-used at the head and evicts from the tail", () => {
    const list = new IntrusiveList<string, number>();
    const a = new Node("a", 1);
    const b = new Node("b", 2);
    const c = new Node("c", 3);

    list.pushHead(a);
    list.pushHead(b);
    list.pushHead(c);
    expect(list.size).toBe(3);
    expect(list.head).toBe(c);
    expect(list.tail).toBe(a);

    // A use moves a node to the head, so it is no longer the eviction candidate.
    list.moveToHead(a);
    expect(list.head).toBe(a);
    expect(list.tail).toBe(b);

    expect(list.popTail()).toBe(b);
    expect(list.size).toBe(2);

    list.remove(c);
    expect(list.size).toBe(1);
    expect(list.head).toBe(a);
    expect(list.tail).toBe(a);

    expect(list.popTail()).toBe(a);
    expect(list.popTail()).toBeNull();
    expect(list.size).toBe(0);
  });

  it("moving the head is a no-op rather than a corruption", () => {
    const list = new IntrusiveList<string, number>();
    const a = new Node("a", 1);
    const b = new Node("b", 2);
    list.pushHead(a);
    list.pushHead(b);
    list.moveToHead(b);
    expect(list.head).toBe(b);
    expect(list.tail).toBe(a);
    expect(list.size).toBe(2);
  });
});
