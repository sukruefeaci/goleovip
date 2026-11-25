import type { Analysis, BetRow } from "./types";

/**
 * Günün seçkisi: Türkiye saatiyle 13:00–18:59 arasında başlayan maçlardan,
 * her saat dilimi için en sağlam tercihi en güçlü 2 maç.
 */

export const DAILY_HOURS = [13, 14, 15, 16, 17, 18];
export const PER_SLOT = 2;
const TR_OFFSET = 3 * 3600_000; // Türkiye UTC+3 (yaz saati uygulanmıyor)

export interface DailyPick {
  analysis: Analysis;
  row: BetRow;
  score: number;
}

export interface DailySlot {
  hour: number;
  picks: DailyPick[];
}

export interface Daily {
  date: string; // YYYY-MM-DD (Türkiye)
  isToday: boolean;
  slots: DailySlot[];
}

const trDate = (ms: number) => new Date(ms + TR_OFFSET);

/** Maçın en sağlam tercihi: makul oran, en az %45 kazanma olasılığı; güven + olasılık birlikte */
export function bestRow(a: Analysis): { row: BetRow; score: number } | null {
  const pool = a.rows.filter((r) => r.odd >= 1.3 && r.odd <= 3 && r.prob >= 0.45);
  let best: { row: BetRow; score: number } | null = null;
  for (const row of pool) {
    const score = row.confidence + 30 * row.prob;
    if (!best || score > best.score) best = { row, score };
  }
  return best;
}

export function selectDaily(analyses: Analysis[], now = Date.now()): Daily {
  const local = trDate(now);
  // 19:00'dan sonra yarının seçkisi
  const target = local.getUTCHours() >= 19 ? trDate(now + 86400_000) : local;
  const date = target.toISOString().slice(0, 10);

  const slots: DailySlot[] = DAILY_HOURS.map((hour) => {
    const candidates = analyses
      .filter((a) => {
        const ko = trDate(new Date(a.match.kickoff).getTime());
        return ko.toISOString().slice(0, 10) === date && ko.getUTCHours() === hour && new Date(a.match.kickoff).getTime() > now;
      })
      .map((a) => {
        const b = bestRow(a);
        return b ? { analysis: a, row: b.row, score: b.score } : null;
      })
      .filter((x): x is DailyPick => x !== null)
      .sort((x, y) => y.score - x.score);
    return { hour, picks: candidates.slice(0, PER_SLOT) };
  });

  return { date, isToday: date === local.toISOString().slice(0, 10), slots };
}
