import { test } from "node:test";
import assert from "node:assert/strict";

const { negBinOver, poissonOver } = await import("../src/lib/poisson.ts");
const { buildContext, describe, probability } = await import("../src/lib/markets.ts");

test("negatif binom, ayar betiğiyle (Python) aynı sonucu verir", () => {
  assert.ok(Math.abs(negBinOver(9.5, 9.0, 30) - 0.41183490495900077) < 1e-12);
  assert.ok(Math.abs(negBinOver(4.5, 5.2, 12) - 0.5582077267746441) < 1e-12);
});

test("k çok büyükken Poisson'a eşittir", () => {
  assert.ok(Math.abs(negBinOver(9.5, 10, 1e7) - poissonOver(9.5, 10)) < 1e-9);
  assert.ok(Math.abs(negBinOver(9.5, 10, 1e5) - poissonOver(9.5, 10)) < 1e-3);
});

test("oynaklık uçlardaki aşırı güveni azaltır", () => {
  // beklenti 8 kornerken "9.5 Alt" Poisson'da daha yüksek, negatif binomda daha temkinli çıkar
  const ctx = buildContext(1.5, 1.1, 4, 4, 4);
  const under = probability(describe("cor:9.5:u"), ctx);
  const poissonUnder = 1 - poissonOver(9.5, 8);
  assert.ok(under < poissonUnder, `${under} < ${poissonUnder}`);
  // ortadaki çizgide fark küçük
  const mid = probability(describe("cor:7.5:o"), ctx);
  assert.ok(Math.abs(mid - poissonOver(7.5, 8)) < 0.03);
});
