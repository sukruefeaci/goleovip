import { getJSON, getStore, setJSON } from "./auth/store";
import { cachedFetch } from "./providers/cache";
import { parseFotmobResults, parseHalfTime, trDate } from "./tracking";
import type { LiveBet, LiveKind, LiveSpec } from "./liveModel";

/**
 * Canlı önerilerin kaydı ve kendini geliştirme.
 * Bir öneri ilk kez yapıldığı an kaydedilir (dakika, skor, olasılık, güven); maç bitince FotMob'dan
 * maç sonu skoru, ilk yarı skoru ve gol sırası alınır, öneri tuttu/tutmadı işaretlenir.
 * Öneri türü başına gerçek / beklenen isabetten olasılık çarpanı öğrenilir (learnLive:v1).
 * Ayrıca duruma göre öğrenilir (learnLiveSit:v1): dakika aralığı, skor farkı, tempo, canlı veri türü ve
 * maç öncesi analiz. Her durum için ayrı karne tutulur; tür çarpanına göre fark kadar ek düzeltme yapılır.
 */

const MIN = 60_000;
const liveKey = (date: string) => `live:${date}`;
const LEARN_KEY = "learnLive:v1";
const PRIOR = 40;
const SIT_KEY = "learnLiveSit:v1";
const SIT_PRIOR = 30; // durum karnesi için çekim (az veride düzeltme küçük kalır)
const REBUILD_DAYS = 45;

/** Önerinin yapıldığı andaki durum */
export interface LiveCtx {
  phase: "1H" | "HT" | "2H";
  min: number;
  tempo?: "Yüksek" | "Normal" | "Düşük";
  data?: "xG" | "şut" | "yok";
  prior?: "market" | "elo" | "yok";
}

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
  raw?: number; // öğrenme düzeltmesinden önceki model olasılığı
  ctx?: LiveCtx;
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
  ctx?: LiveCtx;
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
      raw: r.raw,
      ctx: it.ctx,
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
  const sit = await loadSituations(now);
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
      c.pred += r.raw ?? r.prob;
      addSituation(sit, r);
    }
    settled++;
  }
  if (settled) {
    await setJSON(liveKey(date), day);
    await setJSON(LEARN_KEY, learn);
    await setJSON(SIT_KEY, sit);
    learnMemo = null;
    sitMemo = null;
  }
  return settled;
}

/* ------------------------------------------------------------------ */
/* Duruma göre öğrenme                                                 */
/* ------------------------------------------------------------------ */

export type SitStat = { n: number; hits: number; pred: number };
export interface LiveSituations {
  v: 1;
  b: Record<string, SitStat>; // anahtar: "tür|boyut|değer"
}

export const SIT_DIMS = ["Süre", "Skor", "Tempo", "Canlı veri", "Maç öncesi"] as const;
export type SitDim = (typeof SIT_DIMS)[number];

/** Eski kayıtlarda durum yoksa dakika etiketinden çıkarılır ("67'", "45+2'", "İY") */
export function ctxOf(r: Pick<LiveRecord, "minute" | "ctx">): LiveCtx {
  if (r.ctx) return r.ctx;
  if (r.minute === "İY") return { phase: "HT", min: 45 };
  const m = r.minute.match(/^(\d+)(?:\+(\d+))?/);
  const min = m ? Number(m[1]) + Number(m[2] ?? 0) : 0;
  return { phase: m && Number(m[1]) > 45 ? "2H" : "1H", min };
}

/** Bir önerinin durum değerleri (boyut → değer); bilinmeyen boyut yer almaz */
export function situationOf(ctx: LiveCtx, hg: number, ag: number): [SitDim, string][] {
  const out: [SitDim, string][] = [];
  const min = ctx.phase === "HT" ? 45 : ctx.min;
  out.push(["Süre", min <= 30 ? "0–30. dk" : min <= 60 ? "31–60. dk" : min <= 75 ? "61–75. dk" : "76+ dk"]);
  const d = Math.abs(hg - ag);
  out.push(["Skor", d === 0 ? "eşit" : d === 1 ? "1 gol fark" : "2+ gol fark"]);
  if (ctx.tempo) out.push(["Tempo", ctx.tempo]);
  if (ctx.data) out.push(["Canlı veri", ctx.data === "xG" ? "xG var" : ctx.data === "şut" ? "yalnız şut" : "yok"]);
  if (ctx.prior) out.push(["Maç öncesi", ctx.prior === "market" ? "oranlı analiz" : ctx.prior === "elo" ? "Elo analizi" : "analiz yok"]);
  return out;
}

const sitKey = (kind: LiveKind, dim: SitDim, val: string) => `${kind}|${dim}|${val}`;

function addSituation(s: LiveSituations, r: LiveRecord) {
  if (!r.result || r.result.won === null) return;
  for (const [dim, val] of situationOf(ctxOf(r), r.hg, r.ag)) {
    const c = (s.b[sitKey(r.kind, dim, val)] ??= { n: 0, hits: 0, pred: 0 });
    c.n++;
    c.hits += r.result.won ? 1 : 0;
    c.pred += r.raw ?? r.prob;
  }
}

/** Durum karnesi; ilk kez çalışınca geçmiş kayıtlardan (son 45 gün) kurulur */
async function loadSituations(now = Date.now()): Promise<LiveSituations> {
  const s = await getJSON<LiveSituations>(SIT_KEY).catch(() => null);
  if (s?.v === 1) return s;
  const fresh: LiveSituations = { v: 1, b: {} };
  const dates = Array.from({ length: REBUILD_DAYS }, (_, i) => trDate(now - i * 86400_000));
  const days = await Promise.all(dates.map((d) => getJSON<Day>(liveKey(d)).catch(() => null)));
  for (const day of days) if (day) for (const r of Object.values(day)) addSituation(fresh, r);
  await setJSON(SIT_KEY, fresh);
  return fresh;
}

let sitMemo: { at: number; data: LiveSituations } | null = null;
export async function getLiveSituations(): Promise<LiveSituations> {
  if (sitMemo && Date.now() - sitMemo.at < 10 * MIN) return sitMemo.data;
  const data = getStore() ? await loadSituations().catch(() => ({ v: 1 as const, b: {} })) : { v: 1 as const, b: {} };
  sitMemo = { at: Date.now(), data };
  return data;
}

const shrink = (v: SitStat | undefined, prior: number) => (v ? (v.hits + prior) / (v.pred + prior) : 1);

/** Durum çarpanı: o durumdaki karne ile türün genel karnesi arasındaki fark (her boyut ±%10, toplam ±%15) */
export function situationAdjust(kind: LiveKind, sit: [SitDim, string][], l: LiveLearning, s: LiveSituations): number {
  const base = shrink(l[kind], SIT_PRIOR);
  let f = 1;
  for (const [dim, val] of sit) {
    const v = s.b[sitKey(kind, dim, val)];
    if (!v) continue;
    f *= Math.min(1.1, Math.max(0.9, shrink(v, SIT_PRIOR) / base));
  }
  return Math.min(1.15, Math.max(0.85, f));
}

/** Tür + durum düzeltmesini veren fonksiyon (canlı modelde kullanılır) */
export function liveFactorFn(l: LiveLearning, s: LiveSituations, ctx: LiveCtx, hg: number, ag: number): (kind: LiveKind) => number {
  const kf = liveFactors(l);
  const sit = situationOf(ctx, hg, ag);
  return (kind) => Math.min(1.25, Math.max(0.75, (kf[kind] ?? 1) * situationAdjust(kind, sit, l, s)));
}

/** Arayüz için: yeterli örneği olan durumlar, düzeltmeye göre */
export function situationRows(l: LiveLearning, s: LiveSituations, minN = 8) {
  return Object.entries(s.b)
    .filter(([, v]) => v.n >= minN)
    .map(([k, v]) => {
      const [kind, dim, val] = k.split("|") as [LiveKind, SitDim, string];
      return { kind, dim, val, ...v, adj: situationAdjust(kind, [[dim, val]], l, s) };
    })
    .sort((a, b) => Math.abs(b.adj - 1) - Math.abs(a.adj - 1) || b.n - a.n);
}
