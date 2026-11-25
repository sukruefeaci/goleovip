import { test } from "node:test";
import assert from "node:assert/strict";

const { buildCoupon, couponText } = await import("../src/lib/coupon.ts");

const now = Date.UTC(2026, 10, 25, 12);
const future = new Date(now + 3600_000).toISOString();
const opt = (key: string, odd: number, prob: number, mbc = 1, sigma = 0.03) => ({ key, market: "M", selection: key, category: "Gol", odd, prob, sigma, ev: prob * odd - 1, mbc });
const match = (id: string, options: any[], kickoff = future) => ({ id, home: `${id}H`, away: `${id}A`, league: "L", kickoff, options });

const matches = [
  match("a", [opt("a1", 1.25, 0.82), opt("a2", 1.9, 0.5)]),
  match("b", [opt("b1", 1.3, 0.75), opt("b2", 1.2, 0.86, 3)]),
  match("c", [opt("c1", 1.5, 0.62)]),
  match("d", [opt("d1", 1.22, 0.8)], new Date(now - 60_000).toISOString()),
];

test("her maçtan bir seçenek, en yüksek olasılıklılar", () => {
  const r = buildCoupon(matches, { legs: 2, stake: 100, mode: "guvenli", minOdd: 1.2, excluded: [], now });
  assert.ok(r.coupon);
  const keys = r.coupon!.legs.map((l) => l.pick.key).sort();
  assert.deepEqual(keys, ["a1", "b1"], "MBS 3'lü b2, 2 maçlık kuponda kullanılamaz; başlamış d alınmaz");
  assert.equal(new Set(r.coupon!.legs.map((l) => l.match.id)).size, 2);
  assert.ok(Math.abs(r.coupon!.totalOdd - 1.25 * 1.3) < 1e-9);
  assert.ok(Math.abs(r.coupon!.winProb - 0.82 * 0.75) < 1e-9);
  assert.ok(Math.abs(r.coupon!.payout - 100 * 1.625) < 1e-9);
});

test("MBS 3 seçenek 3 maçlık kuponda kullanılabilir", () => {
  const r = buildCoupon(matches, { legs: 3, stake: 50, mode: "guvenli", minOdd: 1.2, excluded: [], now });
  assert.ok(r.coupon!.legs.some((l) => l.pick.key === "b2"));
});

test("yeterli maç yoksa açıklayıcı mesaj", () => {
  const r = buildCoupon(matches, { legs: 5, stake: 50, mode: "guvenli", minOdd: 1.2, excluded: [], now });
  assert.equal(r.coupon, null);
  assert.equal(r.available, 3);
  assert.match(r.message!, /yalnız 3 maç/);
});

test("değiştirilen maç kupondan çıkar", () => {
  const r = buildCoupon(matches, { legs: 2, stake: 50, mode: "guvenli", minOdd: 1.2, excluded: ["a"], now });
  assert.ok(!r.coupon!.legs.some((l) => l.match.id === "a"));
});

test("kupon metni", () => {
  const r = buildCoupon(matches, { legs: 2, stake: 100, mode: "guvenli", minOdd: 1.2, excluded: [], now });
  assert.match(couponText(r.coupon!, 100), /Toplam oran: 1\.63/);
});

test("banko: yalnız maç sonucu/gol/ilk yarı, en az 1.25 oran, farklı maçlar", async () => {
  const { bankoPicks } = await import("../src/lib/coupon.ts");
  const ms = [
    match("k", [{ ...opt("kor", 1.3, 0.95), category: "Korner" }, opt("k1", 1.2, 0.9)]),
    match("x", [opt("x1", 1.3, 0.8), opt("x2", 1.28, 0.78)]),
    match("y", [opt("y1", 1.4, 0.7)]),
    match("z", [opt("z1", 1.26, 0.74, 3)]),
  ];
  const r = bankoPicks(ms, 2, now);
  const keys = r.coupon!.legs.map((l) => l.pick.key).sort();
  assert.deepEqual(keys, ["x1", "y1"], "korner ve 1.25 altı elenir; MBS 3 ikiliye girmez; maç başına bir tercih");
});
