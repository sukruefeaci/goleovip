import { getJSON, getStore, setJSON } from "./auth/store";
import { inBackground } from "./background";

/**
 * Yüzde aralığına göre kalibrasyon ("%70 diyorsa %70 olsun").
 *
 * Her sistem (Maçlar, Canlı, Oranlar) için geçmiş tercihler söylenen olasılığa göre aralıklara bölünür
 * (%50 altı, %50–55, … %90+). Her aralıkta "söylenen ortalama" ile "gerçekte tutma oranı" karşılaştırılır;
 * aralık başına düzeltme çarpanı çıkarılır ve yeni tahminlere uygulanır:
 *   tahmini gerçek oran = (tutan + K × söylenen) / (adet + K)    (K = 30: az veriyle düzeltme küçük kalır)
 *   çarpan = tahmini gerçek oran / söylenen, 0.80–1.20 arası; aralıklar arasında yumuşak geçiş, sıralama korunur.
 * Öğrenme her zaman düzeltme ÖNCESİ olasılık üzerinden yapılır (düzeltme kendini silmesin diye).
 * Karne en çok 6 saatte bir kayıtlardan yeniden kurulur (calib:v1).
 */

export type SystemKey = "mac" | "canli" | "oran";
export const SYSTEMS: Record<SystemKey, string> = { mac: "Maçlar", canli: "Canlı", oran: "Oranlar" };
export const EDGES = [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0001];
const K = 30;
const KEY = "calib:v1";
const REBUILD_MS = 6 * 60 * 60_000;
const SNAP_DAYS = 60;
const LIVE_DAYS = 45;
const TR = 3 * 3600_000;
const trDay = (ms: number) => new Date(ms + TR).toISOString().slice(0, 10);

export interface Bin {
  n: number;
  hits: number;
  pred: number; // söylenen olasılıkların toplamı
}
export interface Sample {
  pred: number;
  won: boolean;
}
export interface Calibration {
  v: 1;
  builtAt: string;
  day: string; // kurulduğu Türkiye günü
  sys: Record<SystemKey, Bin[]>;
  /** Maçlar sistemi lig karnesi (gösterilen olasılıkla): lig → adet, tutan, söylenen toplamı */
  leagues?: Record<string, Bin>;
  prev?: { day: string; sys: Record<SystemKey, Bin[]> }; // bir önceki günün karnesi (değişimi göstermek için)
}

export const binIndex = (p: number) => {
  for (let i = EDGES.length - 2; i >= 0; i--) if (p >= EDGES[i]) return i;
  return 0;
};
export const binLabel = (i: number) =>
  i === 0 ? "%50 altı" : i === EDGES.length - 2 ? `%${Math.round(EDGES[i] * 100)}+` : `%${Math.round(EDGES[i] * 100)}–${Math.round(EDGES[i + 1] * 100)}`;

export function fitBins(samples: Sample[]): Bin[] {
  const bins: Bin[] = Array.from({ length: EDGES.length - 1 }, () => ({ n: 0, hits: 0, pred: 0 }));
  for (const s of samples) {
    if (!(s.pred > 0 && s.pred < 1)) continue;
    const b = bins[binIndex(s.pred)];
    b.n++;
    b.hits += s.won ? 1 : 0;
    b.pred += s.pred;
  }
  return bins;
}

/** Aralık başına: söylenen ortalama, gerçek oran, düzeltilmiş tahmin, çarpan */
export function reliability(bins: Bin[]) {
  return bins.map((b, i) => {
    const said = b.n ? b.pred / b.n : (EDGES[i] + Math.min(1, EDGES[i + 1])) / 2;
    const actual = b.n ? b.hits / b.n : null;
    const est = (b.hits + K * said) / (b.n + K);
    return { i, label: binLabel(i), n: b.n, hits: b.hits, said, actual, factor: Math.min(1.2, Math.max(0.8, est / said)) };
  });
}

/** Söylenen olasılığı düzeltilmiş olasılığa çevirir (aralıklar arası doğrusal geçiş, sıralama korunur) */
export function bandMapper(bins: Bin[] | undefined): (p: number) => number {
  if (!bins || !bins.some((b) => b.n > 0)) return (p) => p;
  const pts = reliability(bins)
    .filter((r) => r.n > 0)
    .map((r) => ({ x: r.said, y: Math.min(0.99, r.said * r.factor) }));
  // sıralama korunur: daha yüksek söylenen, daha düşük düzeltilmişe düşmesin
  for (let i = 1; i < pts.length; i++) pts[i].y = Math.max(pts[i].y, pts[i - 1].y);
  const factorAt = (p: number) => {
    if (p <= pts[0].x) return pts[0].y / pts[0].x;
    const last = pts[pts.length - 1];
    if (p >= last.x) return last.y / last.x;
    for (let i = 1; i < pts.length; i++)
      if (p <= pts[i].x) {
        const a = pts[i - 1],
          b = pts[i];
        const t = (p - a.x) / (b.x - a.x);
        return (a.y + t * (b.y - a.y)) / p;
      }
    return 1;
  };
  return (p) => Math.min(0.99, Math.max(0.01, p * Math.min(1.2, Math.max(0.8, factorAt(p)))));
}

/* ---------------------------------------------------------------- kayıtlardan kurma */

type SnapLike = {
  pick?: { prob: number; preBand?: number } | null;
  oddsPick?: { rate: number } | null;
  league?: string;
  result?: { pickWon?: boolean | null; oddsWon?: boolean | null };
};
type LiveLike = { prob: number; preBand?: number; analyzed?: boolean; ctx?: { prior?: string }; result?: { won: boolean | null } };

export function samplesFromSnaps(list: SnapLike[]) {
  const mac: Sample[] = [],
    oran: Sample[] = [];
  for (const e of list) {
    if (e.pick && typeof e.result?.pickWon === "boolean") mac.push({ pred: e.pick.preBand ?? e.pick.prob, won: e.result.pickWon });
    if (e.oddsPick && typeof e.result?.oddsWon === "boolean") oran.push({ pred: e.oddsPick.rate, won: e.result.oddsWon });
  }
  return { mac, oran };
}
export function samplesFromLive(list: LiveLike[]): Sample[] {
  return list
    .filter((r) => r.analyzed !== false && r.ctx?.prior !== "yok" && typeof r.result?.won === "boolean")
    .map((r) => ({ pred: r.preBand ?? r.prob, won: r.result!.won as boolean }));
}

async function rebuild(now = Date.now()): Promise<Calibration> {
  const mac: Sample[] = [],
    oran: Sample[] = [],
    canli: Sample[] = [];
  const leagues: Record<string, Bin> = {};
  const days = Array.from({ length: SNAP_DAYS }, (_, i) => trDay(now - i * 86400_000));
  await Promise.all(
    days.map(async (d, i) => {
      const [snap, live] = await Promise.all([
        getJSON<Record<string, SnapLike>>(`snap:${d}`).catch(() => null),
        i < LIVE_DAYS ? getJSON<Record<string, LiveLike>>(`live:${d}`).catch(() => null) : Promise.resolve(null),
      ]);
      if (snap) {
        const s = samplesFromSnaps(Object.values(snap));
        mac.push(...s.mac);
        oran.push(...s.oran);
        for (const e of Object.values(snap))
          if (e.pick && typeof e.result?.pickWon === "boolean" && e.league) {
            const l = (leagues[e.league] ??= { n: 0, hits: 0, pred: 0 });
            l.n++;
            l.hits += e.result.pickWon ? 1 : 0;
            l.pred += e.pick.prob;
          }
      }
      if (live) canli.push(...samplesFromLive(Object.values(live)));
    }),
  );
  const old = await getJSON<Calibration>(KEY).catch(() => null);
  const today = trDay(now);
  const c: Calibration = {
    v: 1,
    builtAt: new Date(now).toISOString(),
    day: today,
    sys: { mac: fitBins(mac), canli: fitBins(canli), oran: fitBins(oran) },
    leagues,
    // gün değiştiyse önceki günün karnesini sakla, değişmediyse eskisini koru
    prev: old?.v === 1 ? (old.day !== today ? { day: old.day, sys: old.sys } : old.prev) : undefined,
  };
  await setJSON(KEY, c);
  return c;
}

let memo: { at: number; data: Calibration | null } | null = null;
let building: Promise<Calibration> | null = null;

/** Güncel karne (bellekte 10 dk). Eskiyse arka planda yeniden kurulur; hiç yoksa ilk kurulum da arka planda. */
export async function getCalibration(): Promise<Calibration | null> {
  if (!getStore()) return null;
  if (memo && Date.now() - memo.at < 10 * 60_000) return memo.data;
  const c = await getJSON<Calibration>(KEY).catch(() => null);
  const data = c?.v === 1 ? c : null;
  memo = { at: Date.now(), data };
  if (!data || Date.now() - Date.parse(data.builtAt) > REBUILD_MS) {
    if (!building)
      inBackground(() => {
        building = rebuild()
          .then((r) => {
            memo = { at: Date.now(), data: r };
            return r;
          })
          .finally(() => {
            building = null;
          });
        return building;
      });
  }
  return data;
}

/** Bir sistemin düzeltme fonksiyonu */
export async function mapperFor(sys: SystemKey): Promise<(p: number) => number> {
  const c = await getCalibration().catch(() => null);
  return bandMapper(c?.sys[sys]);
}

/** Admin / AI sayfası: hemen yeniden kur */
export async function rebuildCalibrationNow(): Promise<Calibration | null> {
  if (!getStore()) return null;
  const r = await rebuild();
  memo = { at: Date.now(), data: r };
  return r;
}
