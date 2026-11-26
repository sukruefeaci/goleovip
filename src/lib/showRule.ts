/**
 * Gösterim kuralı (sistemlerin hesabını değiştirmez, yalnız neyin gösterileceğini belirler):
 * oran ≥ 1.50 ve sistemin KAZANMA OLASILIĞI ≥ %60 olan tercihler gösterilir; olasılığı ≥ %70 olanlar "Güçlü".
 * Olasılıklar her sistemin kendi sonuçlarına göre yüzde aralığı düzeltmesinden geçmiştir ("%70 diyorsa %70").
 */
export const SHOW_MIN_ODD = 1.5;
export const SHOW_MIN_PROB = 60; // %
export const STRONG_PROB = 70; // %

export type Tier = "guclu" | "orta";

/** prob: 0–1 arası kazanma olasılığı */
export function tierOf(odd: number | undefined | null, prob: number | undefined | null): Tier | null {
  if (!odd || odd < SHOW_MIN_ODD || prob === undefined || prob === null) return null;
  const pct = prob * 100;
  if (pct < SHOW_MIN_PROB - 1e-9) return null;
  return pct >= STRONG_PROB - 1e-9 ? "guclu" : "orta";
}

export const TIER_LABEL: Record<Tier, string> = { guclu: "Güçlü", orta: "Orta" };
export const pct = (p: number) => `%${Math.round(p * 100)}`;
