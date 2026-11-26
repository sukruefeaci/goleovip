import { inBackground } from "./background";
import { cachedFetch } from "./providers/cache";
import { LEAGUES, parseCsv, parseDate, seasonCode, seasonUrl } from "./providers/footballData";

/**
 * Oran analizi: geçmiş maç arşivi (Football-Data sezon dosyaları, piyasa ortalaması oranları + sonuçlar)
 * ve yaklaşan bir maçın oranlarına benzeyen geçmiş maçları bulma.
 *
 * Karşılaştırma "adil" (marjı atılmış) olasılıklarla yapılır: iddaa'nın kesintisi Avrupa ortalamasından
 * büyük olduğu için ham oranları doğrudan karşılaştırmak yanlış maçları eşleştirirdi.
 */

export interface HistMatch {
  date: string; // YYYY-MM-DD
  league: string;
  home: string;
  away: string;
  odds: [number, number, number]; // piyasa ortalaması 1 / X / 2
  ou?: [number, number]; // Üst / Alt 2.5
  p: [number, number, number]; // adil olasılıklar
  pOver?: number;
  hg: number;
  ag: number;
  hht?: number;
  aht?: number;
}

const num = (s: string | undefined) => {
  const v = Number(s);
  return Number.isFinite(v) && v > 1 ? v : null;
};

function devig(odds: number[]) {
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}

export function parseHistory(text: string, league: string): HistMatch[] {
  const out: HistMatch[] = [];
  for (const r of parseCsv(text)) {
    const d = parseDate(r.Date);
    if (!d || r.FTHG === undefined || r.FTHG === "" || r.FTAG === "") continue;
    const h = num(r.AvgH) ?? num(r.B365H);
    const x = num(r.AvgD) ?? num(r.B365D);
    const a = num(r.AvgA) ?? num(r.B365A);
    if (!h || !x || !a) continue;
    const o = num(r["Avg>2.5"]) ?? num(r["B365>2.5"]);
    const u = num(r["Avg<2.5"]) ?? num(r["B365<2.5"]);
    const p = devig([h, x, a]) as [number, number, number];
    const hht = r.HTHG === "" || r.HTHG === undefined ? undefined : Number(r.HTHG);
    const aht = r.HTAG === "" || r.HTAG === undefined ? undefined : Number(r.HTAG);
    out.push({
      date: d.toISOString().slice(0, 10),
      league,
      home: r.HomeTeam,
      away: r.AwayTeam,
      odds: [h, x, a],
      ou: o && u ? [o, u] : undefined,
      p,
      pOver: o && u ? devig([o, u])[0] : undefined,
      hg: Number(r.FTHG),
      ag: Number(r.FTAG),
      hht,
      aht,
    });
  }
  return out;
}

let memo: { at: number; data: HistMatch[]; files: number } | null = null;
let inflight: Promise<{ matches: HistMatch[]; files: number }> | null = null;

/** Tüm liglerin son üç sezonu (6 saat önbellek; eskiyse eskisi hemen verilir, arka planda yenilenir). */
export async function loadHistory(now = new Date()): Promise<{ matches: HistMatch[]; files: number }> {
  if (memo && Date.now() - memo.at < 6 * 60 * 60_000) return { matches: memo.data, files: memo.files };
  if (memo) {
    if (!inflight) void fetchHistory(now).catch(() => {});
    return { matches: memo.data, files: memo.files };
  }
  return fetchHistory(now);
}

/**
 * Arşiv hazırsa hemen, değilse en fazla budgetMs bekler; yetişmezse null döner (yükleme arka planda sürer).
 * Sayfaların arşiv yüklenirken uzun süre beklememesi için.
 */
export async function historyIfReady(budgetMs = 1500): Promise<{ matches: HistMatch[]; files: number } | null> {
  if (memo) return loadHistory();
  const job = loadHistory();
  const r = await Promise.race([job, new Promise<null>((res) => setTimeout(() => res(null), budgetMs).unref?.())]);
  if (!r) inBackground(() => job); // yanıt gittikten sonra da yükleme tamamlansın (sunucu fonksiyonu açık kalır)
  return r;
}

function fetchHistory(now: Date): Promise<{ matches: HistMatch[]; files: number }> {
  if (inflight) return inflight;
  inflight = fetchHistoryNow(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchHistoryNow(now: Date): Promise<{ matches: HistMatch[]; files: number }> {
  const seasons = [0, 1, 2].map((y) => seasonCode(new Date(Date.UTC(now.getUTCFullYear() - y, now.getUTCMonth(), 1))));
  const jobs = Object.keys(LEAGUES).flatMap((div) => seasons.map((s) => ({ div, s })));
  const results: HistMatch[][] = [];
  let files = 0;
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < jobs.length) {
        const { div, s } = jobs[i++];
        try {
          const f = await cachedFetch(`hist-${s}-${div}.csv`, `${LEAGUES[div]} ${s}`, seasonUrl(s, div), 12 * 60 * 60_000);
          const parsed = parseHistory(f.text, LEAGUES[div]);
          if (parsed.length) {
            results.push(parsed);
            files++;
          }
        } catch {
          /* bu dosya yok/erişilemedi */
        }
      }
    }),
  );
  const data = results.flat();
  memo = { at: Date.now(), data, files };
  return { matches: data, files };
}

/** Oran benzerliği: adil olasılıklar arasındaki en büyük fark */
export const distance = (a: [number, number, number], b: [number, number, number]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

export function findSimilar(history: HistMatch[], p: [number, number, number], tolerance: number): (HistMatch & { d: number })[] {
  return history
    .map((m) => ({ ...m, d: distance(m.p, p) }))
    .filter((m) => m.d <= tolerance)
    .sort((x, y) => x.d - y.d);
}

const res = (d: number) => (d > 0 ? "1" : d === 0 ? "X" : "2");

export interface OutcomeStat {
  key: string; // bizim seçenek anahtarımız (iddaa oranıyla birleştirmek için)
  label: string;
  hits: number;
  n: number;
}

/** Benzer maçlarda hangi tercih ne sıklıkla kazandı */
export function outcomeStats(ms: HistMatch[]): OutcomeStat[] {
  const stat = (key: string, label: string, pred: (m: HistMatch) => boolean | null): OutcomeStat => {
    const valid = ms.map(pred).filter((x): x is boolean => x !== null);
    return { key, label, hits: valid.filter(Boolean).length, n: valid.length };
  };
  const ft = (m: HistMatch) => res(m.hg - m.ag);
  const ht = (m: HistMatch) => (m.hht === undefined || m.aht === undefined ? null : res(m.hht - m.aht));
  const tot = (m: HistMatch) => m.hg + m.ag;
  return [
    stat("1x2:1", "MS 1", (m) => ft(m) === "1"),
    stat("1x2:X", "MS X", (m) => ft(m) === "X"),
    stat("1x2:2", "MS 2", (m) => ft(m) === "2"),
    stat("dc:1X", "Çifte şans 1X", (m) => ft(m) !== "2"),
    stat("dc:12", "Çifte şans 12", (m) => ft(m) !== "X"),
    stat("dc:X2", "Çifte şans X2", (m) => ft(m) !== "1"),
    stat("ou:1.5:o", "1.5 Üst", (m) => tot(m) > 1.5),
    stat("ou:2.5:o", "2.5 Üst", (m) => tot(m) > 2.5),
    stat("ou:2.5:u", "2.5 Alt", (m) => tot(m) < 2.5),
    stat("ou:3.5:o", "3.5 Üst", (m) => tot(m) > 3.5),
    stat("btts:y", "KG Var", (m) => m.hg > 0 && m.ag > 0),
    stat("btts:n", "KG Yok", (m) => m.hg === 0 || m.ag === 0),
    stat("ht1x2:1", "İY 1", (m) => (ht(m) === null ? null : ht(m) === "1")),
    stat("ht1x2:X", "İY X", (m) => (ht(m) === null ? null : ht(m) === "X")),
    stat("ht1x2:2", "İY 2", (m) => (ht(m) === null ? null : ht(m) === "2")),
    ...["1/1", "X/1", "X/X", "2/2", "X/2"].map((o) =>
      stat(`htft:${o}`, `İY/MS ${o}`, (m) => (ht(m) === null ? null : `${ht(m)}/${ft(m)}` === o)),
    ),
  ];
}

export const resultLabel = (m: HistMatch) => res(m.hg - m.ag);

export const TOLERANCE = { siki: 0.02, normal: 0.035, genis: 0.05 } as const;
export type ToleranceKey = keyof typeof TOLERANCE;
export const TOLERANCE_LABEL: Record<ToleranceKey, string> = { siki: "Sıkı (±2 puan)", normal: "Normal (±3.5 puan)", genis: "Geniş (±5 puan)" };

export function sampleLabel(n: number) {
  return n < 20 ? { text: "çok az örnek", cls: "lv-low" } : n < 60 ? { text: "az örnek", cls: "lv-mid" } : { text: "yeterli örnek", cls: "lv-high" };
}
