import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseLiveProgram, mapLiveOdds, matchIddaaLive } = await import("../src/lib/providers/iddaaLive.ts");
const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("canlı program: yalnız oynanan maçlar ve canlı skor (gerçek örnek)", () => {
  const p = parseLiveProgram(read("iddaa-live-program.json"));
  assert.equal(p.length, 3, "başlamamış maç elenir");
  assert.ok(p.every((e) => e.hg !== null && e.ag !== null));
});

test("canlı oran eşleme: 0-0 ilk yarı (FC Nasaf)", () => {
  const o = mapLiveOdds(read("iddaa-live-event-3324301.json"), 0);
  assert.equal(o["MS 1"], 1.81);
  assert.equal(o["MS X"], 2.42);
  assert.equal(o["Çifte şans X2"], 1.43);
  assert.equal(o["Çifte şans 1X"], undefined, "1.00 kapalı oran alınmaz");
  assert.equal(o["İY 0.5 Üst"], 2.03);
  assert.equal(o["MS 1.5 Üst"], 1.53);
  assert.equal(o["KG Var"], 2.32);
  assert.equal(o["Sıradaki golü ev sahibi atar"], 1.59);
});

test("canlı oran eşleme: 0-2 ikinci yarı (Maroons) — çizgiler skora göre", () => {
  const o = mapLiveOdds(read("iddaa-live-event-3426303.json"), 2);
  assert.equal(o["MS 2.5 Üst"], 1.19);
  assert.equal(o["Sıradaki golü deplasman atar"], 2.21, "3. gol pazarı");
  assert.equal(mapLiveOdds(read("iddaa-live-event-3426303.json"), 1)["Sıradaki golü deplasman atar"], undefined, "gol sayısı tutmazsa alınmaz");
});

test("FotMob–iddaa canlı eşleştirme: skor farklıysa eşleşmez", () => {
  const ev = [{ id: 1, home: "Fenerbahçe", away: "Beşiktaş", kickoff: new Date("2026-11-28T17:00:00Z"), hg: 1, ag: 0 }];
  const fm = { home: "Fenerbahce", away: "Besiktas", kickoff: new Date("2026-11-28T17:00:00Z"), hg: 1, ag: 0 };
  assert.equal(matchIddaaLive(fm, ev)?.id, 1);
  assert.equal(matchIddaaLive({ ...fm, hg: 2 }, ev), null);
});
