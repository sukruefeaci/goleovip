import type { Analysis, BetRow } from "./types";

export type PickLevel = "güçlü" | "zayıf" | "değer yok";

export interface Pick {
  row: BetRow;
  level: PickLevel;
  /** Şablon gerekçe — yapay zeka yorumu yoksa gösterilir */
  reasons: string[];
  alternatives: BetRow[];
}

const pct = (x: number, d = 1) => `%${(x * 100).toFixed(d)}`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}%${Math.abs(x * 100).toFixed(1)}`;

/** Makul oran aralığı: çok düşük oranlar getiri vermez, çok yüksekler fazla belirsiz */
const MIN_ODD = 1.3;
const MAX_ODD = 6;

/** Sıralama puanı: önce temkinli getiri, eşitlikte avantaj ihtimali */
const score = (r: BetRow) => r.evConservative + 0.02 * r.edgeChance;

/**
 * Modelin tercihi. Avantajlı seçenek varsa en iyisi ("güçlü"); yoksa artı getirili
 * ama belirsizliği yüksek olan ("zayıf"); hiçbiri yoksa en az kayıplı seçenek ("değer yok").
 */
export function choosePick(a: Analysis): Pick | null {
  const pool = a.rows.filter((r) => r.odd >= MIN_ODD && r.odd <= MAX_ODD);
  if (!pool.length) return null;
  const ranked = [...pool].sort((x, y) => score(y) - score(x));
  const strong = ranked.filter((r) => r.evConservative > 0);
  const weak = [...pool].filter((r) => r.ev > 0).sort((x, y) => y.ev - x.ev || score(y) - score(x));

  let row: BetRow;
  let level: PickLevel;
  if (strong.length) {
    row = strong[0];
    level = "güçlü";
  } else if (weak.length) {
    row = weak[0];
    level = "zayıf";
  } else {
    row = [...pool].sort((x, y) => y.ev - x.ev)[0];
    level = "değer yok";
  }

  const reasons: string[] = [];
  reasons.push(
    `Model bu seçeneğe ${pct(row.prob)} (±${(row.sigma * 100).toFixed(1)}) ihtimal veriyor; ${row.odd.toFixed(2)} oranın başa baş noktası ${pct(row.required)}.`,
  );
  if (level === "güçlü") {
    reasons.push(`Belirsizliğin kötü ucunda bile getiri ${signed(row.evConservative)}; avantaj ihtimali ${pct(row.edgeChance, 0)}.`);
  } else if (level === "zayıf") {
    reasons.push(
      `Beklenen getiri ${signed(row.ev)} ama belirsizlik hesaba katılınca ${signed(row.evConservative)}'e düşüyor; avantaj ihtimali ${pct(row.edgeChance, 0)}. Küçük miktarla veya hiç oynanmamalı.`,
    );
  } else {
    reasons.push(
      `Hiçbir seçenek başa baş noktasını geçmiyor${a.iddaaMargin !== null ? ` (iddaa marjı ${pct(a.iddaaMargin)})` : ""}. Bu, en az kayıplı seçenek (${signed(row.ev)}); en mantıklı tercih bu maçı oynamamak.`,
    );
  }
  if (row.dependsOn) reasons.push(`Bu seçenek büyük ölçüde ${row.dependsOn === "home" ? a.match.home.name : a.match.away.name} galibiyetine bağlı.`);
  if (row.category === "Korner" || row.category === "Kart") reasons.push("Bu pazar için Avrupa oranı yok; tahmin yalnız istatistiğe dayanıyor.");
  reasons.push(`Dayanak: ${row.basis}`);

  const alternatives = ranked.filter((r) => r.key !== row.key).slice(0, 3);
  return { row, level, reasons, alternatives };
}
