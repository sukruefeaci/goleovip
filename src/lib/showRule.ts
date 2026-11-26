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
  const pct = Math.round(prob * 100); // ekranda görünen yüzdeyle tutarlı
  if (pct < SHOW_MIN_PROB) return null;
  return pct >= STRONG_PROB ? "guclu" : "orta";
}

export const TIER_LABEL: Record<Tier, string> = { guclu: "Güçlü", orta: "Orta" };
export const pct = (p: number) => `%${Math.round(p * 100)}`;

/** Her gün en az bu kadar tercih gösterilir: şartı geçen az ise en olası olanlarla tamamlanır */
export const MIN_DAILY = 10;
export type ShowTier = Tier | "aday";
export const SHOW_LABEL: Record<ShowTier, string> = { ...TIER_LABEL, aday: "Aday" };

/**
 * Gösterilecekler: şartı geçenler (Güçlü / Orta); MIN_DAILY'den azsa oranı ≥ 1.50 olanlar içinden
 * olasılığı en yüksekler "Aday" olarak eklenir. Sıra korunur (ör. başlama saati).
 */
export function selectShown<T>(items: T[], get: (t: T) => { odd?: number | null; prob?: number | null } | null, min = MIN_DAILY) {
  const tierOfItem = new Map<T, ShowTier>();
  for (const it of items) {
    const g = get(it);
    const t = g ? tierOf(g.odd, g.prob) : null;
    if (t) tierOfItem.set(it, t);
  }
  if (tierOfItem.size < min) {
    const cands = items
      .filter((it) => !tierOfItem.has(it))
      .map((it) => ({ it, g: get(it) }))
      .filter((x) => x.g && x.g.odd && x.g.odd >= SHOW_MIN_ODD && typeof x.g.prob === "number")
      .sort((a, b) => b.g!.prob! - a.g!.prob!);
    for (const c of cands.slice(0, min - tierOfItem.size)) tierOfItem.set(c.it, "aday");
  }
  return {
    shown: items.filter((it) => tierOfItem.has(it)),
    rest: items.filter((it) => !tierOfItem.has(it)),
    tier: (it: T) => tierOfItem.get(it) ?? null,
  };
}
