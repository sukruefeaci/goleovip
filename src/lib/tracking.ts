import type { Analysis, BetRow, Category } from "./types";
import { describe } from "./markets";
import { getJSON, getStore, setJSON } from "./auth/store";
import { cachedFetch } from "./providers/cache";
import { nameSimilarity } from "./providers/teamNames";

/**
 * Tahmin kaydı ve kendini geliştirme.
 *
 * 1) Her maçın ana tercihi başlamadan önce kaydedilir (snap:YYYY-MM-DD, Türkiye günü).
 * 2) Maç bitince sonuç FotMob'dan alınır, tercih tuttu/tutmadı işaretlenir.
 * 3) Tercih türü (Sonuç, Gol, İlk Yarı, İY/MS) başına "beklenen isabet" ile "gerçek isabet" biriktirilir
 *    (learn:v1). Model olasılıkları bu orana göre hafifçe düzeltilir; az veriyle düzeltme küçük kalır.
 */

export const TRACK_CATEGORIES: Category[] = ["Sonuç", "Gol", "İlk Yarı", "İY/MS"];
const MIN = 60_000;
const TR = 3 * 3600_000;

export const trDate = (ms: number) => new Date(ms + TR).toISOString().slice(0, 10);

export interface SnapPick {
  key: string;
  category: Category;
  market: string;
  selection: string;
  odd: number;
  prob: number;
  confidence: number;
}

export interface SnapResult {
  hg: number;
  ag: number;
  hht?: number;
  aht?: number;
  pickWon: boolean | null;
  settledAt: string;
}

export interface SnapEntry {
  id: string;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  fotmobId?: number;
  pick: SnapPick | null;
  summary: { over25: number; btts: number; topScore: string; p1x2: [number, number, number] };
  result?: SnapResult;
}

type Snap = Record<string, SnapEntry>;
const snapKey = (date: string) => `snap:${date}`;

// ---------------------------------------------------------------- ana tercih

/**
 * Maçlar sayfasındaki tek tercih: tutma olasılığı yüksek ve makul oranlı.
 * Oran ≥ 1.40, kazanma olasılığı ≥ %55; belirsizlik düşülmüş beklenen dönüşü en yüksek olan.
 * Böyle seçenek yoksa oranı ≥ 1.40 olanlar içinde olasılığı en yüksek olan.
 */
export function mainPick(a: Analysis): BetRow | null {
  const pool = a.rows.filter((r) => TRACK_CATEGORIES.includes(r.category) && r.odd >= 1.4);
  const strong = pool.filter((r) => r.prob >= 0.55).sort((x, y) => (y.prob - y.sigma) * y.odd - (x.prob - x.sigma) * x.odd);
  if (strong.length) return strong[0];
  return [...pool].sort((x, y) => y.prob - x.prob)[0] ?? null;
}

function toEntry(a: Analysis): SnapEntry {
  const p = mainPick(a);
  return {
    id: a.match.id,
    kickoff: a.match.kickoff,
    league: a.match.league,
    home: a.match.home.name,
    away: a.match.away.name,
    fotmobId: a.match.fotmob?.matchId,
    pick: p && {
      key: p.key,
      category: p.category,
      market: p.market,
      selection: p.selection,
      odd: p.odd,
      prob: p.prob,
      confidence: p.confidence,
    },
    summary: {
      over25: a.summary.over25,
      btts: a.summary.btts,
      topScore: a.summary.topScores[0]?.score ?? "",
      p1x2: a.model1x2,
    },
  };
}

// ---------------------------------------------------------------- kayıt

const lastWritten = new Map<string, string>();

/** Başlamamış maçların güncel tercihini günlük kayda yazar (değişmediyse yazmaz) */
export async function recordSnapshots(analyses: Analysis[], now = Date.now()): Promise<void> {
  if (!getStore()) return;
  const byDate = new Map<string, Analysis[]>();
  for (const a of analyses) {
    const t = new Date(a.match.kickoff).getTime();
    if (t <= now) continue;
    const d = trDate(t);
    byDate.set(d, [...(byDate.get(d) ?? []), a]);
  }
  for (const [date, list] of byDate) {
    const entries = list.map(toEntry);
    const sig = JSON.stringify(entries.map((e) => [e.id, e.pick?.key, e.pick?.odd, e.fotmobId]));
    if (lastWritten.get(date) === sig) continue;
    const snap = (await getJSON<Snap>(snapKey(date))) ?? {};
    for (const e of entries) {
      const old = snap[e.id];
      if (old?.result) continue; // sonuçlanmışsa dokunma
      if (old && new Date(old.kickoff).getTime() <= now) continue; // başlamışsa dondur
      snap[e.id] = { ...e, fotmobId: e.fotmobId ?? old?.fotmobId };
    }
    await setJSON(snapKey(date), snap);
    lastWritten.set(date, sig);
  }
}

export async function loadDay(date: string): Promise<SnapEntry[]> {
  const snap = await getJSON<Snap>(snapKey(date));
  return snap ? Object.values(snap).sort((a, b) => a.kickoff.localeCompare(b.kickoff)) : [];
}

export async function findSnapshot(id: string): Promise<SnapEntry | null> {
  const m = id.match(/(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const base = Date.parse(`${m[1]}T12:00:00Z`);
  for (const off of [0, 1, -1]) {
    const snap = await getJSON<Snap>(snapKey(new Date(base + off * 86400_000).toISOString().slice(0, 10)));
    if (snap?.[id]) return snap[id];
  }
  return null;
}

// ---------------------------------------------------------------- sonuçlandırma

interface FmResult {
  id: number;
  kickoff: Date;
  home: string;
  away: string;
  finished: boolean;
  hg: number;
  ag: number;
}

export function parseFotmobResults(json: unknown): FmResult[] {
  const out: FmResult[] = [];
  for (const l of (json as { leagues?: { matches?: unknown[] }[] })?.leagues ?? [])
    for (const m of (l.matches ?? []) as {
      id?: number;
      home?: { name?: string; score?: number };
      away?: { name?: string; score?: number };
      status?: { utcTime?: string; finished?: boolean; cancelled?: boolean };
    }[]) {
      if (!m.id || !m.status?.utcTime || !m.home?.name || !m.away?.name || m.status.cancelled) continue;
      out.push({
        id: m.id,
        kickoff: new Date(m.status.utcTime),
        home: m.home.name,
        away: m.away.name,
        finished: !!m.status.finished,
        hg: Number(m.home.score ?? 0),
        ag: Number(m.away.score ?? 0),
      });
    }
  return out;
}

/** matchDetails içinden ilk yarı skoru ("Half" olayı, HT) */
export function parseHalfTime(json: unknown): { hht: number; aht: number } | null {
  const ev = (json as { content?: { matchFacts?: { events?: { events?: { type?: string; halfStrShort?: string; homeScore?: number; awayScore?: number }[] } } } })
    ?.content?.matchFacts?.events?.events;
  const ht = ev?.find((e) => e.type === "Half" && e.halfStrShort === "HT");
  return ht && typeof ht.homeScore === "number" && typeof ht.awayScore === "number" ? { hht: ht.homeScore, aht: ht.awayScore } : null;
}

/** Tercih tuttu mu? (ilk yarı gerektiren pazarda ilk yarı skoru yoksa null) */
export function pickWon(key: string, r: { hg: number; ag: number; hht?: number; aht?: number }): boolean | null {
  let def;
  try {
    def = describe(key);
  } catch {
    return null;
  }
  const res = (d: number) => (d > 0 ? "1" : d === 0 ? "X" : "2");
  if (def.kind === "ft") return def.pred!(r.hg, r.ag);
  if (r.hht === undefined || r.aht === undefined) return null;
  if (def.kind === "ht") return def.pred!(r.hht, r.aht);
  if (def.kind === "htft") return `${res(r.hht - r.aht)}/${res(r.hg - r.ag)}` === def.selection;
  return null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Günün bitmiş maçlarını sonuçlandırır ve öğrenme istatistiğini günceller. Süre sınırlı, hata olursa sessiz. */
export async function settleDay(date: string, now = Date.now(), budgetMs = 4000): Promise<number> {
  if (!getStore()) return 0;
  const snap = await getJSON<Snap>(snapKey(date));
  if (!snap) return 0;
  const pending = Object.values(snap).filter((e) => !e.result && new Date(e.kickoff).getTime() + 110 * MIN < now);
  if (!pending.length) return 0;
  const deadline = Date.now() + budgetMs;

  const days = [...new Set(pending.map((e) => ymd(new Date(e.kickoff))))];
  const lists = (
    await Promise.all(
      days.map(async (d) => {
        try {
          const f = await cachedFetch(`fotmob-results-${d}.json`, "FotMob sonuçlar", `https://www.fotmob.com/api/data/matches?date=${d}`, 10 * MIN);
          return parseFotmobResults(JSON.parse(f.text));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const learn = (await getJSON<Learning>(LEARN_KEY)) ?? {};
  let settled = 0;
  for (const e of pending) {
    if (Date.now() > deadline) break;
    const ko = new Date(e.kickoff).getTime();
    const fm =
      lists.find((x) => x.id === e.fotmobId) ??
      lists.find(
        (x) =>
          Math.abs(x.kickoff.getTime() - ko) < 90 * MIN && nameSimilarity(x.home, e.home) >= 0.6 && nameSimilarity(x.away, e.away) >= 0.6,
      );
    if (!fm || !fm.finished) continue;
    let ht: { hht: number; aht: number } | null = null;
    {
      try {
        const det = await cachedFetch(`fotmob-details-${fm.id}-final.json`, "FotMob ayrıntı", `https://www.fotmob.com/api/data/matchDetails?matchId=${fm.id}`, 24 * 60 * MIN);
        ht = parseHalfTime(JSON.parse(det.text));
      } catch {
        ht = null;
      }
    }
    const r = { hg: fm.hg, ag: fm.ag, ...(ht ?? {}) };
    const won = e.pick ? pickWon(e.pick.key, r) : null;
    e.result = { ...r, pickWon: won, settledAt: new Date(now).toISOString() };
    if (e.pick && won !== null) {
      const c = (learn[e.pick.category] ??= { n: 0, hits: 0, pred: 0 });
      c.n++;
      c.hits += won ? 1 : 0;
      c.pred += e.pick.prob;
    }
    settled++;
  }
  if (settled) {
    await setJSON(snapKey(date), snap);
    await setJSON(LEARN_KEY, learn);
    learnMemo = null;
  }
  return settled;
}

// ---------------------------------------------------------------- öğrenme

export type Learning = Partial<Record<Category, { n: number; hits: number; pred: number }>>;
const LEARN_KEY = "learn:v1";
/** Önsel: düzeltme ancak bu kadar "beklenen isabet" birikince belirginleşir */
const PRIOR = 40;
let learnMemo: { at: number; data: Learning } | null = null;

export async function getLearning(): Promise<Learning> {
  if (learnMemo && Date.now() - learnMemo.at < 10 * MIN) return learnMemo.data;
  const data = (getStore() && (await getJSON<Learning>(LEARN_KEY).catch(() => null))) || {};
  learnMemo = { at: Date.now(), data };
  return data;
}

/** Tercih türü başına düzeltme katsayısı: (gerçek isabet + önsel) / (beklenen isabet + önsel), 0.85–1.15 arası */
export function calibrationFactors(l: Learning): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const [cat, v] of Object.entries(l) as [Category, { n: number; hits: number; pred: number }][]) {
    const f = (v.hits + PRIOR) / (v.pred + PRIOR);
    out[cat] = Math.min(1.15, Math.max(0.85, f));
  }
  return out;
}
