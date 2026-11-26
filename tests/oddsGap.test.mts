import { test } from "node:test";
import assert from "node:assert/strict";

const { analyze } = await import("../src/lib/model.ts");
const G = await import("../src/lib/oddsGap.ts");

const team = (n: string) => ({ name: n, short: n.slice(0, 3), rank: 0, points: 0, form: [], goalsFor10: [], goalsAgainst10: [], cornersFor: 0, cornersAgainst: 0, cards: 0, missing: [] });
const match = (iddaa: { key: string; odd: number }[], source = "market") =>
  analyze({ id: "t", league: "L", kickoff: new Date(Date.now() + 3600e3).toISOString(), home: team("Ev"), away: team("Dep"), headToHead: [],
    euro: { bookmakers: 1, reference: "Betfair Borsası", h2h: [1.6, 4.4, 5.8], ou25: [1.55, 2.6] }, iddaa, updatedAt: "", warnings: [], source } as any);

test("oran açığı: doğrudan (1X2) ve türetilmiş (1.5 Üst) açık, çizgi açığı", () => {
  const a = match([
    { key: "1x2:1", odd: 1.8 }, // yurt dışı ~%61 → açık
    { key: "1x2:X", odd: 3.5 },
    { key: "1x2:2", odd: 4.5 },
    { key: "ou:1.5:o", odd: 1.65 }, // yüksek gol beklentisi: yurt dışı bu oranı 2.5 Üst'te verir → çizgi açığı
  ]);
  const g = G.gapsFor(a)!;
  const ms = g.rows.find((r) => r.key === "1x2:1")!;
  assert.ok(ms.direct && ms.gap > 0.05, `MS 1 açığı ${ms.gap}`);
  const o15 = g.rows.find((r) => r.key === "ou:1.5:o")!;
  assert.ok(!o15.direct && o15.gap > 0.1, `1.5 Üst açığı ${o15.gap}`);
  assert.equal(o15.line!.equivLine, 2.5);
  assert.ok(G.isLineGap(o15));
  assert.equal(G.scanGaps([a], 0.05)[0].rows[0].key, "ou:1.5:o", "en büyük açık önce");
});

test("yurt dışı oranı olmayan (iddaa / ClubElo) maçlar taranmaz", () => {
  assert.equal(G.gapsFor(match([{ key: "1x2:1", odd: 2 }], "iddaa")), null);
});
