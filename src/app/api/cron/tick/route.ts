import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { loadAnalyses, refreshAnalyses } from "@/lib/data";
import { refreshLiveNow } from "@/lib/liveData";
import { recordOddsPicks, settleDay, trDate } from "@/lib/tracking";
import { settleLive } from "@/lib/liveTracking";
import { settleConsensus } from "@/lib/consensus";
import { computeOddsPicks } from "@/lib/oddsPicks";
import { getCalibration } from "@/lib/calibration";
import { getStore, setJSON } from "@/lib/auth/store";
import { postSharedResults } from "@/lib/tgStats";
import { syncDay } from "@/lib/providers/apiFootball";
import { postPrematchResults, sharePrematchPicks } from "@/lib/tgPre";

/**
 * Otomatik zamanlayıcı (ör. cron-job.org her 5 dk): kimse siteye bakmasa da
 *  1) maç öncesi analizleri yeniler, başlamamış maçların tercihlerini kaydeder
 *  2) Oranlar sisteminin tercihlerini kaydeder
 *  3) canlı maçları tarar: canlı öneriler, Telegram, üçlü onay
 *  4) bugün ve dün biten maçları sonuçlandırır (maç öncesi, Oranlar, canlı, üçlü), öğrenmeyi günceller
 *  5) kalibrasyon karnesini (gerekirse) yeniler
 * Erişim: ?key=CRON_SECRET  ya da  Authorization: Bearer CRON_SECRET
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_LAST_KEY = "cron:last";

function authorized(req: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null;
  const url = new URL(req.url);
  const given = url.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given),
    b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function step<T>(name: string, fn: () => Promise<T>, log: Record<string, unknown>) {
  const t = Date.now();
  try {
    log[name] = { ok: true, sonuc: await fn(), ms: Date.now() - t };
  } catch (e) {
    log[name] = { ok: false, hata: (e as Error).message, ms: Date.now() - t };
  }
}

export async function GET(req: Request) {
  const auth = authorized(req);
  if (auth === null) return NextResponse.json({ error: "CRON_SECRET ayarlanmamış (en az 16 karakter)" }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!getStore()) return NextResponse.json({ error: "Veritabanı (Upstash) bağlı değil; kayıt yapılamaz" }, { status: 503 });

  // Zamanlayıcı servisleri (cron-job.org) ~30 sn'de zaman aşımına düşer: hemen yanıt ver, işi arka planda bitir.
  // Sonuç kaydı /kurulum sayfasında görünür. ?bekle=1 ile iş bitene kadar beklenir (elle deneme için).
  if (new URL(req.url).searchParams.get("bekle") !== "1") {
    after(() => run().catch(() => {}));
    return NextResponse.json({ ok: true, mesaj: "Çalışma başladı; sonuç /kurulum sayfasında" });
  }
  return NextResponse.json(await run());
}

async function run(): Promise<Record<string, unknown>> {
  const now = Date.now();
  const deadline = now + 55_000; // Vercel en fazla 60 sn çalıştırır
  const left = () => deadline - Date.now();
  const today = trDate(now),
    yesterday = trDate(now - 86400_000);
  const log: Record<string, unknown> = { zaman: new Date(now).toISOString() };
  // Her adımdan sonra kayıt: süre dolsa bile nereye kadar geldiği görülür
  const save = () => setJSON(CRON_LAST_KEY, { ...log, sure_ms: Date.now() - now }).catch(() => {});

  // 1) analizler ve canlı tarama (birbirinden bağımsız: paralel)
  await Promise.all([
    step("analizler", async () => (await refreshAnalyses()).analyses.length, log),
    step("canli", async () => {
      const l = await refreshLiveNow();
      return { oynanan: l.total, oneri: l.items.reduce((n, i) => n + i.recs.length, 0), uclu: l.consensus.length };
    }, log),
  ]);
  await save();
  // 2) biten maçları sonuçlandır
  await step("sonuclar", async () => {
    const b = Math.max(3000, Math.min(10000, left() - 30000));
    const [mb, md, cb, cd, ub, ud] = await Promise.all([
      settleDay(today, now, b),
      settleDay(yesterday, now, b),
      settleLive(today, now, b),
      settleLive(yesterday, now, b),
      settleConsensus(today, now, b),
      settleConsensus(yesterday, now, b),
    ]);
    return { mac_oncesi: mb + md, canli: cb + cd, uclu: ub + ud };
  }, log);
  await save();
  // 3) Telegram: paylaşılan tahminlerin sonuçları ve maç önü paylaşımı (öncelikli)
  await step("telegram_sonuc", async () => postSharedResults(Date.now(), Math.max(5000, Math.min(15000, left() - 15000))), log);
  await step("telegram_mac_onu", async () => {
    const { analyses } = await loadAnalyses();
    return { paylasim: await sharePrematchPicks(analyses, Date.now()), sonuc: await postPrematchResults(Date.now()) };
  }, log);
  await save();
  // 4) Yurt dışı oranlar (API-Football, kota sınırlı, her çalışmada birkaç sayfa)
  await step("yurtdisi_oran", async () => {
    if (left() < 15000) return "süre kalmadı";
    const d0 = new Date().toISOString().slice(0, 10),
      d1 = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    return { bugun: await syncDay(d0, 3).catch((e) => (e as Error).message), yarin: await syncDay(d1, 3).catch((e) => (e as Error).message) };
  }, log);
  await save();
  // 5) Oranlar tercihleri (geçmiş arşivi soğuk sunucuda uzun sürebilir: kalan süre kadar beklenir)
  await step("oranlar", async () => {
    if (left() < 8000) return "süre kalmadı (sonraki çalışmada)";
    const { rows, loading } = await computeOddsPicks(Math.max(2000, left() - 6000));
    if (loading) return "arşiv yükleniyor";
    await recordOddsPicks(
      rows.map(({ a, pick }) => ({
        id: a.match.id,
        kickoff: a.match.kickoff,
        pick: pick && { key: pick.key, market: pick.market, selection: pick.selection, odd: pick.odd, rate: pick.rate, n: pick.n, confidence: pick.confidence },
      })),
      now,
    );
    return rows.filter((r) => r.pick).length;
  }, log);
  await step("karne", async () => {
    const c = await getCalibration(); // eskiyse arka planda yeniden kurulur
    return c ? c.builtAt : "hazırlanıyor";
  }, log);

  log.sure_ms = Date.now() - now;
  await setJSON(CRON_LAST_KEY, log).catch(() => {});
  return log;
}

