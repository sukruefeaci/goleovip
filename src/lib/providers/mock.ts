import type { FormResult, MatchInput, OddsLine, TeamInput } from "../types";
import { buildContext, DEFAULT_KEYS, describe, probability } from "../markets";
import { probWhere } from "../poisson";

/**
 * Sahte veri. Her maç için gizli bir "gerçek" λ seçilir; Avrupa oranları bu λ'dan
 * düşük marjla (%2.5), iddaa oranları ise yüksek marjla (~%15) + gürültüyle üretilir.
 * Birkaç seçenekte "oran artırımı" simüle edilir ki tabloda avantajlı satırlar da görünsün.
 */

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Seed {
  id: string;
  league: string;
  kickoff: string;
  home: [string, string, number, number, FormResult[]];
  away: [string, string, number, number, FormResult[]];
  trueLambda: [number, number];
  corners: [number, number];
  missingHome?: TeamInput["missing"];
  missingAway?: TeamInput["missing"];
}

const SEEDS: Seed[] = [
  {
    id: "gal-avl",
    league: "UEFA Şampiyonlar Ligi",
    kickoff: "2026-11-24T17:45:00Z",
    home: ["Galatasaray", "GAL", 18, 6, ["G", "G", "G", "G", "G"]],
    away: ["Aston Villa", "AV", 6, 9, ["M", "B", "M", "B", "B"]],
    trueLambda: [1.55, 1.75],
    corners: [5.1, 4.9],
    missingHome: [{ name: "Icardi", role: "hücum" }, { name: "Torreira", role: "orta saha" }],
  },
  {
    id: "ars-bvb",
    league: "UEFA Şampiyonlar Ligi",
    kickoff: "2026-11-24T20:00:00Z",
    home: ["Arsenal", "ARS", 3, 10, ["M", "G", "G", "G", "B"]],
    away: ["B. Dortmund", "BD", 12, 9, ["G", "B", "G", "G", "G"]],
    trueLambda: [1.95, 0.85],
    corners: [5.9, 3.4],
    missingAway: [{ name: "Schlotterbeck", role: "defans" }],
  },
  {
    id: "rma-psv",
    league: "UEFA Şampiyonlar Ligi",
    kickoff: "2026-11-24T20:00:00Z",
    home: ["Real Madrid", "RM", 2, 12, ["G", "G", "G", "G", "G"]],
    away: ["PSV", "PSV", 24, 4, ["B", "G", "M", "G", "G"]],
    trueLambda: [3.3, 1.0],
    corners: [6.6, 3.2],
    missingHome: [{ name: "Endrick", role: "hücum" }, { name: "Rodrygo", role: "hücum" }, { name: "Asencio", role: "defans" }],
  },
  {
    id: "fb-bjk",
    league: "Süper Lig",
    kickoff: "2026-11-29T16:00:00Z",
    home: ["Fenerbahçe", "FB", 2, 31, ["G", "G", "B", "G", "M"]],
    away: ["Beşiktaş", "BJK", 4, 26, ["G", "M", "G", "B", "G"]],
    trueLambda: [1.7, 1.15],
    corners: [5.8, 4.4],
    missingAway: [{ name: "Immobile", role: "hücum" }],
  },
  {
    id: "ts-gs-u",
    league: "Süper Lig",
    kickoff: "2026-11-30T17:00:00Z",
    home: ["Trabzonspor", "TS", 5, 24, ["B", "G", "G", "M", "G"]],
    away: ["Samsunspor", "SAM", 7, 20, ["G", "B", "B", "G", "M"]],
    trueLambda: [1.45, 1.05],
    corners: [5.2, 4.1],
  },
];

function poissonSample(lambda: number, r: () => number) {
  const L = Math.exp(-lambda);
  let k = 0,
    p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

function team(s: Seed["home"], lf: number, la: number, corners: number, cornersAg: number, r: () => number, missing: TeamInput["missing"] = []): TeamInput {
  const noise = () => 0.85 + r() * 0.3;
  return {
    name: s[0],
    short: s[1],
    rank: s[2],
    points: s[3],
    form: s[4],
    goalsFor10: Array.from({ length: 10 }, () => poissonSample(lf * noise(), r)),
    goalsAgainst10: Array.from({ length: 10 }, () => poissonSample(la * noise(), r)),
    cornersFor: Number((corners * noise()).toFixed(1)),
    cornersAgainst: Number((cornersAg * noise()).toFixed(1)),
    cards: Number((1.6 + r() * 1.2).toFixed(1)),
    missing,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function buildMockMatch(s: Seed, now = new Date()): MatchInput {
  const r = rng(s.id);
  const [lh, la] = s.trueLambda;
  const home = team(s.home, lh, la, s.corners[0], s.corners[1], r, s.missingHome);
  const away = team(s.away, la, lh, s.corners[1], s.corners[0], r, s.missingAway);
  const ctx = buildContext(lh, la, s.corners[0], s.corners[1], home.cards + away.cards);

  // Avrupa (Pinnacle benzeri) — küçük sapma + %2.5 marj
  const jitter = () => 1 + (r() - 0.5) * 0.04;
  const p1 = probWhere(ctx.ft, (h, a) => h > a) * jitter();
  const pX = probWhere(ctx.ft, (h, a) => h === a) * jitter();
  const p2 = probWhere(ctx.ft, (h, a) => h < a) * jitter();
  const sum = p1 + pX + p2;
  const pO = probWhere(ctx.ft, (h, a) => h + a > 2.5) * jitter();
  const m = 1.025;
  const cornerLine = 9.5;
  const pCo = probability(describe("cor:9.5:o"), ctx) * jitter();

  // iddaa — yüksek marj + gürültü, birkaç seçenekte oran artırımı
  const boosted = new Set<number>();
  while (boosted.size < 2) boosted.add(Math.floor(r() * DEFAULT_KEYS.length));
  const iddaa: OddsLine[] = [];
  DEFAULT_KEYS.forEach((key, i) => {
    const p = probability(describe(key), ctx);
    if (p < 0.02 || p > 0.97) return;
    const margin = boosted.has(i) ? 0.85 : 1.13 + r() * 0.06;
    const noisy = 1 + (r() - 0.5) * 0.08;
    const odd = round2(Math.max(1.01, (1 / (p * margin)) * noisy));
    if (odd >= 1.05 && odd < 40) iddaa.push({ key, odd });
  });

  const h2h = Array.from({ length: 4 }, () => ({ home: poissonSample(lh, r), away: poissonSample(la, r) }));
  const ts = new Date(now.getTime() - 60_000).toISOString();

  return {
    id: s.id,
    league: s.league,
    kickoff: s.kickoff,
    home,
    away,
    headToHead: h2h,
    euro: {
      bookmakers: 23,
      reference: "Pinnacle",
      h2h: [round2(1 / ((p1 / sum) * m)), round2(1 / ((pX / sum) * m)), round2(1 / ((p2 / sum) * m))],
      ou25: [round2(1 / (pO * m)), round2(1 / ((1 - pO) * m))],
      corners: { line: cornerLine, over: round2(1 / (pCo * m)), under: round2(1 / ((1 - pCo) * m)) },
    },
    iddaa,
    updatedAt: ts,
    warnings: ["Prototip: tüm oran ve istatistikler sahte (mock) veridir."],
  };
}

export const mockProvider = {
  name: "mock",
  async listMatches(): Promise<MatchInput[]> {
    return SEEDS.map((s) => buildMockMatch(s));
  },
  async getMatch(id: string): Promise<MatchInput | null> {
    const s = SEEDS.find((x) => x.id === id);
    return s ? buildMockMatch(s) : null;
  },
};
