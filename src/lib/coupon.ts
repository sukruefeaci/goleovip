/**
 * Otomatik kupon oluşturucu (istemci tarafında da çalışır; sunucuya bağımlılığı yok).
 *
 * Her maçtan en fazla bir seçenek alınır (aynı maçtan iki seçenek birbirine bağlıdır).
 * Maçlar arası bağımsız kabul edilir: kuponun tutma olasılığı = seçenek olasılıklarının çarpımı.
 * iddaa MBS kuralı: bir seçenek, kuponda en az MBS sayısı kadar maç varsa oynanabilir.
 */

export interface CouponCandidate {
  key: string;
  market: string;
  selection: string;
  category: string;
  odd: number;
  prob: number;
  sigma: number;
  ev: number;
  mbc: number;
  confidence?: number;
  confidenceParts?: import("./types").ConfidencePart[];
  required?: number;
}

export interface CouponMatch {
  id: string;
  source?: "market" | "elo";
  home: string;
  away: string;
  league: string;
  kickoff: string;
  options: CouponCandidate[];
}

export type CouponMode = "guvenli" | "dengeli";

export interface CouponSettings {
  legs: number;
  stake: number;
  mode: CouponMode;
  minOdd: number;
  excluded: string[]; // dışarıda bırakılan maç id'leri
  now?: number;
}

export interface CouponLeg {
  match: CouponMatch;
  pick: CouponCandidate;
}

export interface Coupon {
  legs: CouponLeg[];
  totalOdd: number;
  winProb: number;
  payout: number;
  expectedReturn: number; // stake * (winProb * totalOdd)
  ev: number; // winProb * totalOdd - 1
}

export interface CouponResult {
  coupon: Coupon | null;
  available: number; // uygun maç sayısı
  message?: string;
}

/** Güvenli: belirsizliği düşülmüş olasılık en yüksek. Dengeli: olasılık ve getiriyi birlikte gözetir. */
function score(c: CouponCandidate, mode: CouponMode): number {
  const safeProb = c.prob - c.sigma;
  return mode === "guvenli" ? safeProb : Math.log(Math.max(safeProb, 0.01)) + 1.5 * c.ev;
}

export function buildCoupon(matches: CouponMatch[], s: CouponSettings): CouponResult {
  const now = s.now ?? Date.now();
  const maxOdd = s.mode === "guvenli" ? 2.2 : 3.5;
  const best = matches
    .filter((m) => !s.excluded.includes(m.id) && new Date(m.kickoff).getTime() > now)
    .map((m) => {
      const opts = m.options.filter((o) => o.odd >= s.minOdd && o.odd <= maxOdd && o.mbc <= s.legs && o.prob - o.sigma > 0.3);
      const pick = [...opts].sort((a, b) => score(b, s.mode) - score(a, s.mode))[0];
      return pick ? { match: m, pick } : null;
    })
    .filter((x): x is CouponLeg => x !== null)
    .sort((a, b) => score(b.pick, s.mode) - score(a.pick, s.mode));

  if (best.length < s.legs) {
    return {
      coupon: null,
      available: best.length,
      message:
        best.length === 0
          ? "Şu an kriterlere uyan maç yok. Minimum oranı düşürmeyi deneyin."
          : `Kriterlere uyan yalnız ${best.length} maç var. Maç sayısını ${best.length} veya daha az yapın ya da minimum oranı düşürün.`,
    };
  }

  const legs = best.slice(0, s.legs).sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));
  const totalOdd = legs.reduce((p, l) => p * l.pick.odd, 1);
  const winProb = legs.reduce((p, l) => p * l.pick.prob, 1);
  const ev = winProb * totalOdd - 1;
  return {
    available: best.length,
    coupon: {
      legs,
      totalOdd,
      winProb,
      payout: s.stake * totalOdd,
      expectedReturn: s.stake * (1 + ev),
      ev,
    },
  };
}

export function couponText(c: Coupon, stake: number): string {
  const lines = c.legs.map(
    (l, i) => `${i + 1}. ${l.match.home} - ${l.match.away} | ${l.pick.market}: ${l.pick.selection} @${l.pick.odd.toFixed(2)}`,
  );
  return [
    ...lines,
    `Toplam oran: ${c.totalOdd.toFixed(2)} · Tutar: ${stake.toFixed(2)} TL · Olası kazanç: ${(stake * c.totalOdd).toFixed(2)} TL`,
    `Model tutma olasılığı: %${(c.winProb * 100).toFixed(1)}`,
  ].join("\n");
}

/** Banko için yalnız Avrupa piyasasıyla doğrulanan pazarlar (korner/kart yalnız istatistik, İY/MS çok belirsiz) */
export const BANKO_CATEGORIES = ["Sonuç", "Gol", "İlk Yarı"];
export const BANKO_MIN_ODD = 1.25;

/**
 * Banko: tüm yaklaşan maçlar içinden en güvenilir iki tercih (farklı maçlardan).
 * Güvenilirlik = belirsizlik payı düşülmüş model olasılığı. İkili kupon olarak da oynanabilmesi için MBS ≤ 2.
 */
export function bankoPicks(matches: CouponMatch[], count = 2, now = Date.now()): CouponResult {
  // Banko yalnız Avrupa piyasasıyla doğrulanan maçlardan (ClubElo maçları hariç)
  const filtered = matches.filter((m) => m.source !== "elo").map((m) => ({
    ...m,
    options: m.options.filter((o) => BANKO_CATEGORIES.includes(o.category)),
  }));
  return buildCoupon(filtered, { legs: count, stake: 100, mode: "guvenli", minOdd: BANKO_MIN_ODD, excluded: [], now });
}
