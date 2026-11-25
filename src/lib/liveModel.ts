import type { SecondHalfStats } from "./types";
import type { LivePrior } from "./tracking";

/**
 * Canlı maç modeli.
 * Kalan süredeki gol sayısı Poisson kabul edilir. Dakika başı gol hızı:
 *   maç öncesi beklenti (ilk/ikinci yarı payıyla)  ×  tempo (canlı xG ya da şutlar)
 *   ×  skor durumu (geride olan daha çok, önde olan daha az atar; takımın geçmiş ikinci yarı tepkisi)
 *   ×  kırmızı kart.
 */

export interface LiveStats {
  xg?: [number, number];
  shots?: [number, number];
  sot?: [number, number];
  corners?: [number, number];
  poss?: [number, number];
  red?: [number, number];
}

export interface LiveState {
  minute: number; // oynanan dakika (devre arasında 45)
  phase: "1H" | "HT" | "2H";
  hg: number;
  ag: number;
  hht?: number; // ilk yarı skoru (2. yarıda)
  aht?: number;
  stats: LiveStats;
}

export interface LiveOutput {
  remaining: { h1: number; a1: number; h2: number; a2: number }; // kalan beklenen goller (1. yarı / 2. yarı)
  tempo: { factorH: number; factorA: number; label: "Yüksek" | "Normal" | "Düşük"; basis: string };
  reaction: { home: number; away: number; note: string } | null;
  probs: LiveBet[];
  confidence: number;
  notes: string[];
}

export type LiveKind = "İY A/Ü" | "MS A/Ü" | "KG" | "Sonuç" | "Sıradaki gol";

/** Sonradan değerlendirilebilmesi için önerinin yapısal tanımı */
export type LiveSpec =
  | { t: "ou1H"; line: number; over: boolean }
  | { t: "ouFT"; line: number; over: boolean }
  | { t: "btts"; yes: boolean }
  | { t: "res"; out: ("1" | "X" | "2")[] }
  | { t: "next"; home: boolean };

export interface LiveBet {
  label: string; // ör. "İY 0.5 Üst"
  prob: number;
  confidence: number;
  kind: LiveKind;
  spec: LiveSpec;
  odd?: number; // iddaa canlı oranı (varsa)
  ev?: number; // olasılık × oran − 1
  raw?: number; // öğrenme düzeltmesinden önceki model olasılığı
}

const DEFAULT_PRIOR: LivePrior = { lh: 1.45, la: 1.15, shareH: 0.45, shareA: 0.45, source: "market" };
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function pois(k: number, mu: number) {
  let p = Math.exp(-mu);
  for (let i = 1; i <= k; i++) p *= mu / i;
  return p;
}
/** P(X ≥ k) */
const atLeast = (k: number, mu: number) => {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = 0; i < k; i++) s += pois(i, mu);
  return Math.max(0, 1 - s);
};

/** Genel skor durumu etkisi (yayımlanmış çalışmalarla uyumlu, temkinli değerler) */
function genericState(diff: number): number {
  if (diff <= -2) return 1.25;
  if (diff === -1) return 1.15;
  if (diff === 1) return 0.9;
  if (diff >= 2) return 0.8;
  return 1;
}

/** Takımın ikinci yarı tepkisi: bu durumdaki 2. yarı golleri / genel 2. yarı golleri, az veriyle genel değere çekilir */
function teamReaction(sh: SecondHalfStats | undefined, diff: number): { f: number; n: number } {
  const g = genericState(diff);
  if (!sh || sh.all.n < 6 || sh.all.gf === 0) return { f: g, n: 0 };
  const st = diff > 0 ? sh.lead : diff < 0 ? sh.trail : sh.level;
  if (st.n === 0) return { f: g, n: 0 };
  const ratio = st.gf / st.n / (sh.all.gf / sh.all.n);
  const K = 8;
  return { f: clamp((st.n * ratio + K * g) / (st.n + K), 0.6, 1.6), n: st.n };
}

export function liveModel(state: LiveState, priorIn: LivePrior | null, statsAvailable: boolean): LiveOutput {
  const prior = priorIn ?? DEFAULT_PRIOR;
  const notes: string[] = [];
  const m = clamp(state.minute, 0, 95);
  const played = Math.max(1, state.phase === "1H" ? m : state.phase === "HT" ? 45 : m);

  // Maç öncesi dakika başı hızlar
  const r1h = (prior.lh * prior.shareH) / 45,
    r1a = (prior.la * prior.shareA) / 45;
  const r2h = (prior.lh * (1 - prior.shareH)) / 45,
    r2a = (prior.la * (1 - prior.shareA)) / 45;

  // Şimdiye kadar beklenen (maç öncesi) gol
  const expPlayedH = state.phase === "1H" ? r1h * m : r1h * 45 + r2h * Math.max(0, m - 45);
  const expPlayedA = state.phase === "1H" ? r1a * m : r1a * 45 + r2a * Math.max(0, m - 45);

  // Tempo: canlı xG, yoksa şutlardan tahmini xG
  const s = state.stats;
  let obsH: number | null = null,
    obsA: number | null = null,
    basis = "canlı istatistik yok";
  if (s.xg) {
    [obsH, obsA] = s.xg;
    basis = `xG ${s.xg[0].toFixed(2)}–${s.xg[1].toFixed(2)}`;
  } else if (s.shots && s.sot) {
    obsH = s.sot[0] * 0.3 + (s.shots[0] - s.sot[0]) * 0.04;
    obsA = s.sot[1] * 0.3 + (s.shots[1] - s.sot[1]) * 0.04;
    basis = `şut ${s.shots[0]}–${s.shots[1]} (isabetli ${s.sot[0]}–${s.sot[1]})`;
  }
  // Gözlemin ağırlığı oynanan süreyle artar (90 dk'da en fazla ~%55)
  const w = obsH === null ? 0 : clamp((played / (played + 45)) * 0.85, 0, 0.6);
  const factor = (obs: number | null, exp: number) => (obs === null ? 1 : clamp((w * obs + (1 - w) * exp) / Math.max(0.05, exp), 0.55, 1.7));
  const tH = factor(obsH, expPlayedH),
    tA = factor(obsA, expPlayedA);
  const tAll = obsH === null ? 1 : (w * (obsH + obsA!) + (1 - w) * (expPlayedH + expPlayedA)) / Math.max(0.05, expPlayedH + expPlayedA);
  const label = tAll >= 1.2 ? "Yüksek" : tAll <= 0.8 ? "Düşük" : "Normal";

  // Skor durumu ve takım tepkisi
  const diff = state.hg - state.ag;
  const rh = teamReaction(prior.homeSH, diff),
    ra = teamReaction(prior.awaySH, -diff);
  // İlk yarıda yalnız genel etki (yarısı), ikinci yarıda takıma özel tepki
  const stH1 = 1 + (genericState(diff) - 1) * 0.5,
    stA1 = 1 + (genericState(-diff) - 1) * 0.5;
  let reaction: LiveOutput["reaction"] = null;
  if (diff !== 0 || state.phase !== "1H") {
    const who = diff > 0 ? "ev sahibi önde" : diff < 0 ? "deplasman önde" : "skor eşit";
    reaction = {
      home: rh.f,
      away: ra.f,
      note:
        `${who}; ikinci yarı tepkisi ev ×${rh.f.toFixed(2)}${rh.n ? ` (${rh.n} benzer maç)` : ""}, ` +
        `deplasman ×${ra.f.toFixed(2)}${ra.n ? ` (${ra.n} benzer maç)` : ""}`,
    };
  }

  // Kırmızı kart
  const red = s.red ?? [0, 0];
  const redH = 0.75 ** red[0] * 1.2 ** red[1],
    redA = 0.75 ** red[1] * 1.2 ** red[0];
  if (red[0] || red[1]) notes.push(`Kırmızı kart: ${red[0]}–${red[1]}`);

  // Kalan süre (uzatmalar dahil yaklaşık)
  const rem1 = state.phase === "1H" ? Math.max(0.5, 47 - m) : 0;
  const rem2 = state.phase === "2H" ? Math.max(0.5, 93 - m) : 48;

  const remaining = {
    h1: r1h * rem1 * tH * stH1 * redH,
    a1: r1a * rem1 * tA * stA1 * redA,
    h2: r2h * rem2 * tH * rh.f * redH,
    a2: r2a * rem2 * tA * ra.f * redA,
  };

  // Güven: maç öncesi analiz, canlı istatistik ve oynanan süre
  let conf = 35;
  if (priorIn) conf += priorIn.source === "market" ? 22 : 14;
  if (s.xg) conf += 15;
  else if (s.shots) conf += 9;
  else if (!statsAvailable) conf -= 5;
  conf += Math.round((played / 90) * 12);
  const confidence = clamp(conf, 20, 90);

  // Olasılıklar
  const probs: LiveBet[] = [];
  const add = (label: string, prob: number, kind: LiveKind, spec: LiveSpec, confAdj = 0) =>
    probs.push({ label, prob, confidence: clamp(confidence + confAdj, 15, 92), kind, spec });
  const H = remaining.h1 + remaining.h2,
    A = remaining.a1 + remaining.a2,
    T = H + A;
  const goals = state.hg + state.ag;

  if (state.phase === "1H") {
    const T1 = remaining.h1 + remaining.a1;
    for (const k of [0, 1]) {
      const line = goals + k + 0.5;
      add(`İY ${line} Üst`, atLeast(k + 1, T1), "İY A/Ü", { t: "ou1H", line, over: true });
      add(`İY ${line} Alt`, 1 - atLeast(k + 1, T1), "İY A/Ü", { t: "ou1H", line, over: false });
    }
  }
  for (const k of [0, 1, 2]) {
    const line = goals + k + 0.5;
    add(`MS ${line} Üst`, atLeast(k + 1, T), "MS A/Ü", { t: "ouFT", line, over: true }, k > 0 ? -4 : 0);
    add(`MS ${line} Alt`, 1 - atLeast(k + 1, T), "MS A/Ü", { t: "ouFT", line, over: false }, k > 0 ? -4 : 0);
  }
  if (state.hg === 0 || state.ag === 0) {
    const kg = atLeast(state.hg === 0 ? 1 : 0, H) * atLeast(state.ag === 0 ? 1 : 0, A);
    add("KG Var", kg, "KG", { t: "btts", yes: true }, -3);
    add("KG Yok", 1 - kg, "KG", { t: "btts", yes: false }, -3);
  }
  // Maç sonucu: kalan goller bağımsız Poisson
  let p1 = 0,
    pX = 0,
    p2 = 0;
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const p = pois(i, H) * pois(j, A);
      const d = state.hg + i - (state.ag + j);
      if (d > 0) p1 += p;
      else if (d === 0) pX += p;
      else p2 += p;
    }
  add("MS 1", p1, "Sonuç", { t: "res", out: ["1"] }, -6);
  add("MS X", pX, "Sonuç", { t: "res", out: ["X"] }, -6);
  add("MS 2", p2, "Sonuç", { t: "res", out: ["2"] }, -6);
  add("Çifte şans 1X", p1 + pX, "Sonuç", { t: "res", out: ["1", "X"] }, -4);
  add("Çifte şans X2", pX + p2, "Sonuç", { t: "res", out: ["X", "2"] }, -4);
  // Sıradaki gol
  const anyGoal = 1 - Math.exp(-T);
  if (T > 0.05) {
    add("Sıradaki golü ev sahibi atar", (H / T) * anyGoal, "Sıradaki gol", { t: "next", home: true }, -8);
    add("Sıradaki golü deplasman atar", (A / T) * anyGoal, "Sıradaki gol", { t: "next", home: false }, -8);
  }

  if (!priorIn) notes.push("Maç öncesi analiz yok; lig ortalaması kullanıldı");
  if (!statsAvailable) notes.push("Bu maç için canlı istatistik yok");

  return {
    remaining,
    tempo: { factorH: tH, factorA: tA, label, basis },
    reaction,
    probs,
    confidence,
    notes,
  };
}

/** Önerilecek canlı bahisler: %60–%96 arası olasılık, olasılık × güven sırasıyla en iyi 3 */
export const LIVE_MIN_ODD = 1.45;
export const LIVE_MIN_PROB = 0.55;

/**
 * Önerilecek canlı bahisler: oran ≥ 1.45 (iddaa canlı oranı; yoksa olasılıktan adil oran) ve olasılık ≥ %55.
 * Olasılık × güven sırasıyla en iyi 3.
 */
export function liveRecommendations(out: LiveOutput, count = 3, minOdd = LIVE_MIN_ODD): LiveBet[] {
  return out.probs
    .filter((p) => p.prob >= LIVE_MIN_PROB && (p.odd ?? 1 / p.prob) >= minOdd)
    .sort((a, b) => b.prob * b.confidence - a.prob * a.confidence)
    .slice(0, count);
}

/**
 * Öğrenilmiş düzeltmeyi canlı olasılıklara uygular.
 * factor: tür başına çarpan (sabit tablo) ya da türe göre çarpan veren fonksiyon (duruma göre öğrenme).
 * Ham model olasılığı `raw` alanında saklanır; öğrenme ham olasılık üzerinden yapılır.
 */
export function calibrateLive(out: LiveOutput, factor: Partial<Record<LiveKind, number>> | ((kind: LiveKind) => number)): LiveOutput {
  for (const p of out.probs) {
    p.raw ??= p.prob;
    const f = typeof factor === "function" ? factor(p.kind) : factor[p.kind];
    if (f && f !== 1) p.prob = clamp(p.raw * f, 0.01, 0.99);
  }
  return out;
}
