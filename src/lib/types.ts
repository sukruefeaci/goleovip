export type FormResult = "G" | "B" | "M";

export interface StateGoals {
  n: number;
  gf: number;
  ga: number;
}
export interface SecondHalfStats {
  lead: StateGoals;
  level: StateGoals;
  trail: StateGoals;
  all: StateGoals;
}

export interface MissingPlayer {
  name: string;
  role: "hücum" | "orta saha" | "defans" | "kaleci" | "belirsiz";
  /** Eksiklik nedeni: sakat, cezalı, milli takım … */
  reason?: string;
  /** Tahmini dönüş, ör. "Early December 2026" */
  returnText?: string;
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
  /** İkinci yarı tepkisi: ilk yarıyı önde / berabere / geride bitirdiği maçlarda ikinci yarıda attığı ve yediği goller */
  secondHalf?: SecondHalfStats;
  /** Kazandığı korner ortalaması: evinde, deplasmanda ve genel (son 10'ar maç) */
  cornerSplit?: { home: number | null; away: number | null; overall: number | null; homeN: number; awayN: number };
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
  /** FotMob eşleşmesi (sakat/cezalı listesi buradan) */
  fotmob?: { matchId: number; predicted: boolean };
  /** Olasılık kaynağı: "market" = Avrupa bahis piyasası (varsayılan), "elo" = ClubElo güç puanı */
  source?: "market" | "elo" | "iddaa";
  /** ClubElo maçlarında: ClubElo ile iddaa'nın marjsız 1/X/2 olasılıkları arasındaki en büyük fark (0–1); iddaa 1X2 yoksa null */
  eloDisagreement?: number | null;
  /** Ligin bu sezonki maç başı korner ortalaması (ev sahibi / deplasman) */
  leagueCorners?: { home: number; away: number };
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
  prob: number; // harman model olasılığı (öğrenme düzeltmeleri uygulanmış)
  probModel?: number; // modelin ham olasılığı (tür düzeltmesinden önce)
  probPreBand?: number; // aralık (kalibrasyon) düzeltmesinden önceki olasılık
  sigma: number; // belirsizlik (std)
  ev: number; // prob*odd - 1
  evConservative: number; // (prob - sigma)*odd - 1
  edgeChance: number; // P(gerçek olasılık > gereken)
  basis: string;
  rating: Rating;
  dependsOn: "home" | "away" | null; // seçenek büyük ölçüde bir tarafın galibiyetine bağlı mı
  mbc: number; // iddaa minimum bahis sayısı
  /** Güven puanı 0–100: tahminin ne kadar sağlam olduğu (bkz. model.ts confidenceFor) */
  confidence: number;
  confidenceParts: ConfidencePart[];
}

export interface ConfidencePart {
  label: string; // ör. "Veri kaynağı"
  score: number; // 0–1
  weight: number; // 0–1, toplamı 1
  note: string; // kullanıcıya açıklama
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
  /** Geçmiş tahminlerden öğrenilip uygulanan olasılık çarpanları (tercih türü → çarpan) */
  calibration?: Record<string, number>;
  /** Maç özeti (maç sayfasının üstü) */
  summary: {
    over25: number;
    btts: number;
    topScores: { score: string; prob: number }[];
    corners: { expected: number; line: number; over: number } | null;
  };
  /** 9 İY/MS sonucunun model olasılığı (iddaa oranı olsun olmasın) */
  htft: { outcome: string; prob: number }[];
  rows: BetRow[];
}
