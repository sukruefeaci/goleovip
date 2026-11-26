import { loadAnalyses } from "./data";
import { historyIfReady, TOLERANCE } from "./history";
import { bestOddsPick, matchAllSelections, ODDS_PICK_MIN, type SelectionMatch } from "./oddsMatch";
import type { Analysis } from "./types";
import { mapperFor } from "./calibration";
import { inBackground } from "./background";

/**
 * Oran analizi sisteminin güveni (kendi mantığıyla): geçmişte aynı oranlı maçlarda bu tercihin tutma oranı,
 * bugünkü oranın marjsız olasılığını ne kadar kesin aşıyor? z = (geçmiş oran − adil olasılık) / standart hata.
 * Güven = 50 + 10·z (1–95 arası). Örnek: adil %55, geçmişte %58 (412 maç) → z≈1.2 → %62; %62 → z≈2.9 → %79.
 */
export function oddsConfidence(p: Pick<SelectionMatch, "rate" | "fair" | "n">): number {
  const f = Math.min(0.97, Math.max(0.03, p.fair));
  const se = Math.sqrt((f * (1 - f)) / Math.max(1, p.n));
  const z = (p.rate - f) / se;
  return Math.round(Math.min(95, Math.max(1, 50 + 10 * z)));
}

export type OddsRow = { a: Analysis; pick: (SelectionMatch & { confidence: number }) | null };

/* ------------------------------------------------------------ ortak seçenek eşleştirme önbelleği */

type HistList = Parameters<typeof matchAllSelections>[1];
let selCache: { hist: HistList; byMatch: Map<string, { sig: string; sel: SelectionMatch[] }> } | null = null;
const sigOf = (a: Analysis) => a.match.iddaa.map((l) => `${l.key}=${l.odd}`).join("|");

/** Bir maçın tüm iddaa seçenekleri için geçmiş eşleştirmesi (maç + oranlar değişmedikçe yeniden hesaplanmaz) */
export function selectionsFor(a: Analysis, hist: HistList): SelectionMatch[] {
  if (!selCache || selCache.hist !== hist) selCache = { hist, byMatch: new Map() };
  const sig = sigOf(a);
  const c = selCache.byMatch.get(a.match.id);
  if (c && c.sig === sig) return c.sel;
  const sel = matchAllSelections(a.match.iddaa, hist, TOLERANCE.normal, a.match.home.name, a.match.away.name, 1.01);
  selCache.byMatch.set(a.match.id, { sig, sel });
  return sel;
}

const tick = () => new Promise<void>((r) => setImmediate(r));

/** Tüm maçlar için eşleştirme; maçlar arasında olay döngüsüne nefes aldırır (sayfa zamanlayıcıları çalışabilsin) */
export async function selectionsForAll(analyses: Analysis[], hist: HistList): Promise<Map<string, SelectionMatch[]>> {
  const out = new Map<string, SelectionMatch[]>();
  for (const a of analyses) {
    out.set(a.match.id, selectionsFor(a, hist));
    await tick();
  }
  return out;
}

let cache: { key: unknown; hist: unknown; rows: OddsRow[] } | null = null;
let job: Promise<OddsRow[]> | null = null;

/**
 * Tüm analizler için Oran analizi tercihi. İlk hesap (geçmiş arşivden olasılık tabloları) uzun sürebilir:
 * sayfa en fazla ~3 sn bekler, yetişmezse önceki sonuç (ya da "yükleniyor") gösterilir, hesap arka planda biter.
 */
export async function computeOddsPicks(waitMs = 2000): Promise<{
  rows: OddsRow[];
  banner: string | null;
  histCount: number;
  loading: boolean;
  /** Oranlar sisteminin kazanma olasılığı: geçmişteki tutma oranı, kendi sonuçlarına göre aralık düzeltmesiyle */
  winOf: (rate: number) => number;
}> {
  const [{ analyses, banner }, hist, winOf] = await Promise.all([loadAnalyses(), historyIfReady(), mapperFor("oran").catch(() => (p: number) => p)]);
  // Arşiv henüz yüklenmediyse sayfa beklemez: önceki sonuç (varsa) ya da boş liste, "yükleniyor" işaretiyle
  if (!hist) return { rows: cache?.rows ?? [], banner: banner ?? null, histCount: 0, loading: true, winOf };
  if (cache && cache.key === analyses && cache.hist === hist.matches)
    return { rows: cache.rows, banner: banner ?? null, histCount: hist.matches.length, loading: false, winOf };
  // Yalnız dün–yarın arası maçlar (sayfalar bu günleri gösterir; ağır hesap küçük kalır)
  const near = analyses.filter((a) => {
    const t = new Date(a.match.kickoff).getTime();
    return t > Date.now() - 36 * 3600_000 && t < Date.now() + 54 * 3600_000;
  });
  job ??= (async () => {
    const sel = await selectionsForAll(near, hist.matches);
    const rows = near.map((a) => {
      const p = bestOddsPick(sel.get(a.match.id) ?? []);
      return { a, pick: p && { ...p, confidence: oddsConfidence(p) } };
    });
    cache = { key: analyses, hist: hist.matches, rows };
    return rows;
  })().finally(() => {
    job = null;
  });
  const running = job;
  const rows = await Promise.race([running, new Promise<null>((r) => setTimeout(() => r(null), waitMs).unref?.())]);
  if (rows) return { rows, banner: banner ?? null, histCount: hist.matches.length, loading: false, winOf };
  inBackground(() => running);
  return { rows: cache?.rows ?? [], banner: banner ?? null, histCount: hist.matches.length, loading: !cache, winOf };
}
