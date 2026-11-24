import type { MatchInput } from "../types";
import type { MatchProvider } from "./index";
import { cachedFetch } from "./cache";
import { NESINE_URL, parseNesine, type NesineEvent, type NesineRaw } from "./nesine";
import {
  FIXTURES_URL,
  LEAGUES,
  headToHead,
  parseFixtures,
  parseResults,
  seasonCode,
  seasonUrl,
  standings,
  teamFromResults,
  type Fixture,
  type PlayedMatch,
} from "./footballData";
import { nameSimilarity, shortName } from "./teamNames";

const MIN = 60_000;
const MATCH_THRESHOLD = 0.72;
const DAYS_AHEAD = 7;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function findEvent(fx: Fixture, events: NesineEvent[]) {
  let best: NesineEvent | null = null;
  let bestScore = 0;
  for (const ev of events) {
    if (Math.abs(ev.kickoff.getTime() - fx.kickoff.getTime()) > 3 * 60 * MIN) continue;
    const sh = nameSimilarity(ev.home, fx.home);
    const sa = nameSimilarity(ev.away, fx.away);
    if (Math.min(sh, sa) < 0.6) continue;
    const s = (sh + sa) / 2;
    if (s > bestScore) {
      best = ev;
      bestScore = s;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

async function loadResults(div: string, now: Date, warnings: string[]): Promise<{ current: PlayedMatch[]; all: PlayedMatch[] }> {
  const cur = seasonCode(now);
  const prevYear = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const prev = seasonCode(prevYear);
  const get = async (season: string) => {
    try {
      const f = await cachedFetch(`fd-${season}-${div}.csv`, `${LEAGUES[div]} ${season} sonuçları`, seasonUrl(season, div), 6 * 60 * MIN);
      if (f.warning) warnings.push(f.warning);
      return parseResults(f.text);
    } catch (e) {
      warnings.push((e as Error).message);
      return [];
    }
  };
  const [c, p] = await Promise.all([get(cur), get(prev)]);
  return { current: c, all: [...p, ...c] };
}

async function buildAll(): Promise<MatchInput[]> {
  const now = new Date();
  const sourceWarnings: string[] = [];

  const [fxRes, nsRes] = await Promise.allSettled([
    cachedFetch("fd-fixtures.csv", "Avrupa oranları (Football-Data)", FIXTURES_URL, 30 * MIN),
    cachedFetch("nesine-bulten.json", "iddaa oranları (Nesine)", NESINE_URL, 5 * MIN),
  ]);
  if (fxRes.status === "rejected") throw fxRes.reason;
  if (nsRes.status === "rejected") throw nsRes.reason;
  if (fxRes.value.warning) sourceWarnings.push(fxRes.value.warning);
  if (nsRes.value.warning) sourceWarnings.push(nsRes.value.warning);

  const horizon = now.getTime() + DAYS_AHEAD * 24 * 60 * MIN;
  const fixtures = parseFixtures(fxRes.value.text).filter(
    (f) => f.kickoff.getTime() > now.getTime() - 2 * 60 * MIN && f.kickoff.getTime() < horizon,
  );
  const events = parseNesine(JSON.parse(nsRes.value.text) as NesineRaw);

  const pairs = fixtures.map((fx) => ({ fx, ev: findEvent(fx, events) })).filter((p) => p.ev !== null) as {
    fx: Fixture;
    ev: NesineEvent;
  }[];

  const divs = [...new Set(pairs.map((p) => p.fx.div))];
  const resultWarnings: string[] = [];
  const results = new Map(await Promise.all(divs.map(async (d) => [d, await loadResults(d, now, resultWarnings)] as const)));

  return pairs.map(({ fx, ev }) => {
    const r = results.get(fx.div)!;
    const table = standings(r.current);
    const home = teamFromResults(fx.home, shortName(ev.home), r.all, table);
    const away = teamFromResults(fx.away, shortName(ev.away), r.all, table);
    home.name = ev.home;
    away.name = ev.away;
    const warnings = [...sourceWarnings, ...resultWarnings].map((w) => `${w} — kaynak hata verdi, önbellekteki son veri gösteriliyor`);
    warnings.push("Sakat/cezalı verisi bu kaynaklarda yok");
    if (ev.unmapped) warnings.push(`Nesine'de tanınmayan ${ev.unmapped} pazar atlandı`);
    return {
      id: `${fx.div}-${slug(fx.home)}-${slug(fx.away)}-${fx.kickoff.toISOString().slice(0, 10)}`,
      league: LEAGUES[fx.div],
      kickoff: fx.kickoff.toISOString(),
      home,
      away,
      headToHead: headToHead(fx.home, fx.away, r.all),
      euro: {
        bookmakers: fx.bookmakers,
        reference: fx.reference,
        h2h: fx.h2h,
        ou25: fx.ou25 ?? [1.9, 1.9],
      },
      iddaa: ev.lines,
      updatedAt: (nsRes.value.fetchedAt > fxRes.value.fetchedAt ? fxRes.value.fetchedAt : nsRes.value.fetchedAt).toISOString(),
      warnings: fx.ou25 ? warnings : [...warnings, "Avrupa Alt/Üst 2.5 oranı yok, varsayılan kullanıldı"],
    } satisfies MatchInput;
  });
}

let inflight: Promise<MatchInput[]> | null = null;

export const liveProvider: MatchProvider = {
  name: "canlı (Nesine + Football-Data.co.uk)",
  async listMatches() {
    inflight ??= buildAll().finally(() => setTimeout(() => (inflight = null), 30_000).unref?.());
    return inflight;
  },
  async getMatch(id) {
    return (await this.listMatches()).find((m) => m.id === id) ?? null;
  },
};

