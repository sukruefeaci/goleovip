export const MAX_GOALS = 10;

const factorials: number[] = [1];
for (let i = 1; i <= 40; i++) factorials[i] = factorials[i - 1] * i;

export function pmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorials[k];
}

export function pmfVector(lambda: number, max = MAX_GOALS): number[] {
  const v: number[] = [];
  for (let k = 0; k <= max; k++) v.push(pmf(k, lambda));
  return v;
}

/** m[h][a] = P(ev sahibi h, deplasman a gol) — bağımsız Poisson */
export function scoreMatrix(lh: number, la: number, max = MAX_GOALS): number[][] {
  const ph = pmfVector(lh, max);
  const pa = pmfVector(la, max);
  return ph.map((x) => pa.map((y) => x * y));
}

export function probWhere(m: number[][], pred: (h: number, a: number) => boolean): number {
  let s = 0;
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) if (pred(h, a)) s += m[h][a];
  return s;
}

/** P(X > line), X ~ Poisson(lambda) */
export function poissonOver(line: number, lambda: number): number {
  let cdf = 0;
  for (let k = 0; k <= Math.floor(line); k++) cdf += pmf(k, lambda);
  return Math.max(0, 1 - cdf);
}

/**
 * Negatif binom: P(X > line), ortalama mu, dağılım parametresi k.
 * Var(X) = mu + mu²/k → Poisson'dan daha oynak. k → ∞ iken Poisson'a eşit olur.
 */
export function negBinOver(line: number, mu: number, k: number): number {
  if (!Number.isFinite(k) || k > 1e6) return poissonOver(line, mu);
  let p = Math.pow(k / (k + mu), k);
  let cdf = p;
  for (let y = 0; y < Math.floor(line); y++) {
    p *= ((y + k) / (y + 1)) * (mu / (k + mu));
    cdf += p;
  }
  return Math.max(0, 1 - cdf);
}

/** P(X > line) için lambda'yı ikili arama ile bulur */
export function lambdaForOver(line: number, pOver: number): number {
  let lo = 0.05;
  let hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (poissonOver(line, mid) < pOver) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Standart normal kümülatif dağılım */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
