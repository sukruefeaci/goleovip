import type { MatchInput } from "../types";
import type { MatchProvider } from "./index";
import { cachedFetch } from "./cache";
import { NESINE_URL, parseNesine, type NesineEvent, type NesineRaw } from "./nesine";
import { IDDAA_URL, parseIddaa, type IddaaRaw } from "./iddaa";
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
import { nameSimilarity, normName, shortName } from "./teamNames";
import { CLUBELO_FIXTURES_URL, parseClubEloFixtures, type EloFixture } from "./clubelo";
import { enrichWithFotmob, UNKNOWN_LEAGUE } from "./fotmob";
import type { TeamInput } from "../types";

const MIN = 60_000;
const MATCH_THRESHOLD = 0.72;
const DAYS_AHEAD = 7;
const IDDAA_ONLY_HOURS = 48;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function findEvent(fx: { home: string; away: string; kickoff: Date }, events: NesineEvent[]) {
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

/**
 * Yedek eşleştirme (ClubElo kısa adları için: "Sporting" ↔ "Sporting Lizbon", "AZ" ↔ "AZ Alkmaar"):
 * başlama saati 15 dk içinde ve takımlardan biri neredeyse birebir aynıysa, diğeri de en az kısmen benziyorsa.
 */
function findBySameKickoff(f: { home: string; away: string; kickoff: Date }, events: NesineEvent[]) {
  const cands = events
    .filter((e) => Math.abs(e.kickoff.getTime() - f.kickoff.getTime()) <= 15 * MIN)
    .map((e) => ({ e, h: nameSimilarity(e.home, f.home), a: nameSimilarity(e.away, f.away) }))
    .filter((c) => Math.max(c.h, c.a) >= 0.95 && Math.min(c.h, c.a) >= 0.15)
    .sort((x, y) => y.h + y.a - (x.h + x.a));
  // Belirsizse (aynı saatte birden çok aday) eşleştirme yapma
  if (cands.length === 0 || (cands.length > 1 && cands[1].h + cands[1].a > cands[0].h + cands[0].a - 0.3)) return null;
  return cands[0].e;
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

  const [fxRes, idRes, nsRes, eloRes] = await Promise.allSettled([
    cachedFetch("fd-fixtures.csv", "Avrupa oranları (Football-Data)", FIXTURES_URL, 30 * MIN),
    cachedFetch("iddaa-bulten.json", "iddaa oranları (iddaa.com)", IDDAA_URL, 5 * MIN),
    cachedFetch("nesine-bulten.json", "iddaa oranları (Nesine)", NESINE_URL, 5 * MIN),
    cachedFetch("clubelo-fixtures.html", "ClubElo maç olasılıkları", CLUBELO_FIXTURES_URL, 60 * MIN),
  ]);
  if (fxRes.status === "rejected" && eloRes.status === "rejected") throw fxRes.reason;
  if (fxRes.status === "fulfilled" && fxRes.value.warning) sourceWarnings.push(fxRes.value.warning);

  // iddaa oranları: önce iddaa.com, olmazsa Nesine
  let events: NesineEvent[] = [];
  let oddsSource = "";
  const errors: string[] = [];
  for (const [res, name, parse] of [
    [idRes, "iddaa.com", (t: string) => parseIddaa(JSON.parse(t) as IddaaRaw)],
    [nsRes, "Nesine", (t: string) => parseNesine(JSON.parse(t) as NesineRaw)],
  ] as const) {
    if (res.status === "rejected") {
      errors.push((res.reason as Error).message);
      continue;
    }
    try {
      const parsed = parse(res.value.text);
      if (!parsed.length) throw new Error(`${name}: bültende futbol maçı yok`);
      events = parsed;
      oddsSource = name;
      if (res.value.warning) sourceWarnings.push(res.value.warning);
      break;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (!events.length) throw new Error(errors.join(" · "));
  const oddsFetchedAt = (oddsSource === "iddaa.com" ? idRes : nsRes) as PromiseFulfilledResult<{ fetchedAt: Date }>;

  const horizon = now.getTime() + DAYS_AHEAD * 24 * 60 * MIN;
  const fxFetchedAt = fxRes.status === "fulfilled" ? fxRes.value.fetchedAt : new Date();
  const fixtures = (fxRes.status === "fulfilled" ? parseFixtures(fxRes.value.text) : []).filter(
    (f) => f.kickoff.getTime() > now.getTime() - 2 * 60 * MIN && f.kickoff.getTime() < horizon,
  );

  const pairs = fixtures.map((fx) => ({ fx, ev: findEvent(fx, events) })).filter((p) => p.ev !== null) as {
    fx: Fixture;
    ev: NesineEvent;
  }[];

  const divs = [...new Set(pairs.map((p) => p.fx.div))];
  const resultWarnings: string[] = [];
  const results = new Map(await Promise.all(divs.map(async (d) => [d, await loadResults(d, now, resultWarnings)] as const)));

  const updatedAt = (oddsFetchedAt.value.fetchedAt > fxFetchedAt ? fxFetchedAt : oddsFetchedAt.value.fetchedAt).toISOString();

  // ClubElo: Football-Data'da olmayan iddaa maçları (Avrupa kupaları, diğer ligler)
  const used = new Set(pairs.map((p) => p.ev));
  const eloMatches: MatchInput[] = [];
  if (eloRes.status === "fulfilled") {
    const eloFx = parseClubEloFixtures(eloRes.value.text).filter(
      (f) => f.kickoff.getTime() > now.getTime() && f.kickoff.getTime() < horizon,
    );
    for (const f of eloFx) {
      const free = events.filter((e) => !used.has(e));
      const ev = findEvent(f, free) ?? findBySameKickoff(f, free);
      if (!ev) continue;
      used.add(ev);
      eloMatches.push(eloMatch(f, ev, updatedAt, oddsSource));
    }
  }

  const marketMatches = pairs.map(({ fx, ev }) => {
    const r = results.get(fx.div)!;
    const table = standings(r.current);
    const home = teamFromResults(fx.home, shortName(ev.home), r.all, table);
    const away = teamFromResults(fx.away, shortName(ev.away), r.all, table);
    home.name = ev.home;
    away.name = ev.away;
    const warnings = [...sourceWarnings, ...resultWarnings].map((w) => `${w} — kaynak hata verdi, önbellekteki son veri gösteriliyor`);
    warnings.push("Sakat/cezalı verisi bu kaynaklarda yok");
    if (ev.unmapped) warnings.push(`${oddsSource} bülteninde modelin hesaplamadığı ${ev.unmapped} pazar atlandı`);
    return {
      id: `${fx.div}-${slug(fx.home)}-${slug(fx.away)}-${fx.kickoff.toISOString().slice(0, 10)}`,
      league: LEAGUES[fx.div],
      kickoff: fx.kickoff.toISOString(),
      home,
      away,
      headToHead: headToHead(fx.home, fx.away, r.all),
      leagueCorners: leagueCorners(r.current.length >= 30 ? r.current : r.all),
      euro: {
        bookmakers: fx.bookmakers,
        reference: fx.reference,
        h2h: fx.h2h,
        ou25: fx.ou25 ?? [1.9, 1.9],
      },
      iddaa: ev.lines,
      updatedAt,
      warnings: fx.ou25 ? warnings : [...warnings, "Avrupa Alt/Üst 2.5 oranı yok, varsayılan kullanıldı"],
      source: "market",
    } satisfies MatchInput;
  });

  // Kalan iddaa maçları (Avrupa oranı ve ClubElo yok): iddaa'nın kendi marjsız oranlarıyla
  const iddaaMatches: MatchInput[] = [];
  for (const ev of events) {
    if (used.has(ev)) continue;
    const t = ev.kickoff.getTime();
    // Yalnız iddaa maçları önümüzdeki 48 saat için (bülten haftalık yüzlerce maç içerir; kayıt ve hesap yükü)
    if (t <= now.getTime() || t >= Math.min(horizon, now.getTime() + IDDAA_ONLY_HOURS * 60 * MIN)) continue;
    const m = iddaaMatch(ev, updatedAt, oddsSource);
    if (m) iddaaMatches.push(m);
  }

  const all = [...marketMatches, ...eloMatches, ...iddaaMatches];
  // Sakat/cezalı: FotMob (hata olursa sessizce atlanır)
  try {
    await enrichWithFotmob(all, now);
  } catch {
    /* FotMob olmadan devam */
  }
  return all;
}

const COMPETITION_TR: [RegExp, string][] = [
  [/^UCL/i, "UEFA Şampiyonlar Ligi"],
  [/^UEL/i, "UEFA Avrupa Ligi"],
  [/^UECL|^UCOL|Conference/i, "UEFA Konferans Ligi"],
];

function competitionName(c: string) {
  for (const [re, tr] of COMPETITION_TR) if (re.test(c)) return tr;
  return c.replace(/\s+\d{2,4}(\/\d{2,4})?$/, "").trim() || "Diğer";
}

/** Takım istatistiği olmayan (ClubElo) maçlar için boş takım */
function emptyTeam(name: string): TeamInput {
  return { name, short: shortName(name), rank: 0, points: 0, form: [], goalsFor10: [], goalsAgainst10: [], cornersFor: 0, cornersAgainst: 0, cards: 0, missing: [] };
}

/**
 * Yalnız iddaa bülteninde olan maç: 1/X/2 ve Alt/Üst 2.5 olasılıkları iddaa'nın kendi oranlarından (marjı atılarak).
 * Avrupa referansı olmadığı için model piyasadan "avantaj" bulamaz; olasılıklar kalibrasyonla düzeltilir.
 */
export function iddaaMatch(ev: NesineEvent, updatedAt: string, oddsSource: string): MatchInput | null {
  const odd = (k: string) => ev.lines.find((l) => l.key === k)?.odd;
  const i1 = odd("1x2:1"),
    iX = odd("1x2:X"),
    i2 = odd("1x2:2"),
    o = odd("ou:2.5:o"),
    u = odd("ou:2.5:u");
  if (!i1 || !iX || !i2 || !o || !u) return null;
  const inv = [1 / i1, 1 / iX, 1 / i2];
  const sum = inv[0] + inv[1] + inv[2];
  const s = 1 / o + 1 / u;
  const warnings = [
    "Avrupa piyasa oranı ve ClubElo yok: olasılıklar iddaa'nın marjı atılmış oranlarından",
    "Takım istatistiği yok: korner ve kart tahmini gösterilmiyor; güven puanı daha düşük",
  ];
  if (ev.unmapped) warnings.push(`${oddsSource} bülteninde modelin hesaplamadığı ${ev.unmapped} pazar atlandı`);
  return {
    id: `id-${slug(normName(ev.home))}-${slug(normName(ev.away))}-${ev.kickoff.toISOString().slice(0, 10)}`,
    league: ev.league || UNKNOWN_LEAGUE,
    kickoff: ev.kickoff.toISOString(),
    home: emptyTeam(ev.home),
    away: emptyTeam(ev.away),
    headToHead: [],
    euro: { bookmakers: 0, reference: "iddaa", h2h: [sum / inv[0], sum / inv[1], sum / inv[2]], ou25: [s * o, s * u] },
    eloDisagreement: null,
    iddaa: ev.lines.filter((l) => !/^(cor|hcor|acor|card):/.test(l.key)),
    iddaaStat: ev.lines.filter((l) => /^(cor|hcor|acor|card):/.test(l.key)),
    updatedAt,
    warnings,
    source: "iddaa",
  };
}

/** ClubElo olasılıkları + iddaa'nın kendi Alt/Üst 2.5 oranı (marjı atılmış) ile maç girdisi */
function eloMatch(f: EloFixture, ev: NesineEvent, updatedAt: string, oddsSource: string): MatchInput {
  const odd = (k: string) => ev.lines.find((l) => l.key === k)?.odd;
  const o = odd("ou:2.5:o"),
    u = odd("ou:2.5:u");
  let ou25: [number, number] = [1.9, 1.9];
  const warnings = [
    "Avrupa piyasa oranı yok: 1/X/2 olasılıkları ClubElo güç puanı ile iddaa'nın marjsız oranlarının ortalaması; gol beklentisi iddaa'nın alt/üst oranından (marjı atılarak)",
    "Takım istatistiği yok: korner ve kart tahmini gösterilmiyor; güven puanı daha düşük",
  ];
  if (o && u) {
    const s = 1 / o + 1 / u;
    ou25 = [s * o, s * u]; // marjsız (adil) oranlar
  } else warnings.push("iddaa Alt/Üst 2.5 oranı yok, varsayılan kullanıldı");

  // ClubElo kadro/sakatlık bilmez: iddaa'nın marjsız 1X2 olasılığıyla yarı yarıya harmanla.
  // İkisi ne kadar ayrışırsa model o kadar belirsiz sayılır (eloDisagreement).
  let p: [number, number, number] = f.p;
  let eloDisagreement: number | null = null;
  const i1 = odd("1x2:1"),
    iX = odd("1x2:X"),
    i2 = odd("1x2:2");
  if (i1 && iX && i2) {
    const inv = [1 / i1, 1 / iX, 1 / i2];
    const sum = inv[0] + inv[1] + inv[2];
    const fair = inv.map((x) => x / sum);
    eloDisagreement = Math.max(...fair.map((x, i) => Math.abs(x - f.p[i])));
    p = [0, 1, 2].map((i) => 0.5 * f.p[i] + 0.5 * fair[i]) as [number, number, number];
    if (eloDisagreement > 0.15)
      warnings.push(`ClubElo ile iddaa olasılıkları çok farklı (%${Math.round(eloDisagreement * 100)} puan): tahminler belirsiz`);
  } else warnings.push("iddaa maç sonucu oranı yok; yalnız ClubElo kullanıldı");
  if (ev.unmapped) warnings.push(`${oddsSource} bülteninde modelin hesaplamadığı ${ev.unmapped} pazar atlandı`);
  return {
    id: `elo-${slug(normName(ev.home))}-${slug(normName(ev.away))}-${f.kickoff.toISOString().slice(0, 10)}`,
    league: competitionName(f.competition),
    kickoff: ev.kickoff.toISOString(),
    home: emptyTeam(ev.home),
    away: emptyTeam(ev.away),
    headToHead: [],
    euro: { bookmakers: 0, reference: "ClubElo", h2h: [1 / p[0], 1 / p[1], 1 / p[2]], ou25 },
    eloDisagreement,
    iddaa: ev.lines.filter((l) => !/^(cor|hcor|acor|card):/.test(l.key)),
    iddaaStat: ev.lines.filter((l) => /^(cor|hcor|acor|card):/.test(l.key)),
    updatedAt,
    warnings,
    source: "elo",
  };
}

function leagueCorners(results: PlayedMatch[]) {
  const hc = results.map((m) => m.hc).filter((x): x is number => x !== null);
  const ac = results.map((m) => m.ac).filter((x): x is number => x !== null);
  if (hc.length < 20 || ac.length < 20) return undefined;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { home: avg(hc), away: avg(ac) };
}

let inflight: Promise<MatchInput[]> | null = null;

export const liveProvider: MatchProvider = {
  name: "canlı (iddaa.com / Nesine + Football-Data.co.uk + ClubElo + FotMob)",
  async listMatches() {
    inflight ??= buildAll().finally(() => setTimeout(() => (inflight = null), 30_000).unref?.());
    return inflight;
  },
  async getMatch(id) {
    return (await this.listMatches()).find((m) => m.id === id) ?? null;
  },
};

