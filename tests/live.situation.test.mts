import { test } from "node:test";
import assert from "node:assert/strict";

const T = await import("../src/lib/liveTracking.ts");
const { calibrateLive, liveModel } = await import("../src/lib/liveModel.ts");

test("eski kayıtlarda durum dakika etiketinden çıkarılır", () => {
  assert.deepEqual(T.ctxOf({ minute: "İY" }), { phase: "HT", min: 45 });
  assert.deepEqual(T.ctxOf({ minute: "45+2'" }), { phase: "1H", min: 47 });
  assert.deepEqual(T.ctxOf({ minute: "67'" }), { phase: "2H", min: 67 });
  const sit = T.situationOf({ phase: "2H", min: 80, tempo: "Yüksek", data: "xG", prior: "market" }, 2, 0);
  assert.deepEqual(sit, [
    ["Süre", "76+ dk"],
    ["Skor", "2+ gol fark"],
    ["Tempo", "Yüksek"],
    ["Canlı veri", "xG var"],
    ["Maç öncesi", "oranlı analiz"],
  ]);
});

test("bir durumda tür genelinden iyi tutan öneriler yükseltilir, kötü tutanlar düşürülür", () => {
  const l = { "İY A/Ü": { n: 100, hits: 70, pred: 70 } };
  const s = {
    v: 1 as const,
    b: {
      "İY A/Ü|Tempo|Yüksek": { n: 40, hits: 36, pred: 28 }, // %90 tuttu, %70 beklendi
      "İY A/Ü|Tempo|Düşük": { n: 40, hits: 20, pred: 28 }, // %50 tuttu
    },
  };
  const hot = T.situationAdjust("İY A/Ü", [["Tempo", "Yüksek"]], l, s);
  const cold = T.situationAdjust("İY A/Ü", [["Tempo", "Düşük"]], l, s);
  const none = T.situationAdjust("İY A/Ü", [["Tempo", "Normal"]], l, s);
  assert.ok(hot > 1.05 && hot <= 1.1, `yüksek tempo ${hot}`);
  assert.ok(cold < 0.95 && cold >= 0.9, `düşük tempo ${cold}`);
  assert.equal(none, 1);
  // az örnekte düzeltme küçük kalır
  const few = T.situationAdjust("İY A/Ü", [["Tempo", "Yüksek"]], l, { v: 1, b: { "İY A/Ü|Tempo|Yüksek": { n: 4, hits: 4, pred: 2.8 } } });
  assert.ok(few < 1.04);
  // satırlar en büyük düzeltmeden başlar
  const rows = T.situationRows(l, s);
  assert.equal(rows.length, 2);
});

test("düzeltme ham olasılığa uygulanır, tekrar uygulamak katlamaz", () => {
  const st = { minute: 20, phase: "1H" as const, hg: 0, ag: 0, stats: {} };
  const o = liveModel(st, null, false);
  const before = o.probs[0].prob;
  calibrateLive(o, () => 1.1);
  calibrateLive(o, () => 1.1);
  assert.equal(o.probs[0].raw, before);
  assert.ok(Math.abs(o.probs[0].prob - Math.min(0.99, before * 1.1)) < 1e-9);
});

test("Telegram: oranı olmayan ya da 1.45 altı öneri paylaşılmaz", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "deneme";
  process.env.TELEGRAM_CHAT_ID = "@deneme";
  const { shareLivePicks } = await import("../src/lib/telegram.ts");
  const calls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: string) => (calls.push(String(u)), new Response('{"ok":true}'))) as typeof fetch;
  const base = { fotmobId: 9, league: "L", home: "A", away: "B", hg: 0, ag: 0, minute: "45'", tempo: "Düşük", stats: {} };
  const rec = (label: string, odd?: number) => ({ label, prob: 0.68, confidence: 72, kind: "MS A/Ü" as const, spec: { t: "ouFT" as const, line: 0.5, over: true }, odd });
  // veritabanı yoksa hiçbir şey gönderilmez; burada yalnız filtreyi doğrularız
  const n = await shareLivePicks([{ ...base, rec: rec("oransız") }, { ...base, rec: rec("düşük", 1.3) }]);
  globalThis.fetch = orig;
  assert.equal(n, 0);
  assert.equal(calls.length, 0);
});

test("maç sürerken kesinleşen tercihler erken sonuçlanır", () => {
  const at = { hg: 0, ag: 0 };
  // İY 0.5 Alt: devre arası skoru 0-0 → tuttu (maç bitmeden)
  assert.equal(T.earlyWon({ t: "ou1H", line: 0.5, over: false }, at, { hg: 0, ag: 0, hht: 0, aht: 0 }, undefined), true);
  // devre arası gelmediyse belli değil
  assert.equal(T.earlyWon({ t: "ou1H", line: 0.5, over: false }, at, { hg: 0, ag: 0 }, undefined), undefined);
  // MS 1.5 Üst: 2 gol oldu → tuttu; MS 1.5 Alt → yattı
  assert.equal(T.earlyWon({ t: "ouFT", line: 1.5, over: true }, at, { hg: 1, ag: 1 }, undefined), true);
  assert.equal(T.earlyWon({ t: "ouFT", line: 1.5, over: false }, at, { hg: 2, ag: 0 }, undefined), false);
  assert.equal(T.earlyWon({ t: "ouFT", line: 2.5, over: true }, at, { hg: 1, ag: 1 }, undefined), undefined);
  // KG Var: iki takım da attı
  assert.equal(T.earlyWon({ t: "btts", yes: true }, at, { hg: 1, ag: 1 }, undefined), true);
  // Sıradaki gol: öneriden sonra ev sahibi attı
  assert.equal(T.earlyWon({ t: "next", home: true }, at, { hg: 1, ag: 0 }, true), true);
  // Sonuç tercihleri maç sonunu bekler
  assert.equal(T.earlyWon({ t: "res", out: ["1"] }, at, { hg: 3, ag: 0 }, undefined), undefined);
});
