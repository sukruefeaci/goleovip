import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "goleo-live-"));
process.chdir(dir);
process.env.CACHE_DIR = path.join(dir, "cache");
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

const L = await import("../src/lib/liveTracking.ts");

test("canlı öneri sonucu", () => {
  const at = { hg: 1, ag: 0 };
  assert.equal(L.liveWon({ t: "ouFT", line: 1.5, over: true }, at, { hg: 2, ag: 0 }, true), true);
  assert.equal(L.liveWon({ t: "ou1H", line: 0.5, over: true }, at, { hg: 2, ag: 0 }, true), null, "ilk yarı skoru yoksa karar yok");
  assert.equal(L.liveWon({ t: "ou1H", line: 0.5, over: true }, at, { hg: 2, ag: 0, hht: 1, aht: 0 }, true), true);
  assert.equal(L.liveWon({ t: "btts", yes: true }, at, { hg: 1, ag: 1 }, false), true);
  assert.equal(L.liveWon({ t: "res", out: ["1", "X"] }, at, { hg: 1, ag: 2 }, false), false);
  assert.equal(L.liveWon({ t: "next", home: true }, at, { hg: 1, ag: 0 }, undefined), false, "başka gol yoksa sıradaki gol kaybeder");
  assert.equal(L.liveWon({ t: "next", home: false }, at, { hg: 1, ag: 1 }, false), true);
});

test("gol sırası (FotMob olayları)", () => {
  const g = L.parseGoals({ content: { matchFacts: { events: { events: [{ type: "Goal", isHome: false, time: 70 }, { type: "Card" }, { type: "Goal", isHome: true, time: 12 }] } } } });
  assert.deepEqual(g.map((x) => x.home), [true, false]);
});

test("uçtan uca: kayıt (tek sefer) → maç biter → sonuç → öğrenme", async () => {
  const ko = new Date("2026-11-28T15:00:00Z");
  const rec = (label: string, spec: any, prob: number) => ({ label, kind: spec.t === "next" ? "Sıradaki gol" : "MS A/Ü", spec, prob, confidence: 60 }) as any;
  const input = [
    { fotmobId: 7, home: "Arsenal", away: "Chelsea", league: "PL", kickoff: ko, minute: "60'", hg: 1, ag: 0, recs: [rec("MS 1.5 Üst", { t: "ouFT", line: 1.5, over: true }, 0.7), rec("Sıradaki golü ev sahibi atar", { t: "next", home: true }, 0.62)] },
  ];
  const t1 = Date.parse("2026-11-28T16:00:00Z");
  assert.equal(await L.recordLive(input as any, t1), 2);
  assert.equal(await L.recordLive(input as any, t1 + 60_000), 0, "aynı öneri tekrar yazılmaz");

  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("matchDetails"))
      return new Response(JSON.stringify({ content: { matchFacts: { events: { events: [
        { type: "Goal", isHome: true, time: 20 }, { type: "Half", halfStrShort: "HT", homeScore: 1, awayScore: 0 }, { type: "Goal", isHome: false, time: 75 }, { type: "Goal", isHome: true, time: 88 },
      ] } } } }));
    return new Response(JSON.stringify({ leagues: [{ matches: [{ id: 7, home: { name: "Arsenal", score: 2 }, away: { name: "Chelsea", score: 1 }, status: { utcTime: ko.toISOString(), finished: true } }] }] }));
  }) as typeof fetch;

  const date = new Date(t1 + 3 * 3600_000).toISOString().slice(0, 10);
  assert.equal(await L.settleLive(date, Date.parse("2026-11-28T18:00:00Z")), 2);
  const day = await L.loadLiveDay(date);
  const by = Object.fromEntries(day.map((r) => [r.label, r.result!.won]));
  assert.equal(by["MS 1.5 Üst"], true);
  assert.equal(by["Sıradaki golü ev sahibi atar"], false, "1-0'dan sonraki gol deplasmanın");
  const l = await L.getLiveLearning();
  assert.deepEqual(l["MS A/Ü"], { n: 1, hits: 1, pred: 0.7 });
  assert.deepEqual(l["Sıradaki gol"], { n: 1, hits: 0, pred: 0.62 });
  const f = L.liveFactors(l);
  assert.ok(f["MS A/Ü"]! > 1 && f["Sıradaki gol"]! < 1);
});
