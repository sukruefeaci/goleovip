import { buildContext, describe, DISPERSION, probability } from "./markets";
import { negBinOver, poissonOver } from "./poisson";
import type { AfOdds, Lines } from "./providers/apiFootball";
import { fitLambdas } from "./model";
import type { Analysis } from "./types";

/**
 * Oran açığı: iddaa'nın oranı / çizgisi ile yurt dışı piyasanın (Football-Data: Betfair Borsası ya da piyasa ortalaması,
 * marjı atılmış) beklentisi arasındaki fark.
 *  - Doğrudan: Maç Sonucu (1-X-2) ve 2.5 Alt/Üst — yurt dışı oranı birebir var.
 *  - Türetilmiş: diğer Alt/Üst çizgileri, takım golleri, KG, ilk yarı, çifte şans… — yurt dışı 1-X-2 ve 2.5 Alt/Üst
 *    oranlarına oturtulan gol beklentisinden (Poisson) hesaplanır; yurt dışının bu pazarlarda vereceği adil orana yakındır.
 * Açık = iddaa oranı × yurt dışı ihtimali − 1 (artıysa iddaa, yurt dışının adil oranından yüksek veriyor).
 * Çizgi açığı: Alt/Üst pazarlarında iddaa'nın çizgisi yurt dışının beklediği toplamdan belirgin uzaksa (ör. iddaa 1.5 Üst,
 * yurt dışı beklentisi 2.9 gol).
 */

export interface GapRow {
  key: string;
  market: string;
  selection: string;
  odd: number; // iddaa
  pForeign: number; // yurt dışı (marjsız) ihtimal
  fairOdd: number; // yurt dışı adil oran
  gap: number; // iddaa oranı × ihtimal − 1
  direct: boolean;
  /** Karşılaştırılan yurt dışı şirket (ör. Pinnacle) */
  book?: string;
  /**
   * Alt/Üst çizgi bilgisi. equivLine: yurt dışının iddaa'nın bu oranını (ya da daha düşüğünü) vereceği en uç çizgi.
   * Üst'te equivLine > line ise iddaa aynı oranı daha kolay çizgide veriyor (ör. iddaa 1.5 Üst 1.62 ≈ yurt dışı 2.5 Üst).
   */
  line?: { line: number; expected: number; side: "Üst" | "Alt"; what: string; equivLine: number | null };
}

export interface GapMatch {
  a: Analysis;
  rows: GapRow[];
  reference: string;
  expectedGoals: number;
}

export const GAP_MIN_ODD = 1.3;
const MIN_P = 0.25; // çok düşük ihtimalli (sürpriz) seçenekler listelenmez

const devig2 = (o: number, u: number) => 1 / o / (1 / o + 1 / u);
const devig3 = (h: [number, number, number]): [number, number, number] => {
  const s = 1 / h[0] + 1 / h[1] + 1 / h[2];
  return [1 / h[0] / s, 1 / h[1] / s, 1 / h[2] / s];
};

/** Çizgili pazar aileleri: iddaa anahtarı öneki → yurt dışı pazarı, dağılım, aday çizgiler, açıklama */
const FAMILIES: Record<string, { af: keyof AfOdds; dist: "pois" | number; max: number; what: (h: string, a: string) => string }> = {
  ou: { af: "ou", dist: "pois", max: 8.5, what: () => "toplam gol" },
  hou: { af: "homeGoals", dist: "pois", max: 6.5, what: (h) => `${h} golü` },
  aou: { af: "awayGoals", dist: "pois", max: 6.5, what: (_, a) => `${a} golü` },
  htou: { af: "ou1h", dist: "pois", max: 4.5, what: () => "ilk yarı golü" },
  cor: { af: "corners", dist: DISPERSION.cornersTotal, max: 20.5, what: () => "toplam korner" },
  hcor: { af: "homeCorners", dist: DISPERSION.cornersTeam, max: 13.5, what: (h) => `${h} kornerı` },
  acor: { af: "awayCorners", dist: DISPERSION.cornersTeam, max: 13.5, what: (_, a) => `${a} kornerı` },
  card: { af: "cards", dist: DISPERSION.cards, max: 12.5, what: () => "toplam kart" },
};

/** Yurt dışı çizgilerinden ortalamayı bul: ihtimali %50'ye en yakın çizgide dağılımı tutturan ortalama */
function fitMean(lines: Lines, k: number | "pois"): number | null {
  const pts = Object.entries(lines).map(([l, [o, u]]) => ({ L: Number(l), p: devig2(o, u) }));
  if (!pts.length) return null;
  const { L, p } = pts.sort((x, y) => Math.abs(x.p - 0.5) - Math.abs(y.p - 0.5))[0];
  const over = (mu: number) => (k === "pois" ? poissonOver(L, mu) : negBinOver(L, mu, k));
  let lo = 0.01,
    hi = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (over(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Bir maçın açıkları. af: API-Football yurt dışı oranları (varsa: Pinnacle/Betfair/Bet365…, korner ve kart dahil);
 * yoksa Football-Data maçlarında yurt dışı 1X2 + 2.5 Alt/Üst.
 */
export function gapsFor(a: Analysis, af?: AfOdds | null): GapMatch | null {
  const m = a.match;
  const fd = (m.source ?? "market") === "market";
  if (!af && !fd) return null;

  // Yurt dışı 1X2 ve 2.5 Alt/Üst (marjsız) → gol beklentisi
  const p1x2 = af?.h2h ? devig3(af.h2h) : fd ? a.euroFair : null;
  const o25 = af?.ou?.["2.5"];
  const pO25 = o25 ? devig2(o25[0], o25[1]) : fd ? a.euroOver25 : null;
  const lam = p1x2 && pO25 !== null ? fitLambdas(p1x2, pO25) : null;
  const ctx = lam ? buildContext(lam.home, lam.away, 0, 0, 0, a.halfShare) : null;
  const meanFor = (mk: string): number | null => {
    const f = FAMILIES[mk];
    const lines = af?.[f.af] as Lines | undefined;
    if (lines && Object.keys(lines).length) return fitMean(lines, f.dist);
    if (!lam) return null;
    if (mk === "ou") return lam.home + lam.away;
    if (mk === "hou") return lam.home;
    if (mk === "aou") return lam.away;
    if (mk === "htou") return lam.home * a.halfShare.home + lam.away * a.halfShare.away;
    return null; // korner/kart: yurt dışı çizgisi yoksa yok
  };
  const means: Record<string, number | null> = {};
  /** Yurt dışına göre "L çizgisinin üstü/altı" ihtimali; birebir çizgi varsa doğrudan */
  const lineProb = (mk: string, L: number, over: boolean): { p: number; direct: boolean } | null => {
    const f = FAMILIES[mk];
    const exact = (af?.[f.af] as Lines | undefined)?.[L.toFixed(1)];
    if (exact) {
      const po = devig2(exact[0], exact[1]);
      return { p: over ? po : 1 - po, direct: true };
    }
    const mu = (means[mk] ??= meanFor(mk));
    if (mu === null) return null;
    const po = f.dist === "pois" ? poissonOver(L, mu) : negBinOver(L, mu, f.dist);
    return { p: over ? po : 1 - po, direct: false };
  };

  const rows: GapRow[] = [];
  // korner/kart çizgileri: istatistiği olmayan maçlarda ayrı alanda durur
  for (const l of [...m.iddaa, ...(m.iddaaStat ?? [])]) {
    if (l.odd < GAP_MIN_ODD) continue;
    let def;
    try {
      def = describe(l.key, m.home.name, m.away.name);
    } catch {
      continue;
    }
    const [mk, a1, a2] = l.key.split(":");
    let p: number | null = null;
    let direct = false;
    if (mk === "1x2" && p1x2) {
      p = p1x2[a1 === "1" ? 0 : a1 === "X" ? 1 : 2];
      direct = true;
    } else if (mk === "btts" && af?.btts) {
      const py = devig2(af.btts[0], af.btts[1]);
      p = a1 === "y" ? py : 1 - py;
      direct = true;
    } else if (FAMILIES[mk]) {
      const r = lineProb(mk, Number(a1), a2 === "o");
      if (r) ({ p, direct } = r);
    } else if (ctx && def.category !== "Korner" && def.category !== "Kart") p = probability(def, ctx);
    if (p === null || !(p >= MIN_P && p < 0.995)) continue;
    const fam = FAMILIES[mk]?.af as keyof AfOdds["books"] | undefined;
    const book =
      (af && (mk === "1x2" ? af.books.h2h : mk === "btts" ? af.books.btts : fam ? af.books[fam] : af.books.h2h ?? af.books.ou)) ||
      (fd ? m.euro.reference : undefined);
    const row: GapRow = { key: l.key, market: def.market, selection: def.selection, odd: l.odd, pForeign: p, fairOdd: 1 / p, gap: l.odd * p - 1, direct, book };
    if (FAMILIES[mk]) {
      const f = FAMILIES[mk];
      const side = a2 === "o" ? "Üst" : "Alt";
      // Eşdeğer çizgi: yurt dışının iddaa'nın bu oranını vereceği en uç çizgi
      const need = 1 / l.odd;
      let equivLine: number | null = null;
      for (let L = 0.5; L <= f.max; L += 1) {
        const r = lineProb(mk, L, side === "Üst");
        if (r && r.p >= need) {
          if (side === "Üst") equivLine = L;
          else if (equivLine === null) equivLine = L;
        }
      }
      row.line = { line: Number(a1), expected: (means[mk] ??= meanFor(mk)) ?? NaN, side, what: f.what(m.home.name, m.away.name), equivLine };
    }
    rows.push(row);
  }
  const reference = af ? [...new Set(Object.values(af.books))].slice(0, 3).join(", ") || "yurt dışı" : m.euro.reference;
  return { a, rows, reference, expectedGoals: lam ? lam.home + lam.away : NaN };
}

/** Çizgi açığı: yurt dışı iddaa'nın bu oranını en az bir çizgi daha zor bir yerde veriyor */
export const lineGapSize = (r: GapRow) =>
  !r.line || r.line.equivLine === null ? 0 : r.line.side === "Üst" ? r.line.equivLine - r.line.line : r.line.line - r.line.equivLine;
export const isLineGap = (r: GapRow) => lineGapSize(r) >= 1;
/** Çok büyük açık: çoğu zaman son dakika haberi, saha değişikliği ya da veri / oran hatası; kontrol edilmeli */
export const SUSPECT_GAP = 0.4;
export const isSuspectGap = (r: GapRow) => r.gap >= SUSPECT_GAP;

/** Yaklaşan maçlarda açıkları tarar: açığı ≥ minGap olan seçenekler, en büyük açıktan */
export function scanGaps(analyses: Analysis[], minGap = 0.03, now = Date.now(), afFor?: (a: Analysis) => AfOdds | null): GapMatch[] {
  const out: GapMatch[] = [];
  for (const a of analyses) {
    if (new Date(a.match.kickoff).getTime() <= now) continue;
    const g = gapsFor(a, afFor?.(a) ?? null);
    if (!g) continue;
    const rows = g.rows.filter((r) => r.gap >= minGap).sort((x, y) => y.gap - x.gap);
    if (rows.length) out.push({ ...g, rows });
  }
  return out.sort((x, y) => y.rows[0].gap - x.rows[0].gap);
}
