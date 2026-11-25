import { test } from "node:test";
import assert from "node:assert/strict";

const { liveModel, liveRecommendations } = await import("../src/lib/liveModel.ts");

const prior = { lh: 1.6, la: 1.0, shareH: 0.45, shareA: 0.45, source: "market" as const };
const st = (o: any) => ({ minute: 20, phase: "1H", hg: 0, ag: 0, stats: {}, ...o });

test("zaman geçtikçe gol olasılığı düşer", () => {
  const early = liveModel(st({ minute: 10 }), prior, true);
  const late = liveModel(st({ minute: 75, phase: "2H" }), prior, true);
  const p = (o: any, l: string) => o.probs.find((x: any) => x.label === l)!.prob;
  assert.ok(p(early, "MS 0.5 Üst") > p(late, "MS 0.5 Üst"));
});

test("yüksek tempo (xG) gol olasılığını artırır", () => {
  const calm = liveModel(st({ minute: 30, stats: { xg: [0.1, 0.05] } }), prior, true);
  const hot = liveModel(st({ minute: 30, stats: { xg: [1.4, 0.9] } }), prior, true);
  const p = (o: any) => o.probs.find((x: any) => x.label === "İY 0.5 Üst")!.prob;
  assert.ok(p(hot) > p(calm));
  assert.equal(hot.tempo.label, "Yüksek");
  assert.equal(calm.tempo.label, "Düşük");
});

test("geride olan takım ikinci yarıda daha çok atar; takıma özel tepki kullanılır", () => {
  const sh = (trailGf: number) => ({ lead: { n: 10, gf: 6, ga: 5 }, level: { n: 10, gf: 8, ga: 7 }, trail: { n: 10, gf: trailGf, ga: 6 }, all: { n: 30, gf: 24, ga: 18 } });
  const base = liveModel(st({ minute: 55, phase: "2H", hg: 0, ag: 1 }), { ...prior, homeSH: sh(8) }, true);
  const fighter = liveModel(st({ minute: 55, phase: "2H", hg: 0, ag: 1 }), { ...prior, homeSH: sh(18) }, true);
  assert.ok(fighter.remaining.h2 > base.remaining.h2, "geride kalınca çok gol atan takım");
  assert.ok(base.reaction!.home > 1, "geride: genel artış");
});

test("olasılıklar tutarlı ve öneriler %60–96 aralığında", () => {
  const o = liveModel(st({ minute: 62, phase: "2H", hg: 1, ag: 0, stats: { shots: [9, 4], sot: [4, 1] } }), prior, true);
  const p = (l: string) => o.probs.find((x) => x.label === l)!.prob;
  assert.ok(Math.abs(p("MS 1") + p("MS X") + p("MS 2") - 1) < 1e-6);
  assert.ok(Math.abs(p("MS 1.5 Üst") + p("MS 1.5 Alt") - 1) < 1e-9);
  for (const r of liveRecommendations(o)) assert.ok(r.prob >= 0.6 && r.prob <= 0.96);
  assert.ok(o.confidence > liveModel(st({ minute: 62, phase: "2H", hg: 1, ag: 0 }), null, false).confidence, "veri arttıkça güven artar");
});
