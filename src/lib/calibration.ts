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
export interface ScoreStats {
  n: number; // sonucu belli maç
  exact: number; // skor birebir tuttu
  outcome: number; // tahmini skorun yönü (1/X/2) tuttu
  totalGoals: number; // toplam gol sayısı tuttu
  goalDiffOne: number; // her iki takımın golünde en fazla 1 fark
  recent: { date: string; home: string; away: string; pred: string; real: string }[]; // son birebir tutanlar
}

/** Kayıtlardan skor tahmini karnesi */
export function scoreStats(list: { id?: string; home?: string; away?: string; kickoff?: string; summary?: { topScore?: string }; result?: { hg: number; ag: number } }[]): ScoreStats {
  const st: ScoreStats = { n: 0, exact: 0, outcome: 0, totalGoals: 0, goalDiffOne: 0, recent: [] };
  const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  for (const e of list) {
    const m = /^(\d+)-(\d+)$/.exec(e.summary?.topScore ?? "");
    if (!m || !e.result) continue;
    const ph = Number(m[1]),
      pa = Number(m[2]),
      { hg, ag } = e.result;
    st.n++;
    if (ph === hg && pa === ag) {
      st.exact++;
      st.recent.push({ date: (e.kickoff ?? "").slice(0, 10), home: e.home ?? "", away: e.away ?? "", pred: `${ph}-${pa}`, real: `${hg}-${ag}` });
    }
    if (sign(ph - pa) === sign(hg - ag)) st.outcome++;
    if (ph + pa === hg + ag) st.totalGoals++;
    if (Math.abs(ph - hg) <= 1 && Math.abs(pa - ag) <= 1) st.goalDiffOne++;
  }
  st.recent = st.recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return st;
}

export interface Sample {
  pred: number;
  won: boolean;
  /** Boyutlar (tercih yönü, lig, oran aralığı, veri kaynağı) ve oran (kâr hesabı için) */
  attrs?: Attrs;
  odd?: number;
}

/* ---------------------------------------------------------------- boyutlar */

export type DimKey = "Yön" | "Lig" | "Oran" | "Kaynak";
export const DIMS: DimKey[] = ["Yön", "Lig", "Oran", "Kaynak"];
export type Attrs = Partial<Record<DimKey, string>>;
export interface SegStat extends Bin {
  staked: number; // oranı belli olanlarda 1 birim yatırım toplamı
  ret: number; // dönen
}

/** Maç öncesi pazar anahtarından tercih yönü (ör. ou:2.5:o → Üst) */
export function segOfKey(key: string): string {
  const [m, a, b] = key.split(":");
  switch (m) {
    case "ou":
      return b === "o" ? "Üst" : "Alt";
    case "htou":
      return b === "o" ? "İY Üst" : "İY Alt";
    case "hou":
    case "aou":
      return b === "o" ? "Takım Üst" : "Takım Alt";
    case "btts":
      return a === "y" ? "KG Var" : "KG Yok";
    case "1x2":
      return a === "1" ? "Ev" : a === "X" ? "Beraberlik" : "Deplasman";
    case "dc":
      return "Çifte şans";
    case "ht1x2":
      return "İY Sonuç";
    case "htft":
      return "İY/MS";
    default:
      return "Kombine";
  }
}

/** Canlı tercih tanımından yön */
export function segOfSpec(spec: { t: string; over?: boolean; yes?: boolean; out?: string[] }): string {
  switch (spec.t) {
    case "ouFT":
      return spec.over ? "Üst" : "Alt";
    case "ou1H":
      return spec.over ? "İY Üst" : "İY Alt";
    case "btts":
      return spec.yes ? "KG Var" : "KG Yok";
    case "res":
      return spec.out && spec.out.length === 1 ? (spec.out[0] === "1" ? "Ev" : spec.out[0] === "X" ? "Beraberlik" : "Deplasman") : "Çifte şans";
    default:
      return "Sıradaki gol";
  }
}

export const oddBand = (odd?: number | null) =>
  !odd ? "oransız" : odd < 1.5 ? "1.50 altı" : odd < 1.7 ? "1.50–1.69" : odd < 2 ? "1.70–1.99" : "2.00+";

/** Maç kimliğinden veri kaynağı (id- = yalnız iddaa, elo- = ClubElo, diğerleri Avrupa piyasası) */
export const sourceOfId = (id: string) => (id.startsWith("id-") ? "iddaa" : id.startsWith("elo-") ? "ClubElo" : "Avrupa");
export interface Calibration {
  v: 1;
  builtAt: string;
  day: string; // kurulduğu Türkiye günü
  sys: Record<SystemKey, Bin[]>;
  /** Boyut karneleri: sistem → boyut → değer → istatistik */
  dims?: Record<SystemKey, Partial<Record<DimKey, Record<string, SegStat>>>>;
  /** Maçlar sistemi lig karnesi (gösterilen olasılıkla): lig → adet, tutan, söylenen toplamı */
  leagues?: Record<string, Bin>;
  /** Maç önü skor tahmini karnesi (en olası skor ↔ gerçek skor) */
  scores?: ScoreStats;
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
  id?: string;
  pick?: { key?: string; prob: number; preBand?: number; odd?: number } | null;
  oddsPick?: { key?: string; rate: number; odd?: number } | null;
  league?: string;
  result?: { pickWon?: boolean | null; oddsWon?: boolean | null };
};
type LiveLike = {
  prob: number;
  preBand?: number;
  odd?: number;
  league?: string;
  spec?: { t: string; over?: boolean; yes?: boolean; out?: string[] };
  analyzed?: boolean;
  ctx?: { prior?: string };
  result?: { won: boolean | null };
};

export function samplesFromSnaps(list: SnapLike[]) {
  const mac: Sample[] = [],
    oran: Sample[] = [];
  for (const e of list) {
    const src = e.id ? sourceOfId(e.id) : undefined;
    if (e.pick && typeof e.result?.pickWon === "boolean")
      mac.push({
        pred: e.pick.preBand ?? e.pick.prob,
        won: e.result.pickWon,
        odd: e.pick.odd,
        attrs: { Yön: e.pick.key ? segOfKey(e.pick.key) : undefined, Lig: e.league, Oran: oddBand(e.pick.odd), Kaynak: src },
      });
    if (e.oddsPick && typeof e.result?.oddsWon === "boolean")
      oran.push({
        pred: e.oddsPick.rate,
        won: e.result.oddsWon,
        odd: e.oddsPick.odd,
        attrs: { Yön: e.oddsPick.key ? segOfKey(e.oddsPick.key) : undefined, Lig: e.league, Oran: oddBand(e.oddsPick.odd), Kaynak: src },
      });
  }
  return { mac, oran };
}
export function samplesFromLive(list: LiveLike[]): Sample[] {
  return list
    .filter((r) => r.analyzed !== false && r.ctx?.prior !== "yok" && typeof r.result?.won === "boolean")
    .map((r) => ({
      pred: r.preBand ?? r.prob,
      won: r.result!.won as boolean,
      odd: r.odd,
      attrs: {
        Yön: r.spec ? segOfSpec(r.spec) : undefined,
        Lig: r.league,
        Oran: oddBand(r.odd),
        Kaynak: r.ctx?.prior === "market" ? "Avrupa" : r.ctx?.prior === "elo" ? "ClubElo / iddaa" : undefined,
      },
    }));
}

/** Boyut karnesi: her boyut değeri için adet, tutan, söylenen toplamı, 1 birimle yatırılan ve dönen */
export function fitDims(samples: Sample[]): Partial<Record<DimKey, Record<string, SegStat>>> {
  const out: Partial<Record<DimKey, Record<string, SegStat>>> = {};
  for (const s of samples)
    for (const d of DIMS) {
      const v = s.attrs?.[d];
      if (!v) continue;
      const m = (out[d] ??= {});
      const c = (m[v] ??= { n: 0, hits: 0, pred: 0, staked: 0, ret: 0 });
      c.n++;
      c.hits += s.won ? 1 : 0;
      c.pred += s.pred;
      if (s.odd && s.odd > 1) {
        c.staked++;
        if (s.won) c.ret += s.odd;
      }
    }
  return out;
}

const DIM_PRIOR = 30; // az veriyle düzeltme küçük kalır
const DIM_MAX = 0.08; // her boyut en fazla ±%8
const DIM_TOTAL = 0.15; // toplam en fazla ±%15

/** Bir boyut değerinin düzeltme çarpanı: o değerdeki isabet / sistemin genel isabeti (söylenene göre) */
export function dimFactor(all: Bin[] | undefined, stat: Bin | undefined): number {
  if (!stat || !all) return 1;
  const H = all.reduce((s, b) => s + b.hits, 0),
    P = all.reduce((s, b) => s + b.pred, 0);
  const base = (H + DIM_PRIOR) / (P + DIM_PRIOR);
  const f = (stat.hits + DIM_PRIOR) / (stat.pred + DIM_PRIOR) / base;
  return Math.min(1 + DIM_MAX, Math.max(1 - DIM_MAX, f));
}

async function rebuild(now = Date.now()): Promise<Calibration> {
  const mac: Sample[] = [],
    oran: Sample[] = [],
    canli: Sample[] = [];
  const leagues: Record<string, Bin> = {};
  const allSnaps: Parameters<typeof scoreStats>[0] = [];
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
        allSnaps.push(...(Object.values(snap) as Parameters<typeof scoreStats>[0]));
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
    dims: { mac: fitDims(mac), canli: fitDims(canli), oran: fitDims(oran) },
    leagues,
    scores: scoreStats(allSnaps),
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

export type Mapper = (p: number, attrs?: Attrs) => number;

/** Aralık düzeltmesi + boyut düzeltmesi (yön, lig, oran aralığı, kaynak) */
export function makeMapper(c: Calibration | null | undefined, sys: SystemKey): Mapper {
  const band = bandMapper(c?.sys[sys]);
  const dims = c?.dims?.[sys];
  const all = c?.sys[sys];
  return (p, attrs) => {
    let q = band(p);
    if (attrs && dims) {
      let f = 1;
      for (const d of DIMS) {
        const v = attrs[d];
        if (v) f *= dimFactor(all, dims[d]?.[v]);
      }
      q *= Math.min(1 + DIM_TOTAL, Math.max(1 - DIM_TOTAL, f));
    }
    return Math.min(0.99, Math.max(0.01, q));
  };
}

/** Bir sistemin düzeltme fonksiyonu */
export async function mapperFor(sys: SystemKey): Promise<Mapper> {
  const c = await getCalibration().catch(() => null);
  return makeMapper(c, sys);
}

/** Admin / AI sayfası: hemen yeniden kur */
export async function rebuildCalibrationNow(): Promise<Calibration | null> {
  if (!getStore()) return null;
  const r = await rebuild();
  memo = { at: Date.now(), data: r };
  return r;
}
