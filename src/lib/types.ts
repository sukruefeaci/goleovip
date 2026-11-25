export type FormResult = "G" | "B" | "M";

export interface MissingPlayer {
  name: string;
  role: "hücum" | "orta saha" | "defans" | "kaleci";
}

export interface TeamInput {
  name: string;
  short: string;
  rank: number;
  points: number;
  form: FormResult[]; // son 5, en eski → en yeni
  goalsFor10: number[]; // son 10 maç attığı gol
  goalsAgainst10: number[]; // son 10 maç yediği gol
  cornersFor: number; // maç başı kazandığı korner (son 6)
  cornersAgainst: number; // maç başı rakibe verdiği korner (son 6)
  cards: number; // maç başı gördüğü kart (son 6)
  missing: MissingPlayer[];
  /** Geçmiş maçlardan: attığı gollerin ilk yarıda atılan payı ve kaç golden hesaplandığı */
  halfShareFor?: { share: number; goals: number };
  /** Geçmiş maçlardan: yediği gollerin ilk yarıda yenen payı */
  halfShareAgainst?: { share: number; goals: number };
  /** Son maçların İY/MS sonuçları takımın gözünden, ör. "G/G" (İY önde, maçı kazandı), "B/M" */
  htftHistory?: string[];
}

/** Tek bir iddaa seçeneği. key formatı: src/lib/markets.ts */
export interface OddsLine {
  key: string;
  odd: number;
  mbc?: number; // iddaa minimum bahis sayısı (kuponda en az kaç maç)
}

export interface EuroMarket {
  bookmakers: number;
  reference: string; // ör. "Pinnacle"
  h2h: [number, number, number]; // 1 / X / 2 oranları
  ou25: [number, number]; // Üst / Alt 2.5 oranları
  corners?: { line: number; over: number; under: number };
}

export interface MatchInput {
  id: string;
  league: string;
  kickoff: string; // ISO
  home: TeamInput;
  away: TeamInput;
  headToHead: { home: number; away: number }[];
  euro: EuroMarket;
  iddaa: OddsLine[];
  updatedAt: string;
  warnings: string[];
}

export type Category = "Sonuç" | "Gol" | "İlk Yarı" | "İY/MS" | "Korner" | "Kart";
export const CATEGORIES: Category[] = ["Sonuç", "Gol", "İlk Yarı", "İY/MS", "Korner", "Kart"];

export type Rating = "Avantajlı" | "Sınırda" | "Dezavantajlı";

export interface BetRow {
  key: string;
  category: Category;
  market: string;
  selection: string;
  odd: number;
  required: number; // 1/oran
  prob: number; // harman model olasılığı
  sigma: number; // belirsizlik (std)
  ev: number; // prob*odd - 1
  evConservative: number; // (prob - sigma)*odd - 1
  edgeChance: number; // P(gerçek olasılık > gereken)
  basis: string;
  rating: Rating;
  dependsOn: "home" | "away" | null; // seçenek büyük ölçüde bir tarafın galibiyetine bağlı mı
  mbc: number; // iddaa minimum bahis sayısı
}

export interface Analysis {
  match: MatchInput;
  euroFair: [number, number, number];
  euroMargin: number;
  iddaaOdds: [number, number, number] | null;
  iddaaFair: [number, number, number] | null;
  iddaaMargin: number | null;
  model1x2: [number, number, number];
  lambda: { home: number; away: number };
  lambdaMarket: { home: number; away: number };
  lambdaStats: { home: number; away: number };
  cornerLambda: { home: number; away: number };
  cornerLambdaMarket: { home: number; away: number } | null;
  euroOver25: number;
  attackPenalty: { home: number; away: number };
  /** İlk yarıya düşen gol payı (ev, deplasman) */
  halfShare: { home: number; away: number };
  /** 9 İY/MS sonucunun model olasılığı (iddaa oranı olsun olmasın) */
  htft: { outcome: string; prob: number }[];
  rows: BetRow[];
}
