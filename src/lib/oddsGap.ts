import { buildContext, describe, probability } from "./markets";
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

export function gapsFor(a: Analysis): GapMatch | null {
  const m = a.match;
  if (m.source && m.source !== "market") return null; // yurt dışı bahis oranı yalnız Football-Data maçlarında var
  const lam = fitLambdas(a.euroFair, a.euroOver25);
  const ctx = buildContext(lam.home, lam.away, 0, 0, 0, a.halfShare);
  const rows: GapRow[] = [];
  for (const l of m.iddaa) {
    if (l.odd < GAP_MIN_ODD) continue;
    let def;
    try {
      def = describe(l.key, m.home.name, m.away.name);
    } catch {
      continue;
    }
    if (def.category === "Korner" || def.category === "Kart") continue;
    const [mk, a1, a2] = l.key.split(":");
    let p: number;
    let direct = false;
    if (mk === "1x2") {
      p = a.euroFair[a1 === "1" ? 0 : a1 === "X" ? 1 : 2];
      direct = true;
    } else if (l.key === "ou:2.5:o" || l.key === "ou:2.5:u") {
      p = a2 === "o" ? a.euroOver25 : 1 - a.euroOver25;
      direct = true;
    } else p = probability(def, ctx);
    if (!(p >= MIN_P && p < 0.995)) continue;
    const row: GapRow = { key: l.key, market: def.market, selection: def.selection, odd: l.odd, pForeign: p, fairOdd: 1 / p, gap: l.odd * p - 1, direct };
    // Alt/Üst çizgisi ve yurt dışının beklediği miktar
    const lineNum = Number(a1);
    if (["ou", "hou", "aou", "htou"].includes(mk) && Number.isFinite(lineNum)) {
      const expected =
        mk === "ou"
          ? lam.home + lam.away
          : mk === "hou"
            ? lam.home
            : mk === "aou"
              ? lam.away
              : lam.home * a.halfShare.home + lam.away * a.halfShare.away;
      const what = mk === "ou" ? "toplam gol" : mk === "hou" ? `${m.home.name} golü` : mk === "aou" ? `${m.away.name} golü` : "ilk yarı golü";
      const side = a2 === "o" ? "Üst" : "Alt";
      // Eşdeğer çizgi: yurt dışı ihtimali ≥ iddaa'nın ima ettiği ihtimal (1/oran) olan en uç çizgi
      const need = 1 / l.odd;
      let equivLine: number | null = null;
      for (let L = 0.5; L <= 8.5; L += 1) {
        let pl: number;
        try {
          pl = probability(describe(`${mk}:${L}:${a2}`, m.home.name, m.away.name), ctx);
        } catch {
          continue;
        }
        if (pl >= need) {
          if (side === "Üst") equivLine = L; // Üst: en yüksek çizgi
          else if (equivLine === null) equivLine = L; // Alt: en düşük çizgi
        }
      }
      row.line = { line: lineNum, expected, side, what, equivLine };
    }
    rows.push(row);
  }
  return { a, rows, reference: m.euro.reference, expectedGoals: lam.home + lam.away };
}

/** Çizgi açığı: yurt dışı iddaa'nın bu oranını en az bir çizgi daha zor bir yerde veriyor */
export const lineGapSize = (r: GapRow) =>
  !r.line || r.line.equivLine === null ? 0 : r.line.side === "Üst" ? r.line.equivLine - r.line.line : r.line.line - r.line.equivLine;
export const isLineGap = (r: GapRow) => lineGapSize(r) >= 1;

/** Yaklaşan maçlarda açıkları tarar: açığı ≥ minGap olan seçenekler, en büyük açıktan */
export function scanGaps(analyses: Analysis[], minGap = 0.03, now = Date.now()): GapMatch[] {
  const out: GapMatch[] = [];
  for (const a of analyses) {
    if (new Date(a.match.kickoff).getTime() <= now) continue;
    const g = gapsFor(a);
    if (!g) continue;
    const rows = g.rows.filter((r) => r.gap >= minGap).sort((x, y) => y.gap - x.gap);
    if (rows.length) out.push({ ...g, rows });
  }
  return out.sort((x, y) => y.rows[0].gap - x.rows[0].gap);
}
