import { test } from "node:test";
import assert from "node:assert/strict";

const { choosePick } = await import("../src/lib/pick.ts");
const { aiComment, aiEnabled } = await import("../src/lib/aiComment.ts");

const row = (key: string, odd: number, prob: number, sigma = 0.03) => ({
  key, category: "Gol", market: "Alt/Üst 2.5", selection: key, odd, required: 1 / odd, prob, sigma,
  ev: prob * odd - 1, evConservative: (prob - sigma) * odd - 1, edgeChance: 0.5, basis: "test", rating: "Dezavantajlı", dependsOn: null,
});
const analysis = (rows: any[]) => ({ rows, iddaaMargin: 0.158, match: { home: { name: "A" }, away: { name: "B" } } }) as any;

test("avantajlı seçenek varsa güçlü tercih", () => {
  const p = choosePick(analysis([row("a", 2.0, 0.45), row("b", 2.0, 0.58), row("c", 1.8, 0.6)]))!;
  assert.equal(p.row.key, "b");
  assert.equal(p.level, "güçlü");
});

test("yalnız artı getiri varsa zayıf tercih", () => {
  const p = choosePick(analysis([row("a", 2.0, 0.45), row("b", 2.0, 0.51, 0.05)]))!;
  assert.equal(p.row.key, "b");
  assert.equal(p.level, "zayıf");
});

test("hepsi eksi ise değer yok, en az kayıplı gösterilir", () => {
  const p = choosePick(analysis([row("a", 2.0, 0.4), row("b", 2.0, 0.47), row("c", 1.1, 0.95)]))!;
  assert.equal(p.row.key, "b", "1.30 altı oran elenir");
  assert.equal(p.level, "değer yok");
  assert.match(p.reasons.join(" "), /oynamamak/);
});

test("API anahtarı yoksa yapay zeka yorumu atlanır", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(aiEnabled(), false);
  assert.equal(await aiComment(analysis([]), choosePick(analysis([row("a", 2, 0.5)]))!), null);
});
