import { getProvider } from "./providers";
import { analyze, applyCalibration } from "./model";
import { calibrationFactors, getLearning, recordSnapshots } from "./tracking";
import type { Analysis } from "./types";
import { mapperFor, oddBand, segOfKey, sourceOfId } from "./calibration";
import type { CouponMatch } from "./coupon";

type Loaded = { analyses: Analysis[]; source: string; banner?: string };

const FRESH_MS = 3 * 60_000; // bu süre içinde yeniden hesaplama yok
const STALE_MS = 30 * 60_000; // bu süreye kadar eski sonuç hemen gösterilir, yenisi arka planda hazırlanır
let memo: { at: number; data: Loaded } | null = null;
let inflight: Promise<Loaded> | null = null;

async function compute(): Promise<Loaded> {
  const provider = getProvider();
  const matches = await provider.listMatches();
  const [learning, band] = await Promise.all([getLearning().catch(() => ({})), mapperFor("mac").catch(() => (p: number) => p)]);
  const factors = calibrationFactors(learning);
  const analyses = matches
    .map((m) =>
      applyCalibration(analyze(m), factors, (p, r) =>
        band(p, { Yön: segOfKey(r.key), Lig: m.league, Oran: oddBand(r.odd), Kaynak: sourceOfId(m.id) }),
      ),
    )
    .sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));
  // Başlamamış maçların tercihlerini günlük kayda yaz (sonra tuttu/tutmadı değerlendirmesi için)
  await recordSnapshots(analyses).catch(() => {});
  return { analyses, source: provider.name, banner: analyses[0]?.match.warnings.find((w) => w.startsWith("Canlı")) };
}

function refresh(): Promise<Loaded> {
  inflight ??= compute()
    .then((data) => {
      memo = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Zamanlayıcı için: analizleri hemen yeniden hesapla (ve tercihleri kaydet), bitmesini bekle */
export function refreshAnalyses(): Promise<Loaded> {
  return refresh();
}

/**
 * Sayfaların ortak kullandığı: tüm maçların analizi (başlama saatine göre sıralı).
 * Bellekte tutulur; süresi geçmiş ama çok eski olmayan sonuç beklemeden döner ve arka planda yenilenir.
 */
export async function loadAnalyses(): Promise<Loaded> {
  const age = memo ? Date.now() - memo.at : Infinity;
  if (memo && age < FRESH_MS) return memo.data;
  if (memo && age < STALE_MS) {
    refresh().catch(() => {});
    return memo.data;
  }
  return refresh();
}

/** Kupon / banko hesapları için sade veri (istemciye gönderilir) */
export function toCouponMatches(analyses: Analysis[]): CouponMatch[] {
  return analyses.map((a) => ({
    id: a.match.id,
    source: a.match.source,
    home: a.match.home.name,
    away: a.match.away.name,
    league: a.match.league,
    kickoff: a.match.kickoff,
    options: a.rows.map((r) => ({
      key: r.key,
      market: r.market,
      selection: r.selection,
      category: r.category,
      odd: r.odd,
      prob: r.prob,
      sigma: r.sigma,
      ev: r.ev,
      mbc: r.mbc,
      confidence: r.confidence,
      confidenceParts: r.confidenceParts,
      required: r.required,
    })),
  }));
}
