import { dimFactor, reliability, SYSTEMS, type Bin, type Calibration, type DimKey, type SystemKey } from "./calibration";

/**
 * AI sekmesi: kayıtlardan çıkarılan karne, günlük not ve geliştirme önerileri (kurallarla, ücretsiz).
 * Hesaplara dokunmaz; yalnız öğrenilenleri okunur hale getirir.
 */

export interface SystemSummary {
  key: SystemKey;
  name: string;
  n: number;
  hits: number;
  said: number | null; // söylenen ortalama
  actual: number | null; // gerçek isabet
  /** Dürüstlük sapması: aralıklarda |söylenen − gerçek| ortalaması (adetle ağırlıklı), puan */
  gap: number | null;
  rows: ReturnType<typeof reliability>;
}

export function summarize(c: Calibration | null): SystemSummary[] {
  return (Object.keys(SYSTEMS) as SystemKey[]).map((key) => {
    const bins: Bin[] = c?.sys[key] ?? [];
    const n = bins.reduce((s, b) => s + b.n, 0);
    const hits = bins.reduce((s, b) => s + b.hits, 0);
    const pred = bins.reduce((s, b) => s + b.pred, 0);
    const rows = reliability(bins);
    const w = rows.filter((r) => r.n >= 5 && r.actual !== null);
    const wn = w.reduce((s, r) => s + r.n, 0);
    return {
      key,
      name: SYSTEMS[key],
      n,
      hits,
      said: n ? pred / n : null,
      actual: n ? hits / n : null,
      gap: wn ? (w.reduce((s, r) => s + r.n * Math.abs(r.said - r.actual!), 0) / wn) * 100 : null,
      rows,
    };
  });
}

const pc = (x: number) => `%${Math.round(x * 100)}`;

export interface DayResult {
  name: string;
  n: number;
  hits: number;
  said: number;
}

/** Günlük not: dünün sonuçları ve karnede ne değişti */
export function dailyNote(c: Calibration | null, yesterday: DayResult[]): string[] {
  const out: string[] = [];
  const played = yesterday.filter((d) => d.n > 0);
  if (!played.length) out.push("Dün sonuçlanan tercih yok; öğrenecek yeni veri gelmedi.");
  for (const d of played) {
    const rate = d.hits / d.n;
    const said = d.said / d.n;
    const diff = Math.round((rate - said) * 100);
    out.push(
      `${d.name}: dün ${d.n} tercihten ${d.hits} tanesi tuttu (${pc(rate)}); ortalama ${pc(said)} demiştim` +
        (Math.abs(diff) <= 5 ? " — dürüst bir gün." : diff > 0 ? ` — beklenenden ${diff} puan iyi.` : ` — beklenenden ${-diff} puan kötü.`),
    );
  }
  if (c?.prev) {
    for (const key of Object.keys(SYSTEMS) as SystemKey[]) {
      const now = reliability(c.sys[key]);
      const before = reliability(c.prev.sys[key] ?? []);
      for (const r of now) {
        const b = before[r.i];
        if (!b || r.n < 10) continue;
        const d = r.factor - b.factor;
        if (Math.abs(d) >= 0.015)
          out.push(
            `${SYSTEMS[key]} · ${r.label} dediklerim: düzeltmeyi ×${b.factor.toFixed(2)} → ×${r.factor.toFixed(2)} yaptım` +
              (r.actual !== null ? ` (gerçekte ${pc(r.actual)} tutuyor, ${r.n} tercih).` : "."),
          );
      }
    }
  }
  return out;
}

export interface Suggestion {
  level: "iyi" | "dikkat" | "bilgi";
  text: string;
}

/** Geliştirme önerileri: veriden çıkan, insan kararı gerektiren noktalar */
export function suggestions(c: Calibration | null, systems: SystemSummary[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of systems) {
    if (s.n < 50)
      out.push({
        level: "bilgi",
        text: `${s.name} sisteminde henüz ${s.n} sonuçlanmış tercih var. Düzeltmenin tam oturması için birkaç yüz gerekiyor; siteyi her gün açmak (ya da otomatik zamanlayıcı) öğrenmeyi hızlandırır.`,
      });
    for (const r of s.rows) {
      if (r.n < 30 || r.actual === null) continue;
      const d = (r.actual - r.said) * 100;
      if (d <= -8)
        out.push({
          level: "dikkat",
          text: `${s.name} · ${r.label} dediği tercihler gerçekte ${pc(r.actual)} tutuyor (${r.n} tercih). Bu aralık iyimser; olasılıklar ×${r.factor.toFixed(2)} ile aşağı çekiliyor.`,
        });
      else if (d >= 8)
        out.push({
          level: "iyi",
          text: `${s.name} · ${r.label} dediği tercihler gerçekte ${pc(r.actual)} tutuyor (${r.n} tercih). Bu aralık temkinli; olasılıklar ×${r.factor.toFixed(2)} ile yükseltiliyor.`,
        });
    }
  }
  const leagues = Object.entries(c?.leagues ?? {}).filter(([, b]) => b.n >= 15);
  for (const [name, b] of leagues) {
    const rate = b.hits / b.n,
      said = b.pred / b.n;
    if (rate - said <= -0.12)
      out.push({
        level: "dikkat",
        text: `${name}: Maçlar sistemi ${pc(said)} deyip ${pc(rate)} tutturuyor (${b.n} maç). Bu ligde çok iyimser; bu ligin tercihlerine temkinli yaklaş ya da ligi çıkarmayı düşün.`,
      });
    else if (rate - said >= 0.1)
      out.push({ level: "iyi", text: `${name}: Maçlar sistemi bu ligde beklenenden iyi (${pc(said)} deyip ${pc(rate)}, ${b.n} maç).` });
  }
  const best = systems.filter((s) => s.n >= 50 && s.gap !== null).sort((a, b) => a.gap! - b.gap!);
  if (best.length >= 2)
    out.push({
      level: "bilgi",
      text: `Şu an en dürüst sistem ${best[0].name} (ortalama sapma ${best[0].gap!.toFixed(1)} puan); en çok düzeltilen ${best[best.length - 1].name} (${best[best.length - 1].gap!.toFixed(1)} puan).`,
    });
  return out;
}

export function leagueRows(c: Calibration | null) {
  return Object.entries(c?.leagues ?? {})
    .filter(([, b]) => b.n >= 5)
    .map(([name, b]) => ({ name, n: b.n, hits: b.hits, said: b.pred / b.n, actual: b.hits / b.n }))
    .sort((a, b) => b.actual - b.said - (a.actual - a.said));
}

/* ---------------------------------------------------------------- boyut karneleri */

export interface DimRow {
  value: string;
  n: number;
  hits: number;
  said: number;
  actual: number;
  roi: number | null; // 1 birimle getiri (oranı belli olanlarda)
  factor: number; // uygulanan düzeltme
}

export function dimRows(c: Calibration | null, sys: SystemKey, dim: DimKey, minN = 5): DimRow[] {
  const m = c?.dims?.[sys]?.[dim] ?? {};
  return Object.entries(m)
    .filter(([, v]) => v.n >= minN)
    .map(([value, v]) => ({
      value,
      n: v.n,
      hits: v.hits,
      said: v.pred / v.n,
      actual: v.hits / v.n,
      roi: v.staked ? v.ret / v.staked - 1 : null,
      factor: dimFactor(c?.sys[sys], v),
    }))
    .sort((a, b) => b.n - a.n);
}

/** Alt mı üst mü? Her sistem için Üst ve Alt (ve İY Üst/Alt) karşılaştırması */
export function overUnder(c: Calibration | null) {
  return (Object.keys(SYSTEMS) as SystemKey[]).map((sys) => {
    const rows = dimRows(c, sys, "Yön", 1);
    const pick = (v: string) => rows.find((r) => r.value === v) ?? null;
    return { sys, name: SYSTEMS[sys], over: pick("Üst"), under: pick("Alt"), htOver: pick("İY Üst"), htUnder: pick("İY Alt") };
  });
}

/** Boyutlardan çıkan öneriler (yeterli veri olanlar) */
export function dimSuggestions(c: Calibration | null): Suggestion[] {
  const out: Suggestion[] = [];
  for (const sys of Object.keys(SYSTEMS) as SystemKey[]) {
    const ou = overUnder(c).find((x) => x.sys === sys)!;
    if (ou.over && ou.under && ou.over.n >= 30 && ou.under.n >= 30) {
      const dOver = ou.over.actual - ou.over.said,
        dUnder = ou.under.actual - ou.under.said;
      const better = dOver > dUnder ? "Üst" : "Alt";
      const gap = Math.abs(dOver - dUnder) * 100;
      if (gap >= 5)
        out.push({
          level: "bilgi",
          text: `${SYSTEMS[sys]}: ${better} tercihleri beklentisine göre ${gap.toFixed(0)} puan daha iyi gidiyor (Üst %${Math.round(ou.over.actual * 100)} / Alt %${Math.round(ou.under.actual * 100)} tuttu). Olasılıklar buna göre ayarlanıyor.`,
        });
    }
    for (const dim of ["Lig", "Oran", "Kaynak"] as DimKey[])
      for (const r of dimRows(c, sys, dim, 30)) {
        const d = (r.actual - r.said) * 100;
        if (d <= -10)
          out.push({
            level: "dikkat",
            text: `${SYSTEMS[sys]} · ${dim}: ${r.value} — %${Math.round(r.said * 100)} deyip %${Math.round(r.actual * 100)} tutturuyor (${r.n} tercih); ×${r.factor.toFixed(2)} ile düşürülüyor.`,
          });
        else if (d >= 10)
          out.push({
            level: "iyi",
            text: `${SYSTEMS[sys]} · ${dim}: ${r.value} — beklenenden iyi (%${Math.round(r.said * 100)} deyip %${Math.round(r.actual * 100)}, ${r.n} tercih); ×${r.factor.toFixed(2)} ile yükseltiliyor.`,
          });
      }
  }
  return out;
}
