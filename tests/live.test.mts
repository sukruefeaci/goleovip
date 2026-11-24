import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "goleo-cache-"));

const { mapMarket, parseNesine } = await import("../src/lib/providers/nesine.ts");
const { parseFixtures, parseResults, ukToUtc, parseDate } = await import("../src/lib/providers/footballData.ts");
const { nameSimilarity } = await import("../src/lib/providers/teamNames.ts");
const { liveProvider } = await import("../src/lib/providers/live.ts");
const { analyze } = await import("../src/lib/model.ts");

// Bugünden 2 gün sonra (fixtures.csv İngiltere saatiyle)
const ko = new Date(Date.now() + 2 * 86400_000);
const dd = `${String(ko.getUTCDate()).padStart(2, "0")}/${String(ko.getUTCMonth() + 1).padStart(2, "0")}/${ko.getUTCFullYear()}`;
const koUtc = ukToUtc(parseDate(dd)!, "17:00");

const FIXTURES = [
  "Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,PSH,PSD,PSA,AvgH,AvgD,AvgA,P>2.5,P<2.5,Avg>2.5,Avg<2.5",
  `T1,${dd},17:00,Fenerbahce,Besiktas,1.80,3.80,4.20,1.83,3.90,4.40,1.79,3.75,4.15,1.72,2.20,1.70,2.15`,
  `T1,${dd},14:00,Goztep,Buyuksehyr,2.50,3.30,2.80,2.55,3.40,2.90,2.48,3.28,2.78,2.05,1.83,2.00,1.80`,
  `E0,${dd},20:00,Arsenal,Chelsea,1.70,3.90,4.80,1.74,4.00,5.00,1.70,3.85,4.70,,,1.80,2.00`,
].join("\n");

const results = ["Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HC,AC,HY,AY,HR,AR"];
const teams = ["Fenerbahce", "Besiktas", "Goztep", "Buyuksehyr", "Galatasaray", "Trabzonspor"];
let day = 1;
for (let round = 0; round < 6; round++)
  for (let i = 0; i < teams.length; i += 2) {
    const h = teams[(i + round) % 6], a = teams[(i + round + 1) % 6];
    results.push(`T1,${String(day).padStart(2, "0")}/09/2026,19:00,${h},${a},${(i + round) % 4},${round % 3},H,${5 + (i % 3)},${4 + (round % 2)},2,3,0,${round % 2}`);
    day = (day % 28) + 1;
  }

const NESINE = {
  sg: {
    LA: [{ LID: 1, N: "Türkiye Süper Lig" }],
    EA: [
      {
        C: 101, HN: "Fenerbahçe", AN: "Beşiktaş", ESD: koUtc.getTime() + 0, TYPE: 1, LE: 0, LC: 1,
        MA: [
          { MTID: 1, MN: "Maç Sonucu", OCA: [{ N: 1, O: 1.65 }, { N: 2, O: 3.45 }, { N: 3, O: 3.9 }] },
          { MTID: 12, SOV: 2.5, MN: "Alt/Üst", OCA: [{ N: 1, O: 2.0 }, { N: 2, O: 1.6 }] },
          { MTID: 38, MN: "Karşılıklı Gol", OCA: [{ N: 1, O: 1.62 }, { N: 2, O: 2.05 }] },
          { MTID: 14, SOV: 1.5, MN: "İlk Yarı Alt/Üst", OCA: [{ N: 1, O: 1.3, ON: "Alt" }, { N: 2, O: 2.9, ON: "Üst" }] },
          { MTID: 216, SOV: 9.5, MN: "Korner Alt/Üst", OCA: [{ N: 1, O: 1.75 }, { N: 2, O: 1.8 }] },
          { MTID: 272, SOV: 2.5, MN: "Maç Sonucu ve Alt/Üst", OCA: [1, 2, 3, 4, 5, 6].map((n) => ({ N: n, O: 3 + n })) },
          { MTID: 999, MN: "İlk Golü Kim Atar", OCA: [{ N: 1, O: 1.7 }] },
        ],
      },
      { C: 102, HN: "Göztepe", AN: "Başakşehir FK", ESD: koUtc.getTime() - 3 * 3600_000, TYPE: 1, LE: 0, LC: 1,
        MA: [{ MTID: 1, MN: "Maç Sonucu", OCA: [{ N: 1, O: 2.3 }, { N: 2, O: 3.0 }, { N: 3, O: 2.75 }] }] },
      { C: 103, HN: "Lakers", AN: "Celtics", ESD: koUtc.getTime(), TYPE: 2, MA: [] },
    ],
  },
};

test("Nesine pazarları seçenek anahtarlarına çevrilir", () => {
  const ev = parseNesine(NESINE)[0];
  const keys = Object.fromEntries(ev.lines.map((l) => [l.key, l.odd]));
  assert.equal(keys["1x2:1"], 1.65);
  assert.equal(keys["ou:2.5:o"], 1.6);
  assert.equal(keys["ou:2.5:u"], 2.0);
  assert.equal(keys["btts:y"], 1.62);
  assert.equal(keys["htou:1.5:o"], 2.9);
  assert.equal(keys["cor:9.5:o"], 1.8);
  assert.equal(keys["res_ou:1:2.5:u"], 4);
  assert.equal(keys["res_ou:2:2.5:o"], 9);
  assert.equal(ev.unmapped, 1);
  assert.equal(parseNesine(NESINE).length, 2, "basketbol elenir");
  assert.equal(mapMarket({ MTID: 12, SOV: 2, MN: "Alt/Üst", OCA: [{ N: 1, O: 1.9 }] }), null, "tam sayı çizgi atlanır");
});

test("Football-Data fixtures: Pinnacle tercih edilir, yoksa ortalama", () => {
  const f = parseFixtures(FIXTURES);
  assert.equal(f.length, 3);
  assert.deepEqual(f[0].h2h, [1.83, 3.9, 4.4]);
  assert.equal(f[0].reference, "Pinnacle");
  assert.deepEqual(f[2].ou25, [1.8, 2.0], "P>2.5 boşsa Avg>2.5");
});

test("İngiltere saati UTC'ye çevrilir", () => {
  assert.equal(ukToUtc(new Date(Date.UTC(2026, 11, 1)), "20:00").toISOString(), "2026-12-01T20:00:00.000Z");
  assert.equal(ukToUtc(new Date(Date.UTC(2026, 6, 1)), "20:00").toISOString(), "2026-07-01T19:00:00.000Z");
});

test("Türkçe ↔ İngilizce takım adı eşleşir", () => {
  assert.ok(nameSimilarity("Fenerbahçe", "Fenerbahce") >= 0.95);
  assert.ok(nameSimilarity("Başakşehir FK", "Buyuksehyr") >= 0.85);
  assert.ok(nameSimilarity("Göztepe", "Goztep") >= 0.85);
  assert.ok(nameSimilarity("B. Dortmund", "Dortmund") >= 0.85);
  assert.ok(nameSimilarity("Man. City", "Man City") >= 0.95);
  assert.ok(nameSimilarity("Fenerbahçe", "Galatasaray") < 0.6);
});

test("canlı sağlayıcı uçtan uca: eşleştirir, istatistik üretir, analiz eder", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const body = String(url).includes("nesine") ? JSON.stringify(NESINE) : String(url).includes("fixtures") ? FIXTURES : String(url).includes("/T1.csv") ? results.join("\n") : "";
    return new Response(body, { status: body ? 200 : 404 });
  }) as typeof fetch;

  const matches = await liveProvider.listMatches();
  assert.equal(matches.length, 2, "Arsenal–Chelsea Nesine'de yok, elenir");
  const fb = matches.find((m) => m.home.name === "Fenerbahçe")!;
  assert.equal(fb.away.name, "Beşiktaş");
  assert.equal(fb.league, "Süper Lig");
  assert.equal(fb.home.form.length, 5);
  assert.ok(fb.home.goalsFor10.length > 0);
  assert.ok(fb.home.rank > 0);
  const a = analyze(fb);
  assert.ok(a.iddaaMargin! > 0.1, "iddaa marjı hesaplanır");
  assert.ok(a.rows.length >= 10);
  assert.ok(calls.some((c) => c.includes("mmz4281")));

});
