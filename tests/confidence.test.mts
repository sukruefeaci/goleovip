import { test } from "node:test";
import assert from "node:assert/strict";

const { confidenceFor } = await import("../src/lib/model.ts");

const base = { hasOu25: true, hasCornerMarket: false, pMarket: 0.6, pStats: 0.6, sigma: 0.03, edgeChance: 0.5, games: 20 };

test("ağırlıklar toplamı 1, puan 0–100", () => {
  const c = confidenceFor({ ...base, kind: "ft" });
  assert.ok(Math.abs(c.parts.reduce((a, p) => a + p.weight, 0) - 1) < 1e-9);
  assert.ok(c.score >= 0 && c.score <= 100);
});

test("piyasayla doğrulanan tahmin, yalnız istatistiğe dayanan kornerden daha güvenilir", () => {
  const ft = confidenceFor({ ...base, kind: "ft" });
  const corner = confidenceFor({ ...base, kind: "corners_total", sigma: 0.07 });
  assert.ok(ft.score > corner.score + 15, `${ft.score} > ${corner.score}`);
});

test("kaynaklar ayrışınca ve belirsizlik artınca güven düşer", () => {
  const agree = confidenceFor({ ...base, kind: "ft" });
  const disagree = confidenceFor({ ...base, kind: "ft", pStats: 0.45, sigma: 0.1 });
  assert.ok(disagree.score < agree.score);
});

test("değer kesinliği güveni artırır", () => {
  const lo = confidenceFor({ ...base, kind: "ft", edgeChance: 0.1 });
  const hi = confidenceFor({ ...base, kind: "ft", edgeChance: 0.9 });
  assert.equal(hi.score - lo.score, 20);
});
