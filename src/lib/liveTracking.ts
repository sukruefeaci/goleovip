import { getJSON, getStore, setJSON } from "./auth/store";
import { cachedFetch } from "./providers/cache";
import { parseFotmobResults, parseHalfTime, trDate } from "./tracking";
import type { LiveBet, LiveKind, LiveSpec } from "./liveModel";

/**
 * Canlı önerilerin kaydı ve kendini geliştirme.
 * Bir öneri ilk kez yapıldığı an kaydedilir (dakika, skor, olasılık, güven); maç bitince FotMob'dan
 * maç sonu skoru, ilk yarı skoru ve gol sırası alınır, öneri tuttu/tutmadı işaretlenir.
 * Öneri türü başına gerçek / beklenen isabetten olasılık çarpanı öğrenilir (learnLive:v1).
 */

const MIN = 60_000;
const liveKey = (date: string) => `live:${date}`;
const LEARN_KEY = "learnLive:v1";
const PRIOR = 40;

export interface LiveRecord {
  fotmobId: number;
  home: string;
  away: string;
  league: string;
  kickoff: string;
  minute: string;
  hg: number; // öneri anındaki skor
  ag: number;
  label: string;
  kind: LiveKind;
  spec: LiveSpec;
  prob: number;
  confidence: number;
  odd?: number; // varsa öneri anındaki canlı oran
  at: string;
  result?: { hg: number; ag: number; hht?: number; aht?: number; won: boolean | null };
}

type Day = Record<string, LiveRecord>;
const recId = (fotmobId: number, label: string) => `${fotmobId}|${label}`;

export interface RecordInput {
  fotmobId: number;
  home: string;
  away: string;
  league: string;
  kickoff: Date;
  minute: string;
  hg: number;
  ag: number;
  recs: (LiveBet & { odd?: number })[];
}

const written = new Set<string>();

/** Yeni önerileri kaydeder; aynı maç + aynı öneri ikinci kez yazılmaz (ilk öneri anı esas) */
export async function recordLive(items: RecordInput[], now = Date.now()): Promise<number> {
  if (!getStore()) return 0;
  const fresh = items.flatMap((it) => it.recs.filter((r) => !written.has(recId(it.fotmobId, r.label))).map((r) => ({ it, r })));
  if (!fresh.length) return 0;
  const date = trDate(now);
  const day = (await getJSON<Day>(liveKey(date))) ?? {};
  let added = 0;
  for (const { it, r } of fresh) {
    const id = recId(it.fotmobId, r.label);
    written.add(id);
    if (day[id]) continue;
    day[id] = {
      fotmobId: it.fotmobId,
      home: it.home,
      away: it.away,
      league: it.league,
      kickoff: it.kickoff.toISOString(),
      minute: it.minute,
      hg: it.hg,
      ag: it.ag,
      label: r.label,
      kind: r.kind,
      spec: r.spec,
      prob: r.prob,
      confidence: r.confidence,
      odd: r.odd,
      at: new Date(now).toISOString(),
    };
    added++;
  }
  if (added) await setJSON(liveKey(date), day);
  return added;
}

export async function loadLiveDay(date: string): Promise<LiveRecord[]> {
  const d = await getJSON<Day>(liveKey(date));
  return d ? Object.values(d).sort((a, b) => b.at.localeCompare(a.at)) : [];
}

/** Gol olayları (dakika sırasıyla): true = ev sahibi */
export function parseGoals(json: unknown): { home: boolean; min: number }[] {
  const ev =
    (json as { content?: { matchFacts?: { events?: { events?: { type?: string; isHome?: boolean; time?: number; overloadTime?: number }[] } } } })?.content
      ?.matchFacts?.events?.events ?? [];
  return ev
    .filter((e) => e.type === "Goal" && typeof e.isHome === "boolean")
    .map((e) => ({ home: e.isHome!, min: (e.time ?? 0) + (e.overloadTime ?? 0) / 100 }))
    .sort((a, b) => a.min - b.min);
}

const res = (d: number) => (d > 0 ? "1" : d === 0 ? "X" : "2");

/** Canlı öneri tuttu mu? goals: öneri anından sonraki goller sırayla (sıradaki gol için) */
export function liveWon(
  spec: LiveSpec,
  at: { hg: number; ag: number },
  fin: { hg: number; ag: number; hht?: number; aht?: number },
  nextGoalHome: boolean | null | undefined,
): boolean | null {
  switch (spec.t) {
    case "ouFT":
      return spec.over ? fin.hg + fin.ag > spec.line : fin.hg + fin.ag < spec.line;
    case "ou1H":
      if (fin.hht === undefined || fin.aht === undefined) return null;
      return spec.over ? fin.hht + fin.aht > spec.line : fin.hht + fin.aht < spec.line;
    case "btts":
      return spec.yes ? fin.hg > 0 && fin.ag > 0 : fin.hg === 0 || fin.ag === 0;
    case "res":
      return spec.out.includes(res(fin.hg - fin.ag));
    case "next":
      if (fin.hg + fin.ag === at.hg + at.ag) return false; // başka gol olmadı
      if (nextGoalHome === undefined) return null; // gol sırası bilinmiyor
      return nextGoalHome === spec.home;
  }
}

export type LiveLearning = Partial<Record<LiveKind, { n: number; hits: number; pred: number }>>;
let learnMemo: { at: number; data: LiveLearning } | null = null;

export async function getLiveLearning(): Promise<LiveLearning> {
  if (learnMemo && Date.now() - learnMemo.at < 10 * MIN) return learnMemo.data;
  const data = (getStore() && (await getJSON<LiveLearning>(LEARN_KEY).catch(() => null))) || {};
  learnMemo = { at: Date.now(), data };
  return data;
}

export function liveFactors(l: LiveLearning): Partial<Record<LiveKind, number>> {
  const out: Partial<Record<LiveKind, number>> = {};
  for (const [k, v] of Object.entries(l) as [LiveKind, { n: number; hits: number; pred: number }][])
    out[k] = Math.min(1.15, Math.max(0.85, (v.hits + PRIOR) / (v.pred + PRIOR)));
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Bitmiş maçlardaki canlı önerileri sonuçlandırır, öğrenmeyi günceller */
export async function settleLive(date: string, now = Date.now(), budgetMs = 4000): Promise<number> {
  if (!getStore()) return 0;
  const day = await getJSON<Day>(liveKey(date));
  if (!day) return 0;
  const pending = Object.values(day).filter((r) => !r.result && new Date(r.kickoff).getTime() + 105 * MIN < now);
  if (!pending.length) return 0;
  const deadline = Date.now() + budgetMs;
  const days = [...new Set(pending.map((r) => ymd(new Date(r.kickoff))))];
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

  const learn = (await getJSON<LiveLearning>(LEARN_KEY)) ?? {};
  const detCache = new Map<number, { ht: { hht: number; aht: number } | null; goals: { home: boolean; min: number }[] } | null>();
  let settled = 0;
  for (const r of pending) {
    if (Date.now() > deadline) break;
    const fm = lists.find((x) => x.id === r.fotmobId);
    if (!fm || !fm.finished) continue;
    if (!detCache.has(fm.id)) {
      try {
        const f = await cachedFetch(`fotmob-details-${fm.id}-final.json`, "FotMob ayrıntı", `https://www.fotmob.com/api/data/matchDetails?matchId=${fm.id}`, 24 * 60 * MIN);
        const j = JSON.parse(f.text);
        detCache.set(fm.id, { ht: parseHalfTime(j), goals: parseGoals(j) });
      } catch {
        detCache.set(fm.id, null);
      }
    }
    const det = detCache.get(fm.id);
    const fin = { hg: fm.hg, ag: fm.ag, ...(det?.ht ?? {}) };
    // Öneri anından sonraki ilk gol: o andaki skordan sonraki gol olayı
    let next: boolean | null | undefined = undefined;
    if (det?.goals.length) {
      const after = det.goals[r.hg + r.ag];
      next = after ? after.home : null;
    }
    const won = liveWon(r.spec, r, fin, next);
    r.result = { ...fin, won };
    if (won !== null) {
      const c = (learn[r.kind] ??= { n: 0, hits: 0, pred: 0 });
      c.n++;
      c.hits += won ? 1 : 0;
      c.pred += r.prob;
    }
    settled++;
  }
  if (settled) {
    await setJSON(liveKey(date), day);
    await setJSON(LEARN_KEY, learn);
    learnMemo = null;
  }
  return settled;
}
