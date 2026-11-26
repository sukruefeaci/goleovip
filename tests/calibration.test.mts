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
  assert.deepEqual(s.mac.map(({ pred, won }) => ({ pred, won })), [{ pred: 0.74, won: true }]);
  assert.deepEqual(s.oran.map(({ pred, won }) => ({ pred, won })), [{ pred: 0.6, won: false }]);
  const l = C.samplesFromLive([
    { prob: 0.7, preBand: 0.75, ctx: { prior: "market" }, result: { won: true } },
    { prob: 0.7, ctx: { prior: "yok" }, result: { won: true } },
  ]);
  assert.deepEqual(l.map(({ pred, won }) => ({ pred, won })), [{ pred: 0.75, won: true }]);
});

test("tercih yönü: pazar anahtarı ve canlı tanımdan", () => {
  assert.equal(C.segOfKey("ou:2.5:o"), "Üst");
  assert.equal(C.segOfKey("ou:1.5:u"), "Alt");
  assert.equal(C.segOfKey("htou:0.5:o"), "İY Üst");
  assert.equal(C.segOfKey("btts:n"), "KG Yok");
  assert.equal(C.segOfKey("1x2:X"), "Beraberlik");
  assert.equal(C.segOfSpec({ t: "ouFT", over: false }), "Alt");
  assert.equal(C.segOfSpec({ t: "res", out: ["1", "X"] }), "Çifte şans");
  assert.equal(C.oddBand(1.62), "1.50–1.69");
  assert.equal(C.sourceOfId("id-a-b-2026-11-26"), "iddaa");
});

test("boyut düzeltmesi: üstler beklentiden kötü, altlar iyi gidiyorsa ayrı ayrı düzeltilir", () => {
  const mk = (n: number, rate: number, yon: string) =>
    Array.from({ length: n }, (_, i) => ({ pred: 0.6, won: i < Math.round(n * rate), odd: 1.7, attrs: { Yön: yon } }));
  const samples = [...mk(200, 0.5, "Üst"), ...mk(200, 0.7, "Alt")];
  const c = { v: 1 as const, builtAt: "", day: "", sys: { mac: C.fitBins(samples), canli: [], oran: [] }, dims: { mac: C.fitDims(samples), canli: {}, oran: {} } };
  const m = C.makeMapper(c as any, "mac");
  const base = m(0.6);
  assert.ok(m(0.6, { Yön: "Üst" }) < base && m(0.6, { Yön: "Alt" }) > base, `${m(0.6, { Yön: "Üst" })} ${base} ${m(0.6, { Yön: "Alt" })}`);
  assert.ok(m(0.6, { Yön: "Üst" }) >= base * 0.92 - 1e-9, "tek boyut en fazla ±%8");
  assert.equal(m(0.6, { Yön: "Bilinmeyen" }), base, "verisi olmayan değer dokunulmaz");
  const d = C.fitDims(samples);
  assert.equal(d["Yön"]!["Üst"].staked, 200);
  assert.ok(Math.abs(d["Yön"]!["Alt"].ret - 140 * 1.7) < 1e-9);
});
