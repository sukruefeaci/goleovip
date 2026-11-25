import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Dosya deposu ve önbellek geçici klasörde
const dir = mkdtempSync(path.join(tmpdir(), "goleo-track-"));
process.chdir(dir);
process.env.CACHE_DIR = path.join(dir, "cache");
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

const T = await import("../src/lib/tracking.ts");

const row = (key: string, category: string, odd: number, prob: number, sigma = 0.03) =>
  ({ key, category, market: "M", selection: key, odd, prob, sigma, confidence: 60, ev: prob * odd - 1, required: 1 / odd }) as any;
const analysis = (id: string, kickoff: string, rows: any[]) =>
  ({
    match: { id, kickoff, league: "L", home: { name: "Arsenal" }, away: { name: "Chelsea" }, fotmob: { matchId: 99 } },
    rows,
    summary: { over25: 0.5, btts: 0.5, topScores: [{ score: "1-1", prob: 0.12 }] },
    model1x2: [0.5, 0.25, 0.25],
  }) as any;

test("ana tercih: oran >= 1.40, olasılık >= %55, korner hariç", () => {
  const a = analysis("x", "2026-11-28T15:00:00Z", [
    row("1x2:1", "Sonuç", 1.3, 0.75),
    row("ou:1.5:o", "Gol", 1.45, 0.72),
    row("btts:y", "Gol", 1.8, 0.56),
    row("cor:9.5:o", "Korner", 1.9, 0.6),
  ]);
  assert.equal(T.mainPick(a)!.key, "ou:1.5:o");
});

test("tercih sonucu: maç sonu, ilk yarı, İY/MS", () => {
  assert.equal(T.pickWon("1x2:1", { hg: 2, ag: 1 }), true);
  assert.equal(T.pickWon("ou:2.5:o", { hg: 1, ag: 1 }), false);
  assert.equal(T.pickWon("ht1x2:X", { hg: 2, ag: 1, hht: 0, aht: 0 }), true);
  assert.equal(T.pickWon("ht1x2:X", { hg: 2, ag: 1 }), null, "ilk yarı skoru yoksa karar yok");
  assert.equal(T.pickWon("htft:X/1", { hg: 2, ag: 1, hht: 0, aht: 0 }), true);
});

test("FotMob ilk yarı skoru (gerçek yapı)", () => {
  const json = { content: { matchFacts: { events: { events: [{ type: "Goal" }, { type: "Half", halfStrShort: "HT", homeScore: 0, awayScore: 1 }, { type: "Half", halfStrShort: "FT", homeScore: 2, awayScore: 1 }] } } } };
  assert.deepEqual(T.parseHalfTime(json), { hht: 0, aht: 1 });
});

test("öğrenme katsayısı: az veriyle küçük, sınırlı", () => {
  const f = T.calibrationFactors({ Gol: { n: 10, hits: 9, pred: 6 }, Sonuç: { n: 500, hits: 200, pred: 300 } });
  assert.ok(f.Gol! > 1 && f.Gol! < 1.1, `Gol ${f.Gol}`);
  assert.equal(f.Sonuç, 0.85, "alt sınır");
});

test("uçtan uca: kayıt → maç biter → sonuçlandırma → öğrenme", async () => {
  const ko = "2026-11-28T15:00:00Z";
  const before = Date.parse("2026-11-28T10:00:00Z");
  await T.recordSnapshots([analysis("arsenal-chelsea-2026-11-28", ko, [row("btts:y", "Gol", 1.7, 0.6)])], before);
  const day = await T.loadDay("2026-11-28");
  assert.equal(day.length, 1);
  assert.equal(day[0].pick!.key, "btts:y");

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ leagues: [{ matches: [{ id: 99, home: { name: "Arsenal", score: 2 }, away: { name: "Chelsea", score: 1 }, status: { utcTime: ko, finished: true } }] }] }),
    )) as typeof fetch;
  const after = Date.parse("2026-11-28T18:00:00Z");
  assert.equal(await T.settleDay("2026-11-28", after), 1);
  const settled = (await T.loadDay("2026-11-28"))[0];
  assert.deepEqual([settled.result!.hg, settled.result!.ag, settled.result!.pickWon], [2, 1, true]);
  const l = await T.getLearning();
  assert.deepEqual(l.Gol, { n: 1, hits: 1, pred: 0.6 });
  assert.equal(await T.settleDay("2026-11-28", after), 0, "iki kez sayılmaz");
  assert.ok((await T.findSnapshot("arsenal-chelsea-2026-11-28"))?.result);
});
