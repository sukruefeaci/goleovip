import type { OddsLine } from "./types";
import type { HistMatch } from "./history";
import { describe, htftDistribution, HALF_TIME_SHARE, type MarketDef } from "./markets";
import { lambdaForOver, pmfVector } from "./poisson";

/**
 * Seçenek bazında oran eşleştirme.
 *
 * Geçmiş maçlarda yalnız 1X2 ve Alt/Üst 2.5 oranları kayıtlı. Diğer pazarların (KG, İY, İY/MS,
 * diğer alt/üst çizgileri, sonuç+alt/üst …) o maçtaki adil olasılığı, maçın 1X2 + Alt/Üst 2.5
 * oranlarına oturtulan Poisson gol beklentisinden türetilir. Bugünkü iddaa seçeneğinin marjsız
 * olasılığına yakın olan geçmiş maçlar bulunur ve o seçeneğin gerçekte kaç kez kazandığı sayılır.
 */

const N = 8; // 0–8 gol (olasılığın >%99.9'u); hız için

/** Bir geçmiş maçın gol beklentisi (λ ev, λ dep): Alt/Üst 2.5'ten toplam, 1X2'den paylaşım */
function fitLambdas(m: HistMatch): [number, number] {
  const total = m.pOver !== undefined ? lambdaForOver(2.5, m.pOver) : 2.6;
  const target = m.p[0] - m.p[2];
  let lo = 0.03,
    hi = 0.97;
  for (let i = 0; i < 28; i++) {
    const s = (lo + hi) / 2;
    const ph = pmfVector(total * s, N),
      pa = pmfVector(total * (1 - s), N);
    let p1 = 0,
      p2 = 0;
    for (let h = 0; h <= N; h++)
      for (let a = 0; a <= N; a++) {
        if (h > a) p1 += ph[h] * pa[a];
        else if (h < a) p2 += ph[h] * pa[a];
      }
    if (p1 - p2 < target) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return [total * s, total * (1 - s)];
}

const lambdaCache = new WeakMap<HistMatch, [number, number]>();
const lambdas = (m: HistMatch) => {
  let v = lambdaCache.get(m);
  if (!v) lambdaCache.set(m, (v = fitLambdas(m)));
  return v;
};

function probFromLambdas(lh: number, la: number, pred: (h: number, a: number) => boolean) {
  const ph = pmfVector(lh, N),
    pa = pmfVector(la, N);
  let s = 0;
  for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) if (pred(h, a)) s += ph[h] * pa[a];
  return s;
}

/** Desteklenen pazarlar: oranlardan türetilebilenler (korner/kart hariç) */
export const derivable = (def: MarketDef) => def.kind === "ft" || def.kind === "ht" || def.kind === "htft";

/** Geçmiş maçta bu seçeneğin adil olasılığı (kayıtlıysa gerçek orandan, değilse türetilmiş) */
function pastProb(m: HistMatch, def: MarketDef): number | null {
  const k = def.key;
  if (k === "1x2:1") return m.p[0];
  if (k === "1x2:X") return m.p[1];
  if (k === "1x2:2") return m.p[2];
  if (m.pOver !== undefined && k === "ou:2.5:o") return m.pOver;
  if (m.pOver !== undefined && k === "ou:2.5:u") return 1 - m.pOver;
  const [lh, la] = lambdas(m);
  if (def.kind === "ft") return probFromLambdas(lh, la, def.pred!);
  if (def.kind === "ht") return probFromLambdas(lh * HALF_TIME_SHARE, la * HALF_TIME_SHARE, def.pred!);
  if (def.kind === "htft") return htftCache(m)[def.selection] ?? null;
  return null;
}

const htftStore = new WeakMap<HistMatch, Record<string, number>>();
function htftCache(m: HistMatch) {
  let v = htftStore.get(m);
  if (!v) {
    const [lh, la] = lambdas(m);
    htftStore.set(m, (v = htftDistribution(lh, la, HALF_TIME_SHARE, HALF_TIME_SHARE)));
  }
  return v;
}

/** Geçmiş maçta bu seçenek kazandı mı? (ilk yarı skoru yoksa null) */
function won(m: HistMatch, def: MarketDef): boolean | null {
  if (def.kind === "ft") return def.pred!(m.hg, m.ag);
  if (m.hht === undefined || m.aht === undefined) return null;
  if (def.kind === "ht") return def.pred!(m.hht, m.aht);
  if (def.kind === "htft") {
    const r = (d: number) => (d > 0 ? "1" : d === 0 ? "X" : "2");
    return `${r(m.hht - m.aht)}/${r(m.hg - m.ag)}` === def.selection;
  }
  return null;
}

// Seçenek başına geçmiş olasılık dizisi (aynı arşiv için önbellek)
const arrayCache = new WeakMap<HistMatch[], Map<string, Float32Array>>();
function pastArray(history: HistMatch[], def: MarketDef): Float32Array {
  let byKey = arrayCache.get(history);
  if (!byKey) arrayCache.set(history, (byKey = new Map()));
  let arr = byKey.get(def.key);
  if (!arr) {
    arr = new Float32Array(history.length);
    for (let i = 0; i < history.length; i++) arr[i] = pastProb(history[i], def) ?? Number.NaN;
    byKey.set(def.key, arr);
  }
  return arr;
}

// Pazarın kaç seçeneği olduğu (marjı doğru atmak için); dc'de olasılıklar toplamı 2
const GROUP_SIZE: Record<string, number> = { "1x2": 3, dc: 3, ou: 2, hou: 2, aou: 2, btts: 2, res_ou: 6, ou_btts: 4, tg: 4, ht1x2: 3, htou: 2, htft: 9 };

/** iddaa seçeneklerinin marjsız olasılıkları: pazar tamamsa kendi marjıyla, değilse 1X2 marjıyla */
export function fairProbs(lines: OddsLine[], home = "Ev Sahibi", away = "Deplasman"): Map<string, number> {
  const groups = new Map<string, { key: string; odd: number }[]>();
  for (const l of lines) {
    let def: MarketDef;
    try {
      def = describe(l.key, home, away);
    } catch {
      continue;
    }
    const g = def.market;
    groups.set(g, [...(groups.get(g) ?? []), { key: l.key, odd: l.odd }]);
  }
  const m1x2 = groups.get("Maç Sonucu");
  const baseMargin = m1x2 && m1x2.length === 3 ? m1x2.reduce((s, x) => s + 1 / x.odd, 0) - 1 : 0.15;
  const out = new Map<string, number>();
  for (const items of groups.values()) {
    const prefix = items[0].key.split(":")[0];
    const expected = GROUP_SIZE[prefix];
    const total = prefix === "dc" ? 2 : 1;
    const sum = items.reduce((s, x) => s + 1 / x.odd, 0);
    const margin = expected && items.length === expected ? sum / total - 1 : baseMargin;
    for (const it of items) out.set(it.key, 1 / it.odd / (1 + Math.max(0, margin)));
  }
  return out;
}

export interface SelectionMatch {
  key: string;
  category: string;
  market: string;
  selection: string;
  odd: number;
  fair: number; // bugünkü marjsız olasılık
  supported: boolean;
  n: number; // benzer geçmiş maç
  hits: number;
  rate: number;
  roi: number | null; // rate × iddaa oranı − 1
  examples: { m: HistMatch; p: number; won: boolean }[]; // en yakın 10
}

/** Bir maçın tüm iddaa seçenekleri için geçmiş eşleştirme */
export function matchAllSelections(
  lines: OddsLine[],
  history: HistMatch[],
  tolerance: number,
  home: string,
  away: string,
  minOdd = 0,
): SelectionMatch[] {
  const fair = fairProbs(lines, home, away);
  const out: SelectionMatch[] = [];
  for (const l of lines) {
    if (l.odd < minOdd) continue;
    let def: MarketDef;
    try {
      def = describe(l.key, home, away);
    } catch {
      continue;
    }
    const f = fair.get(l.key) ?? 1 / l.odd;
    const base = { key: l.key, category: def.category, market: def.market, selection: def.selection, odd: l.odd, fair: f };
    if (!derivable(def)) {
      out.push({ ...base, supported: false, n: 0, hits: 0, rate: 0, roi: null, examples: [] });
      continue;
    }
    // düşük olasılıklarda mutlak tolerans fazla geniş kalır: orantılı daralt
    const tol = tolerance * Math.min(1, Math.max(0.3, f / 0.35));
    const arr = pastArray(history, def);
    const idx: { i: number; d: number }[] = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!Number.isNaN(p) && Math.abs(p - f) <= tol) idx.push({ i, d: Math.abs(p - f) });
    }
    let n = 0,
      hits = 0;
    const scored: { m: HistMatch; p: number; won: boolean; d: number }[] = [];
    for (const { i, d } of idx) {
      const w = won(history[i], def);
      if (w === null) continue;
      n++;
      if (w) hits++;
      scored.push({ m: history[i], p: arr[i], won: w, d });
    }
    scored.sort((a, b) => a.d - b.d);
    const rate = n ? hits / n : 0;
    out.push({
      ...base,
      supported: true,
      n,
      hits,
      rate,
      roi: n ? rate * l.odd - 1 : null,
      examples: scored.slice(0, 10).map(({ m, p, won }) => ({ m, p, won })),
    });
  }
  return out;
}

export const ODDS_PICK_MIN = 1.6;

/** Oran sayfası için tek tercih: oran ≥ 1.60, en az 150 benzer maç, en az %40 kazanmış; beklenen getirisi en yüksek */
export function bestOddsPick(sel: SelectionMatch[]): SelectionMatch | null {
  const pool = sel.filter((s) => s.supported && s.odd >= ODDS_PICK_MIN && s.n >= 150);
  const reliable = pool.filter((s) => s.rate >= 0.4).sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1));
  if (reliable.length) return reliable[0];
  return pool.sort((a, b) => b.rate - a.rate)[0] ?? null;
}
