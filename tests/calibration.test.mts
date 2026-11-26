import { test } from "node:test";
import assert from "node:assert/strict";

const C = await import("../src/lib/calibration.ts");

const gen = (pred: number, n: number, rate: number) => Array.from({ length: n }, (_, i) => ({ pred, won: i < Math.round(n * rate) }));

test("veri yoksa olasılık değişmez", () => {
  const m = C.bandMapper(C.fitBins([]));
  assert.equal(m(0.7), 0.7);
});

test("%72 dediği %62 tutuyorsa %72 aşağı çekilir; doğru aralık yerinde kalır", () => {
  const bins = C.fitBins([...gen(0.72, 300, 0.62), ...gen(0.62, 300, 0.62)]);
  const m = C.bandMapper(bins);
  assert.ok(m(0.72) < 0.68 && m(0.72) > 0.6, `düzeltilmiş ${m(0.72)}`);
  assert.ok(Math.abs(m(0.62) - 0.62) < 0.01, `doğru aralık ${m(0.62)}`);
  assert.ok(m(0.72) >= m(0.62), "sıralama korunur");
});

test("az veriyle düzeltme küçük kalır", () => {
  const big = C.bandMapper(C.fitBins(gen(0.72, 300, 0.55)))(0.72);
  const small = C.bandMapper(C.fitBins(gen(0.72, 10, 0.55)))(0.72);
  assert.ok(0.72 - small < 0.72 - big && 0.72 - small < 0.05, `${small} ${big}`);
});

test("kayıtlardan örnekler: düzeltme öncesi olasılık ve yalnız analizli canlı", () => {
  const s = C.samplesFromSnaps([
    { pick: { prob: 0.7, preBand: 0.74 }, oddsPick: { rate: 0.6 }, result: { pickWon: true, oddsWon: false } },
    { pick: { prob: 0.6 }, result: { pickWon: null } },
  ]);
  assert.deepEqual(s.mac, [{ pred: 0.74, won: true }]);
  assert.deepEqual(s.oran, [{ pred: 0.6, won: false }]);
  const l = C.samplesFromLive([
    { prob: 0.7, preBand: 0.75, ctx: { prior: "market" }, result: { won: true } },
    { prob: 0.7, ctx: { prior: "yok" }, result: { won: true } },
  ]);
  assert.deepEqual(l, [{ pred: 0.75, won: true }]);
});
