import type { MatchInput, MissingPlayer } from "../types";
import { cachedFetch } from "./cache";
import { nameSimilarity } from "./teamNames";

/**
 * FotMob (fotmob.com) — resmi olmayan, herkese açık JSON. Yalnız kişisel kullanım için eklendi.
 * Kullanılan uç noktalar (2026-11 itibarıyla imza/giriş istemiyor):
 *   /api/data/matches?date=YYYYMMDD        → günün maçları (id, takımlar, status.utcTime)
 *   /api/data/matchDetails?matchId=ID      → content.lineup.{homeTeam,awayTeam}.unavailable (sakat/cezalı)
 * Bir uç nokta imza ya da giriş isterse atlanır; site FotMob'suz çalışmaya devam eder.
 */

const BASE = "https://www.fotmob.com/api/data";
const MIN = 60_000;

export interface FotmobMatch {
  id: number;
  kickoff: Date;
  home: string;
  away: string;
}

interface RawUnavailable {
  name?: string;
  unavailability?: { type?: string; expectedReturn?: string };
}

export function parseFotmobMatches(json: unknown): FotmobMatch[] {
  const out: FotmobMatch[] = [];
  const leagues = (json as { leagues?: { matches?: unknown[] }[] })?.leagues ?? [];
  for (const l of leagues)
    for (const m of (l.matches ?? []) as {
      id?: number;
      home?: { name?: string };
      away?: { name?: string };
      status?: { utcTime?: string; started?: boolean; cancelled?: boolean };
    }[]) {
      const t = m.status?.utcTime ? new Date(m.status.utcTime) : null;
      if (!m.id || !t || Number.isNaN(t.getTime()) || !m.home?.name || !m.away?.name || m.status?.cancelled) continue;
      out.push({ id: m.id, kickoff: t, home: m.home.name, away: m.away.name });
    }
  return out;
}

const REASON: Record<string, string> = {
  injury: "sakat",
  suspension: "cezalı",
  internationalDuty: "milli takım",
};

export function parseUnavailable(json: unknown): { home: MissingPlayer[]; away: MissingPlayer[]; predicted: boolean } | null {
  const lu = (json as { content?: { lineup?: Record<string, unknown> } })?.content?.lineup as
    | { lineupType?: string; homeTeam?: { unavailable?: RawUnavailable[] }; awayTeam?: { unavailable?: RawUnavailable[] } }
    | undefined;
  if (!lu || (!lu.homeTeam && !lu.awayTeam)) return null;
  const conv = (xs: RawUnavailable[] = []): MissingPlayer[] =>
    xs
      .filter((x) => x.name)
      .map((x) => ({
        name: x.name!,
        role: "belirsiz",
        reason: REASON[x.unavailability?.type ?? ""] ?? x.unavailability?.type ?? "eksik",
        returnText: x.unavailability?.expectedReturn,
      }));
  return { home: conv(lu.homeTeam?.unavailable), away: conv(lu.awayTeam?.unavailable), predicted: lu.lineupType === "predicted" };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

function findFotmob(m: MatchInput, list: FotmobMatch[]): FotmobMatch | null {
  const ko = new Date(m.kickoff).getTime();
  let best: { f: FotmobMatch; s: number } | null = null;
  for (const f of list) {
    if (Math.abs(f.kickoff.getTime() - ko) > 90 * MIN) continue;
    const h = nameSimilarity(f.home, m.home.name);
    const a = nameSimilarity(f.away, m.away.name);
    // ikisi de makul benzer, ya da saat birebir aynı ve biri kesin eşleşiyor
    const ok = (Math.min(h, a) >= 0.6 && h + a >= 1.44) || (Math.abs(f.kickoff.getTime() - ko) <= 5 * MIN && Math.max(h, a) >= 0.95 && Math.min(h, a) >= 0.15);
    if (ok && (!best || h + a > best.s)) best = { f, s: h + a };
  }
  return best?.f ?? null;
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>, deadline: number) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length && Date.now() < deadline) await fn(items[i++]);
    }),
  );
}

/**
 * Maçlara FotMob sakat/cezalı listesini ekler (yerinde değiştirir). Hata olursa sessizce atlar.
 * Yalnız önümüzdeki 3 gündeki maçlar, en fazla 6 eşzamanlı istek, toplam süre sınırı.
 */
export async function enrichWithFotmob(matches: MatchInput[], now = new Date(), budgetMs = 12_000): Promise<{ matched: number; withData: number }> {
  const deadline = Date.now() + budgetMs;
  const soon = matches.filter((m) => {
    const t = new Date(m.kickoff).getTime();
    return t > now.getTime() && t < now.getTime() + 72 * 60 * MIN;
  });
  if (!soon.length) return { matched: 0, withData: 0 };

  const dates = [...new Set(soon.map((m) => ymd(new Date(m.kickoff))))];
  const lists = await Promise.all(
    dates.map(async (d) => {
      try {
        const f = await cachedFetch(`fotmob-matches-${d}.json`, "FotMob maç listesi", `${BASE}/matches?date=${d}`, 60 * MIN);
        return parseFotmobMatches(JSON.parse(f.text));
      } catch {
        return [];
      }
    }),
  );
  const all = lists.flat();

  const pairs = soon.map((m) => ({ m, f: findFotmob(m, all) })).filter((p): p is { m: MatchInput; f: FotmobMatch } => p.f !== null);
  let withData = 0;
  await pool(
    pairs,
    6,
    async ({ m, f }) => {
      try {
        const res = await cachedFetch(`fotmob-details-${f.id}.json`, "FotMob maç ayrıntısı", `${BASE}/matchDetails?matchId=${f.id}`, 120 * MIN);
        const u = parseUnavailable(JSON.parse(res.text));
        if (!u) return;
        m.home.missing = u.home;
        m.away.missing = u.away;
        m.fotmob = { matchId: f.id, predicted: u.predicted };
        m.warnings = m.warnings.filter((w) => !w.startsWith("Sakat/cezalı verisi"));
        withData++;
      } catch {
        /* bu maç için FotMob verisi yok */
      }
    },
    deadline,
  );
  return { matched: pairs.length, withData };
}
