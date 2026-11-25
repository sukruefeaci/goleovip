import type { Analysis } from "./types";
import { findSimilar, outcomeStats, TOLERANCE, type HistMatch, type OutcomeStat, type ToleranceKey } from "./history";

export interface OddsAnalysis {
  analysis: Analysis;
  iddaa1x2: [number, number, number] | null;
  target: [number, number, number]; // karşılaştırmada kullanılan adil olasılıklar
  targetSource: "iddaa" | "model";
  similar: (HistMatch & { d: number })[];
  /** Gol pazarları için: 2.5 alt/üst olasılığı da benzer olan alt küme */
  goalSimilar: (HistMatch & { d: number })[];
  targetOver: number | null;
  stats: (OutcomeStat & { rate: number; odd?: number; roi?: number })[];
}

/** Yaklaşan maçın iddaa MS oranlarını (marjı atılarak) geçmiş maçlarla karşılaştırır */
export function analyzeOdds(a: Analysis, history: HistMatch[], tol: ToleranceKey = "normal"): OddsAnalysis {
  const iddaa1x2 = a.iddaaOdds;
  const target = (a.iddaaFair ?? a.euroFair) as [number, number, number];
  const similar = findSimilar(history, target, TOLERANCE[tol]);
  const odd = (k: string) => a.match.iddaa.find((l) => l.key === k)?.odd;
  // Gol pazarları: iddaa 2.5 alt/üst (marjsız) olasılığına da yakın maçlar
  const o = odd("ou:2.5:o"),
    u = odd("ou:2.5:u");
  const targetOver = o && u ? 1 / o / (1 / o + 1 / u) : null;
  const goalTol = TOLERANCE[tol] * 1.5;
  const overSubset = targetOver === null ? [] : similar.filter((m) => m.pOver !== undefined && Math.abs(m.pOver - targetOver) <= goalTol);
  const goalSimilar = overSubset.length >= 20 ? overSubset : similar;
  const GOAL_KEYS = /^(ou|btts):/;
  const resultStats = outcomeStats(similar).filter((s) => !GOAL_KEYS.test(s.key));
  const goalStats = outcomeStats(goalSimilar).filter((s) => GOAL_KEYS.test(s.key));
  const stats = [...resultStats.slice(0, 6), ...goalStats, ...resultStats.slice(6)].map((s) => {
    const rate = s.n ? s.hits / s.n : 0;
    const o = odd(s.key);
    return { ...s, rate, odd: o, roi: o && s.n ? rate * o - 1 : undefined };
  });
  return { analysis: a, iddaa1x2, target, targetSource: a.iddaaFair ? "iddaa" : "model", similar, goalSimilar, targetOver, stats };
}
