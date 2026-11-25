import { getProvider } from "./providers";
import { analyze } from "./model";
import type { Analysis } from "./types";
import type { CouponMatch } from "./coupon";

/** Sayfaların ortak kullandığı: tüm maçların analizi (başlama saatine göre sıralı) */
export async function loadAnalyses(): Promise<{ analyses: Analysis[]; source: string; banner?: string }> {
  const provider = getProvider();
  const matches = await provider.listMatches();
  const analyses = matches.map(analyze).sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));
  return { analyses, source: provider.name, banner: analyses[0]?.match.warnings.find((w) => w.startsWith("Canlı")) };
}

/** Kupon / banko hesapları için sade veri (istemciye gönderilir) */
export function toCouponMatches(analyses: Analysis[]): CouponMatch[] {
  return analyses.map((a) => ({
    id: a.match.id,
    home: a.match.home.name,
    away: a.match.away.name,
    league: a.match.league,
    kickoff: a.match.kickoff,
    options: a.rows.map((r) => ({
      key: r.key,
      market: r.market,
      selection: r.selection,
      category: r.category,
      odd: r.odd,
      prob: r.prob,
      sigma: r.sigma,
      ev: r.ev,
      mbc: r.mbc,
    })),
  }));
}
