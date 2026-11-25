import { loadAnalyses } from "./data";
import { historyIfReady, TOLERANCE } from "./history";
import { bestOddsPick, matchAllSelections, ODDS_PICK_MIN, type SelectionMatch } from "./oddsMatch";
import type { Analysis } from "./types";

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

let cache: { key: unknown; hist: unknown; rows: OddsRow[] } | null = null;

/** Tüm analizler için Oran analizi tercihi (analizler değişmedikçe yeniden hesaplanmaz) */
export async function computeOddsPicks(): Promise<{ rows: OddsRow[]; banner: string | null; histCount: number; loading: boolean }> {
  const [{ analyses, banner }, hist] = await Promise.all([loadAnalyses(), historyIfReady()]);
  // Arşiv henüz yüklenmediyse sayfa beklemez: önceki sonuç (varsa) ya da boş liste, "yükleniyor" işaretiyle
  if (!hist) return { rows: cache?.rows ?? [], banner: banner ?? null, histCount: 0, loading: true };
  if (!cache || cache.key !== analyses || cache.hist !== hist.matches) {
    cache = {
      key: analyses,
      hist: hist.matches,
      rows: analyses.map((a) => {
        const p = bestOddsPick(matchAllSelections(a.match.iddaa, hist.matches, TOLERANCE.normal, a.match.home.name, a.match.away.name, ODDS_PICK_MIN));
        return { a, pick: p && { ...p, confidence: oddsConfidence(p) } };
      }),
    };
  }
  return { rows: cache.rows, banner: banner ?? null, histCount: hist.matches.length, loading: false };
}
