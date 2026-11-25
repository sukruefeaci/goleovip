import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseLiveList, parseLiveStats } = await import("../src/lib/liveData.ts");
const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("FotMob günlük listeden yalnız oynanan maçlar (gerçek örnek)", () => {
  const l = parseLiveList(read("fotmob-live-sample.json"));
  assert.equal(l.length, 2, "bitmiş ve başlamamış maç elenir");
  for (const m of l) {
    assert.ok(["1H", "HT", "2H"].includes(m.phase));
    assert.ok(m.minute >= 0 && m.minute <= 120);
  }
});

test("FotMob maç istatistikleri (gerçek örnek)", () => {
  const s = parseLiveStats(read("fotmob-stats-sample.json"));
  assert.deepEqual(s.xg, [1.22, 0.33]);
  assert.deepEqual(s.shots, [9, 5]);
  assert.deepEqual(s.sot, [2, 0]);
  assert.deepEqual(s.corners, [4, 0]);
  assert.deepEqual(s.poss, [66, 34]);
  assert.deepEqual(s.red, [0, 0]);
});

test("istatistik yoksa boş", () => {
  assert.deepEqual(Object.values(parseLiveStats({})).filter(Boolean), []);
});
