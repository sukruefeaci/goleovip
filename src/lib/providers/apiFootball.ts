import { getJSON, getStore, setJSON } from "../auth/store";
import { nameSimilarity } from "./teamNames";

/**
 * API-Football (api-sports.io): yurt dışı bahis şirketlerinin oranları (Pinnacle, Betfair, Bet365, 1xBet…),
 * gol pazarlarının yanında korner ve kart çizgileri. Oran açığı sekmesi için.
 *
 * Ücretsiz plan günde 100 istek: istekler sayılır (af:req:<gün>), günde en çok BUDGET kadar yapılır.
 * Bir günün oranları 10'arlı sayfalar halinde kademeli çekilir (zamanlayıcının her çalışmasında birkaç sayfa) ve
 * af:day:<gün> anahtarında saklanır; 12 saatte bir yenilenir.
 * Anahtar: Vercel'de API_FOOTBALL_KEY ortam değişkeni (yoksa hiçbir şey yapılmaz).
 */

const BASE = "https://v3.football.api-sports.io";
const BUDGET = 90;
const REFRESH_MS = 16 * 3600_000; // günlük kota için: her gün en çok ~1.5 tur

export const afKey = () => process.env.API_FOOTBALL_KEY?.trim() || null;

/** Bir pazarın .5 çizgileri: çizgi → [üst oranı, alt oranı] */
export type Lines = Record<string, [number, number]>;

export interface AfOdds {
  id: number;
  books: Partial<Record<MarketName, string>>; // pazar → kullanılan şirket
  h2h?: [number, number, number];
  btts?: [number, number];
  ou?: Lines;
  ou1h?: Lines;
  homeGoals?: Lines;
  awayGoals?: Lines;
  corners?: Lines;
  homeCorners?: Lines;
  awayCorners?: Lines;
  cards?: Lines;
}
export type MarketName = "h2h" | "btts" | "ou" | "ou1h" | "homeGoals" | "awayGoals" | "corners" | "homeCorners" | "awayCorners" | "cards";

export interface AfFixture {
  id: number;
  kickoff: string;
  league: string;
  home: string;
  away: string;
}

interface DayData {
  v: 1;
  fx: Record<string, AfFixture>;
  fxAt?: string;
  odds: Record<string, AfOdds>;
  page: number; // sıradaki sayfa (1'den)
  total: number; // toplam sayfa (0: bilinmiyor)
  roundAt?: string; // bu tur ne zaman başladı
  doneAt?: string; // son tur ne zaman bitti
}

const dayKey = (d: string) => `af:day:${d}`;
const reqKey = () => `af:req:${new Date().toISOString().slice(0, 10)}`;

/** Bahis şirketi önceliği (düşük marjlı / keskin olanlar önce) */
const BOOK_PRIORITY = ["Pinnacle", "Betfair", "Bet365", "1xBet", "Marathonbet", "SBO", "Dafabet", "William Hill", "Unibet", "Betano", "Bwin", "Betway"];
const BET_NAMES: Record<string, MarketName> = {
  "Match Winner": "h2h",
  "Both Teams Score": "btts",
  "Goals Over/Under": "ou",
  "Goals Over/Under First Half": "ou1h",
  "Total - Home": "homeGoals",
  "Total - Away": "awayGoals",
  "Corners Over Under": "corners",
  "Home Corners Over/Under": "homeCorners",
  "Away Corners Over/Under": "awayCorners",
  "Cards Over/Under": "cards",
};

async function afGet<T>(path: string): Promise<T | null> {
  const key = afKey();
  const store = getStore();
  if (!key || !store) return null;
  const used = await store.incr(reqKey(), 2 * 86400).catch(() => BUDGET + 1);
  if (used > BUDGET) return null; // günlük kota doldu
  const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const j = (await res.json()) as { errors?: unknown; response?: unknown };
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors as object).length);
  if (!res.ok || errs) throw new Error(`API-Football: ${res.status} ${JSON.stringify(j.errors)}`);
  return j as T;
}

/** Bir pazarın değerlerinden .5 çizgilerini çıkar ("Over 9.5" / "Under 9.5") */
function parseLines(values: { value: string; odd: string }[]): Lines {
  const out: Record<string, { o?: number; u?: number }> = {};
  for (const v of values) {
    const m = /^(Over|Under)\s+([\d.]+)$/.exec(v.value.trim());
    if (!m) continue;
    const line = Number(m[2]);
    if (!Number.isFinite(line) || Math.abs((line * 2) % 2 - 1) > 1e-9) continue; // yalnız .5 çizgileri (iade yok)
    const odd = Number(v.odd);
    if (!(odd > 1)) continue;
    const r = (out[line.toFixed(1)] ??= {});
    if (m[1] === "Over") r.o = odd;
    else r.u = odd;
  }
  const lines: Lines = {};
  for (const [k, r] of Object.entries(out)) if (r.o && r.u) lines[k] = [r.o, r.u];
  return lines;
}

type RawBet = { name: string; values: { value: string; odd: string }[] };
type RawOdds = { fixture: { id: number }; bookmakers: { name: string; bets: RawBet[] }[] };

/** Bir fikstürün oranlarını sadeleştir: her pazar için öncelikli şirketten */
export function compactOdds(r: RawOdds): AfOdds {
  const out: AfOdds = { id: r.fixture.id, books: {} };
  const books = [...r.bookmakers].sort((a, b) => {
    const pa = BOOK_PRIORITY.indexOf(a.name),
      pb = BOOK_PRIORITY.indexOf(b.name);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  for (const bm of books)
    for (const bet of bm.bets) {
      const mk = BET_NAMES[bet.name];
      if (!mk || out[mk]) continue;
      if (mk === "h2h") {
        const g = (n: string) => Number(bet.values.find((v) => v.value === n)?.odd);
        const h = [g("Home"), g("Draw"), g("Away")];
        if (h.every((x) => x > 1)) out.h2h = h as [number, number, number];
      } else if (mk === "btts") {
        const g = (n: string) => Number(bet.values.find((v) => v.value === n)?.odd);
        const b = [g("Yes"), g("No")];
        if (b.every((x) => x > 1)) out.btts = b as [number, number];
      } else {
        const l = parseLines(bet.values);
        if (Object.keys(l).length) out[mk] = l;
      }
      if (out[mk]) out.books[mk] = bm.name;
    }
  return out;
}

/**
 * Bir günü kademeli senkronize et: fikstür listesi (12 saatte bir) ve oran sayfaları (her çağrıda en çok maxPages).
 * Dönen: bu çağrıda yapılan istek sayısı ve durum.
 */
export async function syncDay(date: string, maxPages = 4): Promise<{ requests: number; page: number; total: number; fixtures: number; withOdds: number }> {
  const store = getStore();
  if (!afKey() || !store) return { requests: 0, page: 0, total: 0, fixtures: 0, withOdds: 0 };
  const d: DayData = (await getJSON<DayData>(dayKey(date)).catch(() => null)) ?? { v: 1, fx: {}, odds: {}, page: 1, total: 0 };
  let requests = 0;
  const now = Date.now();
  if (!d.fxAt || now - Date.parse(d.fxAt) > REFRESH_MS) {
    const f = await afGet<{ response: { fixture: { id: number; date: string }; league: { name: string; country: string }; teams: { home: { name: string }; away: { name: string } } }[] }>(
      `/fixtures?date=${date}`,
    );
    requests++;
    if (f) {
      d.fx = {};
      for (const x of f.response)
        d.fx[x.fixture.id] = { id: x.fixture.id, kickoff: x.fixture.date, league: `${x.league.country} · ${x.league.name}`, home: x.teams.home.name, away: x.teams.away.name };
      d.fxAt = new Date(now).toISOString();
    }
  }
  // Yeni tur: önceki tur bitmiş ve 12 saat geçmişse baştan
  if (d.total && d.page > d.total && d.doneAt && now - Date.parse(d.doneAt) > REFRESH_MS) {
    d.page = 1;
    d.roundAt = new Date(now).toISOString();
  }
  for (let i = 0; i < maxPages && (!d.total || d.page <= d.total); i++) {
    const o = await afGet<{ response: RawOdds[]; paging: { current: number; total: number } }>(`/odds?date=${date}&page=${d.page}`);
    requests++;
    if (!o) break;
    d.total = o.paging.total;
    for (const r of o.response) d.odds[r.fixture.id] = compactOdds(r);
    d.page++;
    if (d.page > d.total) d.doneAt = new Date().toISOString();
  }
  await setJSON(dayKey(date), d);
  return { requests, page: d.page, total: d.total, fixtures: Object.keys(d.fx).length, withOdds: Object.keys(d.odds).length };
}

let memo: { at: number; date: string; data: DayData | null }[] = [];

export async function loadAfDay(date: string): Promise<DayData | null> {
  const m = memo.find((x) => x.date === date);
  if (m && Date.now() - m.at < 5 * 60_000) return m.data;
  const data = getStore() ? await getJSON<DayData>(dayKey(date)).catch(() => null) : null;
  memo = [...memo.filter((x) => x.date !== date), { at: Date.now(), date, data }].slice(-4);
  return data;
}

/** Maça (ev, deplasman, başlama) karşılık gelen yurt dışı oranları */
export function findAfOdds(days: (DayData | null)[], match: { home: string; away: string; kickoff: string }): { fx: AfFixture; odds: AfOdds } | null {
  const t = Date.parse(match.kickoff);
  let best: { fx: AfFixture; odds: AfOdds; s: number } | null = null;
  for (const d of days) {
    if (!d) continue;
    for (const fx of Object.values(d.fx)) {
      if (Math.abs(Date.parse(fx.kickoff) - t) > 20 * 60_000) continue;
      const odds = d.odds[fx.id];
      if (!odds) continue;
      const sh = nameSimilarity(fx.home, match.home),
        sa = nameSimilarity(fx.away, match.away);
      if (sh < 0.5 || sa < 0.5) continue;
      const s = sh + sa;
      if (!best || s > best.s) best = { fx, odds, s };
    }
  }
  return best && { fx: best.fx, odds: best.odds };
}

/** Bugün yapılan istek sayısı (admin / kurulum için) */
export async function afUsage(): Promise<number> {
  return Number((await getStore()?.get(reqKey()).catch(() => null)) ?? 0) || 0;
}
