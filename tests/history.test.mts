import { test } from "node:test";
import assert from "node:assert/strict";

const { parseHistory, findSimilar, outcomeStats, distance } = await import("../src/lib/history.ts");

const CSV = [
  "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,AvgH,AvgD,AvgA,Avg>2.5,Avg<2.5",
  "T1,21/11/2026,17:00,Galatasaray,Samsunspor,2,1,H,1,0,1.22,6.35,9.67,1.32,3.30",
  "T1,21/11/2026,20:00,Kocaelispor,Fenerbahce,2,2,D,0,0,5.31,4.15,1.52,1.66,2.20",
  "T1,22/11/2026,20:00,Konyaspor,Besiktas,2,4,A,1,2,4.84,3.89,1.60,1.67,2.18",
  "T1,22/11/2026,20:00,Bozuk,Satir,,,,,,1.5,3,6,,",
].join("\n");

test("geçmiş maç dosyası: oranlar, adil olasılık, skor; oynanmamış satır atlanır", () => {
  const h = parseHistory(CSV, "Süper Lig");
  assert.equal(h.length, 3);
  assert.deepEqual(h[0].odds, [1.22, 6.35, 9.67]);
  assert.ok(Math.abs(h[0].p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(h[1].hht, 0);
  assert.ok(h[0].pOver! > 0.6);
});

test("benzer oranlı maçlar ve kazanan tercih sayımı", () => {
  const h = parseHistory(CSV, "Süper Lig");
  // Fenerbahçe ve Beşiktaş deplasman favorisi maçlarına benzer hedef
  const sim = findSimilar(h, h[2].p, 0.05);
  assert.deepEqual(sim.map((m) => m.home).sort(), ["Kocaelispor", "Konyaspor"]);
  assert.ok(distance(sim[0].p, h[2].p) <= distance(sim[1].p, h[2].p));
  const st = Object.fromEntries(outcomeStats(sim).map((s) => [s.key, s]));
  assert.equal(st["1x2:2"].hits, 1);
  assert.equal(st["1x2:X"].hits, 1);
  assert.equal(st["ou:2.5:o"].hits, 2);
  assert.equal(st["btts:y"].hits, 2);
  assert.equal(st["htft:X/X"].hits, 1);
});
