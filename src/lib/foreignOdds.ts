import { afKey, findAfOdds, loadAfDay, type AfOdds } from "./providers/apiFootball";
import { loadOpDay } from "./providers/oddsPapi";
import type { Analysis } from "./types";

/** Maça yurt dışı oranlarını veren fonksiyon: önce OddsPapi (Pinnacle), sonra API-Football */
export async function foreignOddsLookup(now = Date.now()): Promise<(a: Analysis) => AfOdds | null> {
  const dates = [0, 1, 2].map((i) => new Date(now + i * 86400_000).toISOString().slice(0, 10));
  const [opDay, afDays] = await Promise.all([loadOpDay(), afKey() ? Promise.all(dates.map((d) => loadAfDay(d))) : Promise.resolve([])]);
  return (a) => {
    const m = { home: a.match.home.name, away: a.match.away.name, kickoff: a.match.kickoff };
    return findAfOdds([opDay], m)?.odds ?? findAfOdds(afDays, m)?.odds ?? null;
  };
}
