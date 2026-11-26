import { test } from "node:test";
import assert from "node:assert/strict";

const { tierOf } = await import("../src/lib/showRule.ts");
const { oddsConfidence } = await import("../src/lib/oddsPicks.ts");

test("gösterim kuralı: oran ≥ 1.50, kazanma olasılığı ≥ %60, %70+ güçlü", () => {
  assert.equal(tierOf(1.5, 0.7), "guclu");
  assert.equal(tierOf(1.8, 0.65), "orta");
  assert.equal(tierOf(1.49, 0.9), null, "oran 1.50 altı gösterilmez");
  assert.equal(tierOf(1.7, 0.59), null, "olasılık %60 altı gösterilmez");
  assert.equal(tierOf(undefined, 0.8), null, "oransız gösterilmez");
});

test("Oranlar güveni: geçmiş oran adil olasılığı ne kadar kesin aşıyor", () => {
  assert.equal(oddsConfidence({ rate: 0.55, fair: 0.55, n: 400 }), 50, "fark yoksa %50");
  const a = oddsConfidence({ rate: 0.58, fair: 0.55, n: 412 });
  const b = oddsConfidence({ rate: 0.62, fair: 0.55, n: 412 });
  assert.ok(a > 55 && a < 70 && b > 70, `${a} ${b}`);
  assert.ok(oddsConfidence({ rate: 0.62, fair: 0.55, n: 150 }) < b, "az örnekte güven düşer");
  assert.ok(oddsConfidence({ rate: 0.45, fair: 0.55, n: 400 }) < 30, "geçmiş oranın altındaysa düşük");
});

test("üçlü onay: canlı tercih → maç öncesi pazar anahtarı", async () => {
  const { specKey } = await import("../src/lib/consensus.ts");
  assert.equal(specKey({ t: "ouFT", line: 2.5, over: true }), "ou:2.5:o");
  assert.equal(specKey({ t: "ou1H", line: 0.5, over: false }), "htou:0.5:u");
  assert.equal(specKey({ t: "btts", yes: true }), "btts:y");
  assert.equal(specKey({ t: "res", out: ["2"] }), "1x2:2");
  assert.equal(specKey({ t: "res", out: ["X", "1"] }), "dc:1X");
  assert.equal(specKey({ t: "res", out: ["X", "2"] }), "dc:X2");
  assert.equal(specKey({ t: "next", home: true }), null);
});
