import { test } from "node:test";
import assert from "node:assert/strict";

const { tierOf } = await import("../src/lib/showRule.ts");
const { oddsConfidence } = await import("../src/lib/oddsPicks.ts");

test("gösterim kuralı: oran ≥ 1.50, güven ≥ %60, %70+ güçlü", () => {
  assert.equal(tierOf(1.5, 70), "guclu");
  assert.equal(tierOf(1.8, 65), "orta");
  assert.equal(tierOf(1.49, 90), null, "oran 1.50 altı gösterilmez");
  assert.equal(tierOf(1.7, 59), null, "güven %60 altı gösterilmez");
  assert.equal(tierOf(undefined, 80), null, "oransız gösterilmez");
});

test("Oranlar güveni: geçmiş oran adil olasılığı ne kadar kesin aşıyor", () => {
  assert.equal(oddsConfidence({ rate: 0.55, fair: 0.55, n: 400 }), 50, "fark yoksa %50");
  const a = oddsConfidence({ rate: 0.58, fair: 0.55, n: 412 });
  const b = oddsConfidence({ rate: 0.62, fair: 0.55, n: 412 });
  assert.ok(a > 55 && a < 70 && b > 70, `${a} ${b}`);
  assert.ok(oddsConfidence({ rate: 0.62, fair: 0.55, n: 150 }) < b, "az örnekte güven düşer");
  assert.ok(oddsConfidence({ rate: 0.45, fair: 0.55, n: 400 }) < 30, "geçmiş oranın altındaysa düşük");
});
