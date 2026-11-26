import { getJSON, getStore, setJSON } from "./auth/store";
import { cachedFetch } from "./providers/cache";
import { loadAnalyses } from "./data";
import { historyIfReady, loadHistory } from "./history";
import { type SelectionMatch } from "./oddsMatch";
import { oddsAttrs, oddsConfidence, selectionsFor } from "./oddsPicks";
import { mapperFor, type Mapper } from "./calibration";
import { inBackground } from "./background";
import { parseFotmobResults, parseHalfTime, trDate } from "./tracking";
import { earlyWon, liveWon, parseGoals } from "./liveTracking";
import type { LiveBet, LiveSpec } from "./liveModel";
import type { LiveItem } from "./liveData";
import type { Analysis } from "./types";

/**
 * Üçlü onay: aynı tercih için üç sistemin (Maçlar, Oranlar, Canlı) her biri kazanma olasılığı ≥ %65 veriyorsa
 * (her sistem kendi yöntemiyle ve kendi sonuçlarına göre düzeltilmiş olasılıkla).
 * Sistemlerin hesabı değişmez; yalnız aynı seçenek için üçünün güveni yan yana konur.
 * Canlı sistemi yalnız maç oynanırken güven verdiği için üçlü onay maç sırasında oluşur.
 */

export const CONS_MIN = 65;
const MIN = 60_000;

/** Canlı tercihin maç öncesi pazar anahtarı (markets.ts biçimi) */
export function specKey(spec: LiveSpec): string | null {
  switch (spec.t) {
    case "ouFT":
      return `ou:${spec.line}:${spec.over ? "o" : "u"}`;
    case "ou1H":
      return `htou:${spec.line}:${spec.over ? "o" : "u"}`;
    case "btts":
      return spec.yes ? "btts:y" : "btts:n";
    case "res": {
      const o = [...spec.out].sort((a, b) => "1X2".indexOf(a) - "1X2".indexOf(b)).join("");
      if (o.length === 1) return `1x2:${o}`;
      return o === "1X" || o === "X2" || o === "12" ? `dc:${o}` : null;
    }
    case "next":
      return null;
  }
}

export interface SysScore {
  prob: number; // kazanma olasılığı (0–1), sistemin kendi aralık düzeltmesiyle
  confidence: number;
  odd?: number;
}

export interface ConsSel {
  key: string;
  label: string;
  spec: LiveSpec;
  mac: SysScore;
  oran: SysScore & { rate: number; n: number };
  canli: SysScore;
}

export interface ConsMatch {
  fotmobId: number;
  matchId: string;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  minute: string;
  hg: number;
  ag: number;
  sels: ConsSel[];
}

/* ---------------------------------------------------- Oranlar: tüm seçenekler (maç başına önbellek) */

async function oddsSelections(a: Analysis): Promise<SelectionMatch[]> {
  const hist = await loadHistory();
  return selectionsFor(a, hist.matches);
}

const oranScore = (s: SelectionMatch | undefined, winOf: Mapper, a: Analysis) =>
  s && s.supported && s.n >= 150 ? { prob: winOf(s.rate, oddsAttrs(s, { id: a.match.id, league: a.match.league })), confidence: oddsConfidence(s), odd: s.odd, rate: s.rate, n: s.n } : null;

/** Maç öncesi iki sistem (Maçlar + Oranlar): her seçenek için güvenler */
export async function preScores(a: Analysis): Promise<Map<string, { mac: SysScore; oran: SysScore & { rate: number; n: number } }>> {
  const [sel, winOf] = await Promise.all([oddsSelections(a), mapperFor("oran").catch((): Mapper => (p) => p)]);
  const out = new Map<string, { mac: SysScore; oran: SysScore & { rate: number; n: number } }>();
  for (const r of a.rows) {
    const o = oranScore(sel.find((x) => x.key === r.key), winOf, a);
    if (!o) continue;
    out.set(r.key, { mac: { confidence: r.confidence, odd: r.odd, prob: r.prob }, oran: o });
  }
  return out;
}

/** Oynanan (analizli) maçlarda üç sistemin de ≥ %65 güven verdiği seçenekler */
export async function liveConsensus(items: LiveItem[], min = CONS_MIN): Promise<ConsMatch[]> {
  const { analyses } = await loadAnalyses();
  const out: ConsMatch[] = [];
  for (const it of items) {
    const a = it.pre?.matchId ? analyses.find((x) => x.match.id === it.pre!.matchId) : undefined;
    if (!a) continue;
    const pre = await preScores(a);
    const sels: ConsSel[] = [];
    for (const b of it.model.probs as LiveBet[]) {
      const key = specKey(b.spec);
      const p = key ? pre.get(key) : undefined;
      if (!key || !p) continue;
      if (b.prob * 100 < min || p.mac.prob * 100 < min || p.oran.prob * 100 < min) continue;
      sels.push({ key, label: b.label, spec: b.spec, mac: p.mac, oran: p.oran, canli: { confidence: b.confidence, odd: b.odd, prob: b.prob } });
    }
    if (sels.length)
      out.push({
        fotmobId: it.id,
        matchId: a.match.id,
        league: it.league,
        home: it.home,
        away: it.away,
        kickoff: it.kickoff,
        minute: it.minuteLabel,
        hg: it.hg,
        ag: it.ag,
        sels: sels.sort((x, y) => Math.min(y.mac.prob, y.oran.prob, y.canli.prob) - Math.min(x.mac.prob, x.oran.prob, x.canli.prob)),
      });
  }
  return out;
}

/** Başlamamış maçlarda Maçlar + Oranlar'ın ≥ %65 verdiği seçenekler (canlı onayını bekleyenler) */
async function computeWaiting(min: number, now: number) {
  if (!(await historyIfReady())) return []; // arşiv yükleniyor; sayfa beklemesin
  const { analyses } = await loadAnalyses();
  const today = trDate(now);
  const out: { a: Analysis; sels: { key: string; label: string; mac: SysScore; oran: SysScore & { rate: number; n: number } }[] }[] = [];
  for (const a of analyses) {
    const t = new Date(a.match.kickoff).getTime();
    if (t <= now || trDate(t) !== today) continue;
    const pre = await preScores(a);
    await new Promise<void>((r) => setImmediate(r)); // olay döngüsüne nefes
    const sels = [...pre.entries()]
      .filter(([, p]) => p.mac.prob * 100 >= min && p.oran.prob * 100 >= min)
      .map(([key, p]) => {
        const r = a.rows.find((x) => x.key === key)!;
        return { key, label: `${r.market} · ${r.selection}`, ...p };
      });
    if (sels.length) out.push({ a, sels });
  }
  return out.sort((x, y) => x.a.match.kickoff.localeCompare(y.a.match.kickoff));
}

type Waiting = Awaited<ReturnType<typeof computeWaiting>>;
let waitMemo: { at: number; data: Waiting } | null = null;
let waitJob: Promise<Waiting> | null = null;

/** Canlı onayını bekleyenler: 5 dk önbellek; hesap uzun sürerse sayfa en fazla 2 sn bekler, gerisi arka planda */
export async function waitingConsensus(min = CONS_MIN, now = Date.now()): Promise<Waiting> {
  if (waitMemo && now - waitMemo.at < 5 * 60_000) return waitMemo.data;
  waitJob ??= computeWaiting(min, now)
    .then((d) => {
      waitMemo = { at: Date.now(), data: d };
      return d;
    })
    .finally(() => {
      waitJob = null;
    });
  const job = waitJob;
  const r = await Promise.race([job, new Promise<null>((res) => setTimeout(() => res(null), 2000).unref?.())]);
  if (r) return r;
  inBackground(() => job);
  return waitMemo?.data ?? [];
}

/* ---------------------------------------------------- kayıt ve sonuç */

export interface ConsRecord {
  id: string; // fotmobId|key
  fotmobId: number;
  matchId: string;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  label: string;
  key: string;
  spec: LiveSpec;
  minute: string;
  hg: number;
  ag: number;
  mac: number; // kazanma olasılığı %
  oran: number;
  canli: number;
  odd?: number; // canlı oran (varsa), yoksa maç öncesi oran
  at: string;
  result?: { hg: number; ag: number; won: boolean | null; early?: boolean };
}
type Day = Record<string, ConsRecord>;
const dayKey = (d: string) => `uclu:${d}`;

/** Üçlü onaya ilk giren an kaydedilir (aynı maç + aynı seçenek bir kez) */
export async function recordConsensus(list: ConsMatch[], now = Date.now()): Promise<void> {
  if (!getStore() || !list.length) return;
  const date = trDate(now);
  const day = (await getJSON<Day>(dayKey(date))) ?? {};
  let added = 0;
  for (const m of list)
    for (const s of m.sels) {
      const id = `${m.fotmobId}|${s.key}`;
      if (day[id]) continue;
      day[id] = {
        id,
        fotmobId: m.fotmobId,
        matchId: m.matchId,
        league: m.league,
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        label: s.label,
        key: s.key,
        spec: s.spec,
        minute: m.minute,
        hg: m.hg,
        ag: m.ag,
        mac: Math.round(s.mac.prob * 100),
        oran: Math.round(s.oran.prob * 100),
        canli: Math.round(s.canli.prob * 100),
        odd: s.canli.odd ?? s.mac.odd,
        at: new Date(now).toISOString(),
      };
      added++;
    }
  if (added) await setJSON(dayKey(date), day);
}

export async function loadConsensusDay(date: string): Promise<ConsRecord[]> {
  const d = await getJSON<Day>(dayKey(date)).catch(() => null);
  return d ? Object.values(d).sort((a, b) => b.at.localeCompare(a.at)) : [];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Kesinleşen (maç sırasında ya da sonunda) üçlü onayları sonuçlandırır */
export async function settleConsensus(date: string, now = Date.now(), budgetMs = 3000): Promise<number> {
  if (!getStore()) return 0;
  const day = await getJSON<Day>(dayKey(date)).catch(() => null);
  if (!day) return 0;
  const pending = Object.values(day).filter((r) => !r.result || r.result.early);
  if (!pending.length) return 0;
  const deadline = Date.now() + budgetMs;
  const lists = (
    await Promise.all(
      [...new Set(pending.map((r) => ymd(new Date(r.kickoff))))].map(async (d) => {
        try {
          const f = await cachedFetch(`fotmob-results-${d}.json`, "FotMob sonuçlar", `https://www.fotmob.com/api/data/matches?date=${d}`, 3 * MIN);
          return parseFotmobResults(JSON.parse(f.text));
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  let changed = 0;
  for (const r of pending) {
    if (Date.now() > deadline) break;
    const fm = lists.find((x) => x.id === r.fotmobId);
    if (!fm) continue;
    let det: { ht: { hht: number; aht: number } | null; goals: { home: boolean }[] } | null = null;
    try {
      const f = fm.finished
        ? await cachedFetch(`fotmob-details-${fm.id}-final.json`, "FotMob ayrıntı", `https://www.fotmob.com/api/data/matchDetails?matchId=${fm.id}`, 24 * 60 * MIN)
        : await cachedFetch(`fotmob-live-det-${fm.id}.json`, "FotMob canlı ayrıntı", `https://www.fotmob.com/api/data/matchDetails?matchId=${fm.id}`, 45_000);
      const j = JSON.parse(f.text);
      det = { ht: parseHalfTime(j), goals: parseGoals(j) };
    } catch {
      det = null;
    }
    const score = { hg: fm.hg, ag: fm.ag, ...(det?.ht ?? {}) };
    const next = det?.goals.length ? (det.goals[r.hg + r.ag]?.home ?? null) : undefined;
    if (r.result?.early) {
      if (!fm.finished) continue;
      r.result = { hg: fm.hg, ag: fm.ag, won: r.result.won };
      changed++;
      continue;
    }
    if (fm.finished) {
      const won = liveWon(r.spec, r, score, next);
      if (won === null && r.spec.t === "ou1H" && new Date(r.kickoff).getTime() + 6 * 60 * MIN > now) continue;
      r.result = { hg: fm.hg, ag: fm.ag, won };
      changed++;
      continue;
    }
    const won = earlyWon(r.spec, r, score, next);
    if (won === undefined || won === null) continue;
    r.result = { hg: fm.hg, ag: fm.ag, won, early: true };
    changed++;
  }
  if (changed) {
    const latest = (await getJSON<Day>(dayKey(date))) ?? {};
    for (const [id, r] of Object.entries(day)) if (r.result) latest[id] = { ...(latest[id] ?? r), result: r.result };
    await setJSON(dayKey(date), latest);
  }
  return changed;
}
