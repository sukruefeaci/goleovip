import { getJSON, getStore, setJSON } from "../auth/store";
import type { Analysis } from "../types";
import type { AfFixture, AfOdds, Lines } from "./apiFootball";
import MARKETS from "./oddspapiMarkets.json";
import { nameSimilarity } from "./teamNames";

/**
 * OddsPapi (oddspapi.io, v4): Pinnacle'ın (yurt dışı, düşük marjlı) oranları: 1X2, KG, gol, ilk yarı gol, takım golleri, korner.
 * Ücretsiz plan ayda 250 istek: ayda en çok MONTH_BUDGET, günde en çok DAY_BUDGET istek yapılır.
 *  - Fikstür listesi (önümüzdeki ~47 saat) 12 saatte bir: 1 istek
 *  - Oranlar: sitedeki maçların ligleri, 5'er lig tek istekte (odds-by-tournaments), her lig ~20 saatte bir
 * Anahtar: Vercel'de ODDSPAPI_KEY ortam değişkeni (yoksa hiçbir şey yapılmaz). Anahtar adreste apiKey parametresiyle gider.
 */

const BASE = "https://api.oddspapi.io/v4";
const MONTH_BUDGET = 240;
const DAY_BUDGET = 8;
const FX_REFRESH_MS = 12 * 3600_000;
const ODDS_REFRESH_MS = 20 * 3600_000;
const BOOKMAKER = "pinnacle";

export const opKey = () => process.env.ODDSPAPI_KEY?.trim() || null;

type MarketMap = Record<string, [string, number, number[]]>;
const MK = MARKETS as unknown as MarketMap;

interface OpFixture extends AfFixture {
  tid: number;
}
interface FxState {
  v: 1;
  at: string;
  fx: Record<string, OpFixture>;
}
interface OddsState {
  v: 1;
  odds: Record<string, AfOdds>;
  tAt: Record<string, string>; // lig → son oran çekimi
}
const FX_KEY = "op:fx";
const ODDS_KEY = "op:odds";
const monthKey = () => `op:req:${new Date().toISOString().slice(0, 7)}`;
const dayKey = () => `op:reqd:${new Date().toISOString().slice(0, 10)}`;

async function opGet<T>(path: string): Promise<T | null> {
  const key = opKey();
  const store = getStore();
  if (!key || !store) return null;
  const m = await store.incr(monthKey(), 40 * 86400).catch(() => MONTH_BUDGET + 1);
  const d = await store.incr(dayKey(), 2 * 86400).catch(() => DAY_BUDGET + 1);
  if (m > MONTH_BUDGET || d > DAY_BUDGET) return null; // kota korunur
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OddsPapi ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type RawFixture = {
  fixtureId: string;
  tournamentId: number;
  startTime: string;
  participant1Name: string;
  participant2Name: string;
  categoryName?: string;
  tournamentName?: string;
  hasOdds?: boolean;
};
type RawOutcome = { players?: Record<string, { active?: boolean; price?: number }> };
type RawOddsFixture = {
  fixtureId: string;
  bookmakerOdds?: Record<string, { suspended?: boolean; markets?: Record<string, { marketActive?: boolean; outcomes?: Record<string, RawOutcome> }> }>;
};

const priceOf = (o?: RawOutcome) => {
  const p = o?.players?.["0"];
  return p && p.active !== false && typeof p.price === "number" && p.price > 1 ? p.price : null;
};

/** Bir maçın Pinnacle oranlarını sitenin yurt dışı oran biçimine çevir */
export function toAfOdds(fx: RawOddsFixture): AfOdds | null {
  const out: AfOdds = { id: fx.fixtureId as unknown as number, books: {} };
  for (const [book, b] of Object.entries(fx.bookmakerOdds ?? {})) {
    if (b.suspended) continue;
    for (const [mid, m] of Object.entries(b.markets ?? {})) {
      const def = MK[mid];
      if (!def || m.marketActive === false) continue;
      const [kind, line, ids] = def;
      const prices = ids.map((id) => priceOf(m.outcomes?.[String(id)]));
      if (prices.some((p) => p === null)) continue;
      if (kind === "h2h") out.h2h = prices as [number, number, number];
      else if (kind === "btts") out.btts = prices as [number, number];
      else if (kind === "ou" || kind === "ou1h" || kind === "homeGoals" || kind === "awayGoals" || kind === "corners" || kind === "homeCorners" || kind === "awayCorners") {
        const lines: Lines = (out[kind] ??= {});
        lines[line.toFixed(1)] = prices as [number, number];
      } else continue;
      out.books[kind as keyof AfOdds["books"]] = book === "pinnacle" ? "Pinnacle" : book;
    }
    break; // tek şirket istendi
  }
  return Object.keys(out.books).length ? out : null;
}

async function loadFx(): Promise<FxState | null> {
  return getJSON<FxState>(FX_KEY).catch(() => null);
}

/** Fikstür listesini (gerekirse) yenile */
async function refreshFx(now: number): Promise<{ st: FxState | null; requests: number }> {
  const st = await loadFx();
  if (st && now - Date.parse(st.at) < FX_REFRESH_MS) return { st, requests: 0 };
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const raw = await opGet<RawFixture[]>(`/fixtures?sportId=10&statusId=0&from=${iso(now)}&to=${iso(now + 47 * 3600_000)}`);
  if (!raw) return { st, requests: 0 };
  const fx: Record<string, OpFixture> = {};
  for (const r of raw) {
    if (r.hasOdds === false) continue;
    fx[r.fixtureId] = {
      id: r.fixtureId as unknown as number,
      tid: r.tournamentId,
      kickoff: r.startTime,
      league: [r.categoryName, r.tournamentName].filter(Boolean).join(" · "),
      home: r.participant1Name,
      away: r.participant2Name,
    };
  }
  const next: FxState = { v: 1, at: new Date(now).toISOString(), fx };
  await setJSON(FX_KEY, next);
  return { st: next, requests: 1 };
}

/** Sitedeki maça karşılık gelen OddsPapi fikstürü */
function matchFixture(list: OpFixture[], m: { home: string; away: string; kickoff: string }): OpFixture | null {
  const t = Date.parse(m.kickoff);
  let best: { f: OpFixture; s: number } | null = null;
  for (const f of list) {
    if (Math.abs(Date.parse(f.kickoff) - t) > 20 * 60_000) continue;
    const sh = nameSimilarity(f.home, m.home),
      sa = nameSimilarity(f.away, m.away);
    if (sh < 0.5 || sa < 0.5) continue;
    if (!best || sh + sa > best.s) best = { f, s: sh + sa };
  }
  return best?.f ?? null;
}

/**
 * Zamanlayıcıdan çağrılır: fikstürleri ve sitedeki maçların liglerinin oranlarını kademeli çeker.
 * maxCalls: bu çalışmada en çok kaç oran isteği (her biri 5 lig).
 */
export async function syncOddsPapi(analyses: Analysis[], now = Date.now(), maxCalls = 2) {
  if (!opKey() || !getStore()) return { requests: 0, note: "anahtar yok" };
  await setJSON(LAST_KEY, { at: new Date(now).toISOString(), running: true }).catch(() => {});
  try {
    const r = await syncInner(analyses, now, maxCalls);
    await setJSON(LAST_KEY, { at: new Date(now).toISOString(), ok: true, r }).catch(() => {});
    memo = null;
    return r;
  } catch (e) {
    await setJSON(LAST_KEY, { at: new Date(now).toISOString(), ok: false, error: (e as Error).message }).catch(() => {});
    throw e;
  }
}

const LAST_KEY = "op:last";
export type OpLast = { at: string; running?: boolean; ok?: boolean; error?: string; r?: Record<string, unknown> };
export const opLast = () => getJSON<OpLast>(LAST_KEY).catch(() => null);

/** Sayfadan: veri yoksa ya da fikstür eskiyse (son denemeden 3 dk geçtiyse) arka planda senkron */
export async function needsOpSync(now = Date.now()): Promise<boolean> {
  if (!opKey() || !getStore()) return false;
  const [last, fx] = await Promise.all([opLast(), loadFx()]);
  if (last && now - Date.parse(last.at) < 3 * 60_000) return false;
  return !fx || now - Date.parse(fx.at) > FX_REFRESH_MS;
}

async function syncInner(analyses: Analysis[], now: number, maxCalls: number) {
  const { st, requests: r0 } = await refreshFx(now);
  let requests = r0;
  if (!st) return { requests, note: "fikstür alınamadı (kota?)" };
  const list = Object.values(st.fx);
  // Sitede olan, başlamamış maçların ligleri: maç sayısına göre
  const count = new Map<number, number>();
  let matched = 0;
  for (const a of analyses) {
    const t = Date.parse(a.match.kickoff);
    if (t <= now || t > now + 47 * 3600_000) continue;
    const f = matchFixture(list, { home: a.match.home.name, away: a.match.away.name, kickoff: a.match.kickoff });
    if (!f) continue;
    matched++;
    // iddaa'da korner çizgisi olan maçların ligleri önce (açıklar en çok orada çıkar)
    const corners = (a.match.iddaaStat ?? []).some((l) => l.key.startsWith("cor"));
    count.set(f.tid, (count.get(f.tid) ?? 0) + (corners ? 3 : 1));
  }
  const odds: OddsState = (await getJSON<OddsState>(ODDS_KEY).catch(() => null)) ?? { v: 1, odds: {}, tAt: {} };
  const due = [...count.entries()]
    .filter(([tid]) => !odds.tAt[tid] || now - Date.parse(odds.tAt[tid]) > ODDS_REFRESH_MS)
    .sort((x, y) => y[1] - x[1])
    .map(([tid]) => tid);
  let fetched = 0;
  for (let i = 0; i < maxCalls && due.length; i++) {
    const batch = due.splice(0, 5);
    if (i > 0) await new Promise((r) => setTimeout(r, 1100)); // uç nokta sınırı: 1 sn
    const raw = await opGet<RawOddsFixture[] | RawOddsFixture>(`/odds-by-tournaments?tournamentIds=${batch.join(",")}&bookmaker=${BOOKMAKER}`);
    if (!raw) break;
    requests++;
    for (const fx of Array.isArray(raw) ? raw : [raw]) {
      const o = toAfOdds(fx);
      if (o) {
        odds.odds[fx.fixtureId] = o;
        fetched++;
      }
    }
    for (const tid of batch) odds.tAt[tid] = new Date(now).toISOString();
  }
  // başlamış maçların oranlarını at (kayıt küçük kalsın)
  for (const id of Object.keys(odds.odds)) {
    const f = st.fx[id];
    if (!f || Date.parse(f.kickoff) < now - 3 * 3600_000) delete odds.odds[id];
  }
  await setJSON(ODDS_KEY, odds);
  return { requests, fixtures: list.length, matched, leagues: count.size, waiting: due.length, withOdds: Object.keys(odds.odds).length, fetched };
}

let memo: { at: number; data: { v: 1; fx: Record<string, AfFixture>; odds: Record<string, AfOdds>; page: number; total: number } | null } | null = null;

/** Oran açığı sayfası için: API-Football gün kaydıyla aynı biçimde (findAfOdds ile kullanılır) */
export async function loadOpDay() {
  if (memo && Date.now() - memo.at < 5 * 60_000) return memo.data;
  let data = null;
  if (opKey() && getStore()) {
    const [fx, odds] = await Promise.all([loadFx(), getJSON<OddsState>(ODDS_KEY).catch(() => null)]);
    if (fx && odds) data = { v: 1 as const, fx: fx.fx as Record<string, AfFixture>, odds: odds.odds, page: 0, total: 0 };
  }
  memo = { at: Date.now(), data };
  return data;
}

/** Bu ay ve bugün yapılan istek sayısı */
export async function opUsage(): Promise<{ month: number; day: number }> {
  const s = getStore();
  if (!s) return { month: 0, day: 0 };
  const [m, d] = await Promise.all([s.get(monthKey()).catch(() => 0), s.get(dayKey()).catch(() => 0)]);
  return { month: Number(m) || 0, day: Number(d) || 0 };
}
