import { test } from "node:test";
import assert from "node:assert/strict";

const { htftDistribution, HTFT_OUTCOMES, describe } = await import("../src/lib/markets.ts");
const { outcomeKey } = await import("../src/lib/providers/iddaa.ts");
const { mapMarket } = await import("../src/lib/providers/nesine.ts");
const { teamFromResults, standings } = await import("../src/lib/providers/footballData.ts");

test("İY/MS olasılıkları toplamı 1, favori için 1/1 en olası", () => {
  const d = htftDistribution(2.2, 0.7, 0.45, 0.45);
  const total = HTFT_OUTCOMES.reduce((s, k) => s + d[k], 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const best = HTFT_OUTCOMES.reduce((a, b) => (d[a] > d[b] ? a : b));
  assert.equal(best, "1/1");
  assert.ok(d["2/1"] < 0.05, "geriden gelme nadir");
});

test("ilk yarı payı yükselince ilk yarıda önde olma ihtimali artar", () => {
  const early = htftDistribution(1.6, 1.0, 0.55, 0.45);
  const late = htftDistribution(1.6, 1.0, 0.35, 0.45);
  const lead = (d: Record<string, number>) => d["1/1"] + d["1/X"] + d["1/2"];
  assert.ok(lead(early) > lead(late));
});

test("İY/MS oranları iddaa ve Nesine'den eşlenir", () => {
  assert.equal(outcomeKey(90, null, "1/0"), "htft:1/X");
  assert.equal(outcomeKey(90, null, "0/2"), "htft:X/2");
  assert.equal(describe("htft:2/1").category, "İY/MS");
  const lines = mapMarket({ MTID: 5, OCA: Array.from({ length: 9 }, (_, i) => ({ N: i + 1, O: 2 + i })) })!;
  assert.equal(lines.find((l) => l.key === "htft:X/X")?.odd, 6);
});

test("geçmiş maçlardan ilk yarı payı ve İY/MS geçmişi", () => {
  const m = (h: string, a: string, hg: number, ag: number, hht: number, aht: number, day: number) => ({
    date: new Date(Date.UTC(2026, 8, day)), home: h, away: a, hg, ag, hht, aht, hc: 5, ac: 4, hCards: 2, aCards: 2,
  });
  const res = [m("A", "B", 2, 0, 2, 0, 1), m("C", "A", 1, 1, 1, 0, 2), m("A", "D", 1, 2, 0, 0, 3)];
  const t = teamFromResults("A", "A", res as any, standings(res as any));
  assert.deepEqual(t.htftHistory, ["G/G", "M/B", "B/M"]);
  assert.equal(t.halfShareFor!.goals, 4);
  assert.equal(t.halfShareFor!.share, 2 / 4);
});
