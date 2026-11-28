import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMatchStats, pickWon } from "../src/lib/tracking.ts";

const details = {
  content: { stats: { Periods: { All: { stats: [{ stats: [{ title: "Corners", stats: [5, 2] }, { title: "Yellow cards", stats: [1, 2] }, { title: "Red cards", stats: [0, 1] }] }] } } } },
};

test("FotMob istatistiğinden korner ve kart", () => {
  assert.deepEqual(parseMatchStats(details), { hc: 5, ac: 2, cards: 4 });
  assert.equal(parseMatchStats({}), null);
});

test("korner ve kart tercihleri sonuçlanır", () => {
  const r = { hg: 3, ag: 2, hht: 1, aht: 1, hc: 5, ac: 2, cards: 4 };
  assert.equal(pickWon("cor:6.5:o", r), true);
  assert.equal(pickWon("cor:7.5:o", r), false);
  assert.equal(pickWon("hcor:4.5:o", r), true);
  assert.equal(pickWon("acor:2.5:u", r), true);
  assert.equal(pickWon("card:3.5:o", r), true);
  // istatistik yoksa belirsiz
  assert.equal(pickWon("cor:6.5:o", { hg: 1, ag: 0 }), null);
});
