/**
 * Gösterim kuralı (sistemlerin hesabını değiştirmez, yalnız neyin gösterileceğini belirler):
 * oran ≥ 1.50 ve sistemin kendi güveni ≥ %60 olan tercihler gösterilir; güveni ≥ %70 olanlar "Güçlü".
 * Maçlar, Canlı ve Oranlar sistemleri güveni kendi mantıklarıyla hesaplar.
 */
export const SHOW_MIN_ODD = 1.5;
export const SHOW_MIN_CONF = 60;
export const STRONG_CONF = 70;

export type Tier = "guclu" | "orta";

export function tierOf(odd: number | undefined | null, confidence: number | undefined | null): Tier | null {
  if (!odd || odd < SHOW_MIN_ODD || confidence === undefined || confidence === null || confidence < SHOW_MIN_CONF) return null;
  return confidence >= STRONG_CONF ? "guclu" : "orta";
}

export const TIER_LABEL: Record<Tier, string> = { guclu: "Güçlü", orta: "Orta" };
