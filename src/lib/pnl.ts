import { getJSON, getStore, setJSON } from "./auth/store";

/**
 * "Her öneriye aynı tutarı (100 TL) yatırsaydım ne olurdu?" hesabı.
 * Günlük özet sayfada o günün kayıtlarından hesaplanır; başından beri toplam için her gün sonuçlandırıldığında
 * gün özeti pnl:v1 anahtarına yazılır (ilk çalışmada son 60 günün kayıtlarından kurulur).
 */

export const STAKE = 100;
export type PnlSection = "mac" | "oran" | "canli";

export interface PnlItem {
  odd?: number;
  won: boolean | null | undefined;
}

export interface DayPnl {
  shared: number; // o gün paylaşılan tahmin
  settled: number; // sonuçlanan
  hits: number; // tutan
  counted: number; // kâr hesabına giren (sonuçlanmış ve oranı belli)
  noOdds: number; // sonuçlanmış ama oranı olmadığı için hesaba girmeyen
  staked: number;
  returned: number;
  profit: number;
}

export function dayPnl(items: PnlItem[], stake = STAKE): DayPnl {
  const d: DayPnl = { shared: items.length, settled: 0, hits: 0, counted: 0, noOdds: 0, staked: 0, returned: 0, profit: 0 };
  for (const it of items) {
    if (it.won === null || it.won === undefined) continue;
    d.settled++;
    if (it.won) d.hits++;
    if (!it.odd || it.odd <= 1) {
      d.noOdds++;
      continue;
    }
    d.counted++;
    d.staked += stake;
    if (it.won) d.returned += stake * it.odd;
  }
  d.returned = Math.round(d.returned * 100) / 100;
  d.profit = Math.round((d.returned - d.staked) * 100) / 100;
  return d;
}

export function sumPnl(list: DayPnl[]): DayPnl {
  const t = dayPnl([]);
  for (const d of list)
    for (const k of Object.keys(t) as (keyof DayPnl)[]) t[k] += d[k];
  t.returned = Math.round(t.returned * 100) / 100;
  t.profit = Math.round((t.returned - t.staked) * 100) / 100;
  return t;
}

/* ---------------------------------------------------- kayıtlardan kalem çıkarma */

type SnapLike = { pick?: { odd: number } | null; oddsPick?: { odd: number } | null; result?: { pickWon?: boolean | null; oddsWon?: boolean | null } };
type LiveLike = { odd?: number; result?: { won: boolean | null }; analyzed?: boolean; ctx?: { prior?: string } };

/** Canlı öneri maç öncesi analizi olan bir maça mı ait? (bilinmeyen eski kayıtlar analizli sayılır) */
export const analyzedRec = (r: { analyzed?: boolean; ctx?: { prior?: string } }) => r.analyzed !== false && r.ctx?.prior !== "yok";

export const macItems = (snap: SnapLike[]): PnlItem[] => snap.filter((e) => e.pick).map((e) => ({ odd: e.pick!.odd, won: e.result?.pickWon }));
export const oranItems = (snap: SnapLike[]): PnlItem[] =>
  snap.filter((e) => e.oddsPick).map((e) => ({ odd: e.oddsPick!.odd, won: e.result ? (e.result.oddsWon ?? null) : undefined }));
export const canliItems = (recs: LiveLike[]): PnlItem[] => recs.filter(analyzedRec).map((r) => ({ odd: r.odd, won: r.result?.won }));

/* ---------------------------------------------------- başından beri toplam */

const KEY = "pnl:v1";
const REBUILD_DAYS = 60;
const TR = 3 * 3600_000;
const trDate = (ms: number) => new Date(ms + TR).toISOString().slice(0, 10);

interface PnlStore {
  v: 1;
  days: Record<string, Partial<Record<PnlSection, DayPnl>>>;
}

let memo: { at: number; data: PnlStore } | null = null;

async function load(): Promise<PnlStore> {
  const s = await getJSON<PnlStore>(KEY).catch(() => null);
  if (s?.v === 1) return s;
  // İlk çalışma: geçmiş kayıtlardan kur
  const fresh: PnlStore = { v: 1, days: {} };
  const dates = Array.from({ length: REBUILD_DAYS }, (_, i) => trDate(Date.now() - i * 86400_000));
  await Promise.all(
    dates.map(async (d) => {
      const [snap, live] = await Promise.all([
        getJSON<Record<string, SnapLike>>(`snap:${d}`).catch(() => null),
        getJSON<Record<string, LiveLike>>(`live:${d}`).catch(() => null),
      ]);
      const day: Partial<Record<PnlSection, DayPnl>> = {};
      if (snap) {
        const list = Object.values(snap);
        day.mac = dayPnl(macItems(list));
        day.oran = dayPnl(oranItems(list));
      }
      if (live) day.canli = dayPnl(canliItems(Object.values(live)));
      if (Object.keys(day).length) fresh.days[d] = day;
    }),
  );
  await setJSON(KEY, fresh);
  return fresh;
}

/** Bir günün özetini kaydeder (sonuçlandırmadan sonra çağrılır) */
export async function savePnl(date: string, parts: Partial<Record<PnlSection, DayPnl>>): Promise<void> {
  if (!getStore()) return;
  const s = await load();
  s.days[date] = { ...s.days[date], ...parts };
  await setJSON(KEY, s);
  memo = { at: Date.now(), data: s };
}

/** Başından beri toplam (bir bölüm için). current: sayfada zaten hesaplanmış güncel gün özetleri (kayıttakinin yerine geçer) */
export async function totalPnl(
  section: PnlSection,
  current: Record<string, DayPnl> = {},
): Promise<{ total: DayPnl; days: number; since: string | null } | null> {
  if (!getStore()) return null;
  if (!memo || Date.now() - memo.at > 5 * 60_000) memo = { at: Date.now(), data: await load().catch(() => ({ v: 1 as const, days: {} })) };
  const merged: Record<string, DayPnl | undefined> = Object.fromEntries(Object.entries(memo.data.days).map(([d, v]) => [d, v[section]]));
  Object.assign(merged, current);
  const entries = (Object.entries(merged) as [string, DayPnl | undefined][])
    .filter((e): e is [string, DayPnl] => !!e[1] && e[1].settled > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return { total: sumPnl(entries.map(([, v]) => v)), days: entries.length, since: entries[0]?.[0] ?? null };
}
