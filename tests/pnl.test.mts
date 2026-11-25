import { test } from "node:test";
import assert from "node:assert/strict";

const { dayPnl, sumPnl, macItems, oranItems, canliItems } = await import("../src/lib/pnl.ts");

test("100 TL ile günlük kâr/zarar", () => {
  const d = dayPnl([
    { odd: 1.8, won: true }, // +80
    { odd: 1.5, won: false }, // −100
    { odd: 2.0, won: true }, // +100
    { odd: 1.6, won: undefined }, // sonuçlanmadı
    { won: true }, // oranı yok → hesaba girmez
  ]);
  assert.equal(d.shared, 5);
  assert.equal(d.settled, 4);
  assert.equal(d.hits, 3);
  assert.equal(d.counted, 3);
  assert.equal(d.noOdds, 1);
  assert.equal(d.staked, 300);
  assert.equal(d.returned, 380);
  assert.equal(d.profit, 80);
  const t = sumPnl([d, dayPnl([{ odd: 1.45, won: false }])]);
  assert.equal(t.staked, 400);
  assert.equal(t.profit, -20);
});

test("kayıtlardan kalemler", () => {
  const snap = [
    { pick: { odd: 1.7 }, oddsPick: { odd: 1.9 }, result: { pickWon: true, oddsWon: false } },
    { pick: null, result: { pickWon: null } },
    { pick: { odd: 1.5 }, oddsPick: { odd: 2.1 } },
  ];
  assert.deepEqual(macItems(snap), [
    { odd: 1.7, won: true },
    { odd: 1.5, won: undefined },
  ]);
  assert.deepEqual(oranItems(snap), [
    { odd: 1.9, won: false },
    { odd: 2.1, won: undefined },
  ]);
  assert.deepEqual(canliItems([{ odd: 1.6, result: { won: true } }, {}]), [
    { odd: 1.6, won: true },
    { odd: undefined, won: undefined },
  ]);
});
