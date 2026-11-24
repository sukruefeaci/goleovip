import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseIddaa, outcomeKey } = await import("../src/lib/providers/iddaa.ts");
const { describe } = await import("../src/lib/markets.ts");

const raw = JSON.parse(readFileSync(new URL("./fixtures/iddaa-sample.json", import.meta.url), "utf8"));

test("gerçek iddaa bülteni örneği ayrıştırılır", () => {
  const [ev] = parseIddaa(raw);
  assert.equal(ev.home, "FC Iberia 1999");
  assert.equal(ev.away, "Getafe");
  const k = Object.fromEntries(ev.lines.map((l) => [l.key, l.odd]));
  assert.equal(k["1x2:1"], 6.44);
  assert.equal(k["1x2:X"], 3.95);
  assert.equal(k["1x2:2"], 1.34);
  assert.equal(k["res_ou:2:2.5:o"], 2.31);
  assert.equal(k["res_ou:X:2.5:u"], 4.53);
  assert.equal(k["dc:1X"], 2.37);
  assert.equal(k["dc:X2"], undefined, "1.00 = kapalı seçenek atlanır");
  assert.equal(k["hou:1.5:o"], 5.52);
  assert.ok(ev.lines.length > 20);
  for (const l of ev.lines) assert.doesNotThrow(() => describe(l.key), l.key);
});

test("pazar kodları doğru anahtara çevrilir", () => {
  assert.equal(outcomeKey(88, null, "0"), "ht1x2:X");
  assert.equal(outcomeKey(60, 0.5, "Üst"), "htou:0.5:o");
  assert.equal(outcomeKey(604, 1.5, "Alt"), "aou:1.5:u");
  assert.equal(outcomeKey(48, 9.5, "Üst"), "cor:9.5:o");
  assert.equal(outcomeKey(700, 2.5, "Üst ve Yok"), "ou_btts:2.5:o:n");
  assert.equal(outcomeKey(4, null, "6+ gol"), "tg:6+");
  assert.equal(outcomeKey(36, null, "1"), null, "2. yarı sonucu modelde yok");
  assert.equal(outcomeKey(100, 1, "1"), null, "handikap modelde yok");
  assert.equal(outcomeKey(101, 2, "Üst"), null, "tam sayı çizgi atlanır");
});
