import { getJSON, getStore, setJSON } from "./auth/store";
import { loadDay, trDate } from "./tracking";
import type { Analysis, TeamInput } from "./types";

/**
 * Dönüş sekmesi: İY/MS'de "dönen" sonuçlar (yüksek oranlı).
 *  - Ters dönüş: 1/2 ve 2/1 (ilk yarı önde olan maçı kaybeder) → günde 5 maç
 *  - Beraberliğe dönüş: 1/X ve 2/X (ilk yarı önde olan maçı kazanamaz) → günde 5 maç
 * Sıralama: maç analizinin İY/MS olasılığı (ilk yarı gol payları, gol beklentisi, piyasa) ×
 *   takımların geçmişi (son maçlarda önde bitirip bırakma / geriden gelme sıklığı) ×
 *   ikinci yarı tepkisi (öndeyken gol yeme, gerideyken gol atma) × sistemin kendi sonuçlarından öğrendiği düzeltme.
 * Seçimler maç başlayınca dondurulur; sonuçlar maç önü kayıtlarından (ilk yarı skoru dahil) işlenir.
 */

export type DonusGroup = "ters" | "beraber";
export const PER_GROUP = 5;
export const GROUP_LABEL: Record<DonusGroup, string> = { ters: "Ters dönüş (1/2 · 2/1)", beraber: "Beraberliğe dönüş (1/X · 2/X)" };
const OUTCOMES: Record<DonusGroup, string[]> = { ters: ["1/2", "2/1"], beraber: ["1/X", "2/X"] };

export interface DonusPick {
  id: string;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  group: DonusGroup;
  outcome: string; // ör. "1/2"
  prob: number; // gösterilen (düzeltilmiş) olasılık
  base: number; // analizin ham İY/MS olasılığı
  odd?: number; // iddaa İY/MS oranı
  reasons: string[];
  result?: { hht: number; aht: number; hg: number; ag: number; real: string; won: boolean };
}

type Day = { v: 1; picks: DonusPick[]; updatedAt: string };
const dayKey = (d: string) => `donus:${d}`;
const LEARN_KEY = "donus:learn:v1";
type Learn = Record<DonusGroup, { n: number; hits: number; pred: number }>;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Bu sonucun takım gözünden geçmiş karşılığı: ev için "1/2" = İY önde (G) maç kaybı (M) */
function patterns(outcome: string): { home: string; away: string; leaderIsHome: boolean } {
  const [ht, ft] = outcome.split("/");
  const homeView = (r: string) => (r === "1" ? "G" : r === "2" ? "M" : "B");
  const awayView = (r: string) => (r === "2" ? "G" : r === "1" ? "M" : "B");
  return { home: `${homeView(ht)}/${homeView(ft)}`, away: `${awayView(ht)}/${awayView(ft)}`, leaderIsHome: ht === "1" };
}

/** Takımların son maçlarında bu dönüşün kaç kez yaşandığı → çarpan (az veride 1'e yakın) */
function historyFactor(home: TeamInput, away: TeamInput, outcome: string) {
  const p = patterns(outcome);
  const hh = home.htftHistory ?? [],
    ah = away.htftHistory ?? [];
  const n = hh.length + ah.length;
  const hits = hh.filter((x) => x === p.home).length + ah.filter((x) => x === p.away).length;
  // Genel sıklık: ters dönüş takım başına ≈%4, beraberliğe dönüş ≈%8
  const base = outcome.endsWith("X") ? 0.08 : 0.04;
  const PRIOR = 12;
  const rate = (hits + base * PRIOR) / (n + PRIOR);
  return { f: clamp(rate / base, 0.75, 1.4), hits, n, hHits: hh.filter((x) => x === p.home).length, aHits: ah.filter((x) => x === p.away).length };
}

/** İkinci yarı tepkisi: önde olan takım öndeyken ikinci yarıda gol yiyor mu, geride olan geriden gol atıyor mu */
function secondHalfFactor(home: TeamInput, away: TeamInput, outcome: string) {
  const { leaderIsHome } = patterns(outcome);
  const leader = leaderIsHome ? home : away,
    chaser = leaderIsHome ? away : home;
  const L = leader.secondHalf,
    C = chaser.secondHalf;
  const ratio = (s: { n: number; gf: number; ga: number } | undefined, all: { n: number; gf: number; ga: number } | undefined, k: "gf" | "ga") => {
    if (!s || !all || !all.n || !s.n) return { r: 1, per: null as number | null, n: s?.n ?? 0 };
    const avgAll = all[k] / all.n || 0.5;
    const per = s[k] / s.n;
    const PRIOR = 4;
    return { r: (s[k] + avgAll * PRIOR) / (s.n + PRIOR) / avgAll, per, n: s.n };
  };
  const leadConcede = ratio(L?.lead, L?.all, "ga"); // önde olan öndeyken 2. yarı yediği
  const chaseScore = ratio(C?.trail, C?.all, "gf"); // geride olan gerideyken 2. yarı attığı
  return { f: clamp(Math.sqrt(leadConcede.r * chaseScore.r), 0.8, 1.3), leader, chaser, leadConcede, chaseScore };
}

let learnMemo: { at: number; l: Learn } | null = null;
async function getLearn(): Promise<Learn> {
  if (learnMemo && Date.now() - learnMemo.at < 10 * 60_000) return learnMemo.l;
  const l = (getStore() ? await getJSON<Learn>(LEARN_KEY).catch(() => null) : null) ?? { ters: { n: 0, hits: 0, pred: 0 }, beraber: { n: 0, hits: 0, pred: 0 } };
  learnMemo = { at: Date.now(), l };
  return l;
}
/** Kendi sonuçlarından öğrenilen düzeltme (beklenenden çok tutuyorsa yukarı, az tutuyorsa aşağı) */
export const learnFactor = (g: { n: number; hits: number; pred: number }) => clamp((g.hits + 3) / (g.pred + 3), 0.6, 1.6);

const pct = (x: number) => `%${Math.round(x * 100)}`;
const pct1 = (x: number) => `%${(x * 100).toFixed(1).replace(".", ",")}`;

/** Bir maçın bir gruptaki en iyi dönüş adayı */
export function candidate(a: Analysis, group: DonusGroup, learn?: Learn): DonusPick | null {
  const m = a.match;
  let best: DonusPick | null = null;
  for (const outcome of OUTCOMES[group]) {
    const base = a.htft?.find((h) => h.outcome === outcome)?.prob;
    if (!base) continue;
    const hf = historyFactor(m.home, m.away, outcome);
    const sf = secondHalfFactor(m.home, m.away, outcome);
    const lf = learn ? learnFactor(learn[group]) : 1;
    const prob = clamp(base * hf.f * sf.f * lf, 0.001, 0.6);
    const leaderHome = outcome.startsWith("1");
    const reasons = [
      `Analiz: ${outcome} ihtimali ${pct1(base)} · İY gol payı ${m.home.short} ${pct(a.halfShare.home)} · ${m.away.short} ${pct(a.halfShare.away)}`,
      hf.n
        ? `Geçmiş: ${m.home.short} son ${m.home.htftHistory?.length ?? 0} maçta ${hf.hHits} kez, ${m.away.short} son ${m.away.htftHistory?.length ?? 0} maçta ${hf.aHits} kez bu dönüşü yaşadı`
        : "",
      sf.leadConcede.per !== null
        ? `${sf.leader.short} ilk yarıyı önde bitirdiği ${sf.leadConcede.n} maçta 2. yarıda maç başı ${sf.leadConcede.per.toFixed(1).replace(".", ",")} gol yedi`
        : "",
      sf.chaseScore.per !== null
        ? `${sf.chaser.short} ilk yarıyı geride bitirdiği ${sf.chaseScore.n} maçta 2. yarıda maç başı ${sf.chaseScore.per.toFixed(1).replace(".", ",")} gol attı`
        : "",
      `${leaderHome ? m.home.short : m.away.short} ilk yarı önde, ${outcome.endsWith("X") ? "maç berabere biter" : `${leaderHome ? m.away.short : m.home.short} maçı kazanır`}`,
    ].filter(Boolean);
    const odd = m.iddaa.find((l) => l.key === `htft:${outcome}`)?.odd;
    const p: DonusPick = { id: m.id, kickoff: m.kickoff, league: m.league, home: m.home.name, away: m.away.name, group, outcome, prob, base, odd, reasons };
    if (!best || p.prob > best.prob) best = p;
  }
  return best;
}

/** Bir günün güncel seçimi: başlamış maçların kayıtlı seçimleri sabit, kalan yerler başlamamış en olası maçlarla dolar */
export async function selectDay(analyses: Analysis[], date: string, now = Date.now(), stored?: DonusPick[]): Promise<DonusPick[]> {
  const learn = await getLearn();
  const prev = stored ?? (await loadDonusDay(date));
  const started = (p: { kickoff: string }) => new Date(p.kickoff).getTime() <= now;
  const frozen = prev.filter(started);
  const frozenIds = new Set(frozen.map((p) => p.id));
  const out: DonusPick[] = [...frozen];
  const used = new Set(frozen.map((p) => p.id));
  const pool = analyses.filter((a) => trDate(new Date(a.match.kickoff).getTime()) === date && !started(a.match) && !frozenIds.has(a.match.id));
  for (const g of ["ters", "beraber"] as DonusGroup[]) {
    const need = PER_GROUP - frozen.filter((p) => p.group === g).length;
    if (need <= 0) continue;
    const cands = pool
      .filter((a) => !used.has(a.match.id))
      .map((a) => candidate(a, g, learn))
      .filter((p): p is DonusPick => !!p)
      // önce iddaa'da İY/MS oranı olan maçlar (bültende oynanabilenler), sonra olasılık
      .sort((x, y) => Number(!!y.odd) - Number(!!x.odd) || y.prob - x.prob)
      .slice(0, need);
    for (const c of cands) {
      out.push(c);
      used.add(c.id);
    }
  }
  return out.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
}

export async function loadDonusDay(date: string): Promise<DonusPick[]> {
  if (!getStore()) return [];
  return (await getJSON<Day>(dayKey(date)).catch(() => null))?.picks ?? [];
}

const written = new Map<string, string>();

/** Seçimleri kaydet (bugün ve yarın) */
export async function recordDonus(analyses: Analysis[], now = Date.now()): Promise<number> {
  if (!getStore()) return 0;
  let n = 0;
  for (const date of [trDate(now), trDate(now + 86400_000)]) {
    const stored = await loadDonusDay(date);
    const picks = await selectDay(analyses, date, now, stored);
    // sonuçlar korunur
    const res = new Map(stored.filter((p) => p.result).map((p) => [p.id, p.result]));
    for (const p of picks) if (res.has(p.id)) p.result = res.get(p.id);
    const sig = JSON.stringify(picks.map((p) => [p.id, p.outcome, p.odd, !!p.result]));
    if (written.get(date) === sig) continue;
    await setJSON(dayKey(date), { v: 1, picks, updatedAt: new Date(now).toISOString() } satisfies Day);
    written.set(date, sig);
    n += picks.length;
  }
  return n;
}

const res = (d: number) => (d > 0 ? "1" : d < 0 ? "2" : "X");

/** Biten maçları sonuçlandır: maç önü kayıtlarındaki skor ve ilk yarı skorundan */
export async function settleDonus(date: string): Promise<number> {
  if (!getStore()) return 0;
  const d = await getJSON<Day>(dayKey(date)).catch(() => null);
  if (!d) return 0;
  const open = d.picks.filter((p) => !p.result);
  if (!open.length) return 0;
  const snaps = new Map((await loadDay(date).catch(() => [])).map((e) => [e.id, e]));
  const learn = await getLearn();
  let settled = 0;
  for (const p of open) {
    const r = snaps.get(p.id)?.result;
    if (!r || typeof r.hht !== "number" || typeof r.aht !== "number") continue;
    const real = `${res(r.hht - r.aht)}/${res(r.hg - r.ag)}`;
    p.result = { hht: r.hht, aht: r.aht, hg: r.hg, ag: r.ag, real, won: real === p.outcome };
    const g = learn[p.group];
    g.n++;
    g.hits += p.result.won ? 1 : 0;
    g.pred += p.base;
    settled++;
  }
  if (settled) {
    // başka yazımları ezmemek için en güncel kaydın üzerine yalnız sonuçları işle
    const latest = (await getJSON<Day>(dayKey(date)).catch(() => null)) ?? d;
    const byId = new Map(d.picks.filter((p) => p.result).map((p) => [p.id, p.result]));
    for (const p of latest.picks) if (!p.result && byId.has(p.id)) p.result = byId.get(p.id);
    await setJSON(dayKey(date), latest);
    await setJSON(LEARN_KEY, learn);
    learnMemo = { at: Date.now(), l: learn };
    written.delete(date);
  }
  return settled;
}

export interface DonusTally {
  shared: number;
  decided: number;
  won: number;
  odds: number; // tutanların oran toplamı (100 TL hesabı için)
  oddsKnown: number; // oranı bilinen karar verilmiş tahmin
  profitKnown: number; // oranı bilinenlerde 100 TL ile net
}
export function tally(picks: DonusPick[]): DonusTally {
  const t: DonusTally = { shared: picks.length, decided: 0, won: 0, odds: 0, oddsKnown: 0, profitKnown: 0 };
  for (const p of picks) {
    if (!p.result) continue;
    t.decided++;
    if (p.result.won) t.won++;
    if (p.odd && p.odd > 1) {
      t.oddsKnown++;
      t.profitKnown += p.result.won ? (p.odd - 1) * 100 : -100;
      if (p.result.won) t.odds += p.odd;
    }
  }
  return t;
}

let totalMemo: { at: number; v: { all: DonusTally; byGroup: Record<DonusGroup, DonusTally>; days: number } } | null = null;
/** Son 30 günün toplamı */
export async function donusTotals(now = Date.now()) {
  if (totalMemo && Date.now() - totalMemo.at < 5 * 60_000) return totalMemo.v;
  const dates = Array.from({ length: 30 }, (_, i) => trDate(now - i * 86400_000));
  const days = await Promise.all(dates.map((d) => loadDonusDay(d)));
  const all = days.flat().filter((p) => new Date(p.kickoff).getTime() <= now);
  const v = {
    all: tally(all),
    byGroup: { ters: tally(all.filter((p) => p.group === "ters")), beraber: tally(all.filter((p) => p.group === "beraber")) },
    days: days.filter((d) => d.length).length,
  };
  totalMemo = { at: Date.now(), v };
  return v;
}

export async function donusLearn(): Promise<Learn> {
  return getLearn();
}
