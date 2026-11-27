import { getJSON, getStore, setJSON } from "./auth/store";
import { foreignOddsLookup } from "./foreignOdds";
import { isLineGap, lineGapSize, scanGaps, type GapMatch, type GapRow } from "./oddsGap";
import { C, div, isTelegramEnabled, loadFonts, sendPhoto, telegramConfig, telegramSettings } from "./telegram";
import type { Analysis } from "./types";

/**
 * Oran açığı Telegram paylaşımı: iddaa oranı yurt dışının (Pinnacle…) adil oranının üstündeyse
 * "ORAN AÇIĞI YAKALANDI" görsel kartı. Her maç-seçenek bir kez; iki paylaşım arası bekleme; en büyük açık önce.
 * Ayarlar admin panelinde (tg:settings → gap). Genel "paylaşımı durdur" bunu da durdurur.
 */

export interface GapShared {
  id: string;
  key: string;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  label: string;
  odd: number;
  fair: number;
  gap: number;
  line: boolean;
  at: string;
}
const LIST_KEY = "tg:gapShared:v1";
const LAST_KEY = "tg:gap:last";
const LOCK_KEY = "tg:gap:lock";
const sentKey = (id: string, key: string) => `tg:gap:${id}:${key}`;

export const loadGapShared = async () => (await getJSON<GapShared[]>(LIST_KEY).catch(() => null)) ?? [];

const fmtLine = (x: number) => x.toFixed(1).replace(".", ",");
const sign = (g: number) => `${g >= 0 ? "+" : "−"}%${Math.abs(g * 100).toFixed(1).replace(".", ",")}`;

function box(label: string, value: string, color: string = C.text) {
  return div(
    { flexDirection: "column", alignItems: "center", padding: "16px 22px", background: C.card, borderRadius: 22, border: `2px solid ${C.line}`, minWidth: 250 },
    div({ fontSize: 26, color: C.muted }, label),
    div({ fontSize: 56, fontWeight: 700, color, marginTop: 4 }, value),
  );
}

export function gapCard(g: GapMatch, r: GapRow) {
  const a = g.a;
  const time = new Date(a.match.kickoff).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
  const lineTxt =
    isLineGap(r) && r.line
      ? `Çizgi açığı: iddaa ${fmtLine(r.line.line)} ${r.line.side}'e ${r.odd.toFixed(2)} veriyor; yurt dışı bu oranı ${fmtLine(r.line.equivLine!)} ${r.line.side}'te verirdi (${lineGapSize(r)} çizgi fark)`
      : r.line && Number.isFinite(r.line.expected)
        ? `Yurt dışına göre beklenen ${r.line.what}: ${r.line.expected.toFixed(1).replace(".", ",")}`
        : "";
  return div(
    { width: "100%", height: "100%", flexDirection: "column", background: `linear-gradient(135deg, ${C.bg} 0%, #10261f 100%)`, color: C.text, fontFamily: "Inter", padding: "48px 60px" },
    div(
      { alignItems: "center", justifyContent: "space-between" },
      div(
        { alignItems: "center" },
        div({ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, #38bdf8)`, alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }, "G"),
        div({ fontSize: 40, fontWeight: 700, marginLeft: 18 }, "goleo"),
        div({ fontSize: 26, fontWeight: 700, background: C.gold, color: "#1a1240", borderRadius: 10, padding: "4px 12px", marginLeft: 10 }, "VIP"),
      ),
      div({ fontSize: 28, fontWeight: 700, color: C.muted }, time),
    ),
    div({ fontSize: 58, fontWeight: 700, color: C.good, marginTop: 30 }, "ORAN AÇIĞI YAKALANDI"),
    div({ fontSize: 28, color: C.muted, marginTop: 14 }, a.match.league),
    div(
      { alignItems: "center", justifyContent: "space-between", marginTop: 10 },
      div({ fontSize: 48, fontWeight: 700, flex: 1 }, a.match.home.name),
      div({ fontSize: 32, fontWeight: 700, padding: "0 26px", color: C.muted }, "vs"),
      div({ fontSize: 48, fontWeight: 700, flex: 1, justifyContent: "flex-end", textAlign: "right" }, a.match.away.name),
    ),
    div(
      { flexDirection: "column", marginTop: 26, padding: "24px 32px", borderRadius: 26, background: "rgba(34,196,147,0.12)", border: `3px solid ${C.good}` },
      div({ fontSize: 28, color: C.muted }, r.market),
      div({ fontSize: 58, fontWeight: 700, marginTop: 4 }, r.selection),
    ),
    div(
      { marginTop: 24, justifyContent: "space-between" },
      box("iddaa oranı", r.odd.toFixed(2), C.gold),
      box("Yurt dışı adil", r.fairOdd.toFixed(2)),
      box("Açık", sign(r.gap), r.gap >= 0 ? C.good : "#ff5d6c"),
    ),
    lineTxt ? div({ fontSize: 27, marginTop: 22, color: C.text }, lineTxt) : div({}),
    div({ flex: 1 }),
    div(
      { fontSize: 22, color: C.muted, justifyContent: "space-between" },
      div({}, `Kaynak: ${g.reference} (marjı atılmış) · 18+ · Bilgi amaçlıdır.`),
      div({}, "goleo VIP"),
    ),
  );
}

export async function renderGapImage(g: GapMatch, r: GapRow): Promise<Buffer> {
  const { ImageResponse } = await import("next/og");
  const res = new ImageResponse(gapCard(g, r), { width: 1200, height: 880, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function gapCaption(g: GapMatch, r: GapRow): string {
  const a = g.a;
  const time = new Date(a.match.kickoff).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  return [
    `🔍 <b>ORAN AÇIĞI YAKALANDI</b> · ${time} · ${esc(a.match.league)}`,
    `<b>${esc(a.match.home.name)} – ${esc(a.match.away.name)}</b>`,
    ``,
    `🎯 <b>${esc(r.market)} · ${esc(r.selection)}</b> @ <b>${r.odd.toFixed(2)}</b>`,
    `Yurt dışı adil oran ${r.fairOdd.toFixed(2)} · Açık <b>${sign(r.gap)}</b>`,
    isLineGap(r) && r.line ? `📏 Yurt dışı bu oranı ${fmtLine(r.line.equivLine!)} ${r.line.side}'te verirdi (${lineGapSize(r)} çizgi fark)` : "",
    ``,
    `<i>18+ · Bilgi amaçlıdır.</i>`,
  ]
    .filter((x, i, arr) => x !== "" || arr[i - 1] !== "")
    .join("\n");
}

/** Şartı geçen en büyük açığı kanala gönderir (her maç-seçenek bir kez, beklemeye uyarak). Dönen: gönderilen sayısı */
const RESULT_KEY = "tg:gap:result";
export const gapLastResult = () => getJSON<{ at: string; r: number | string }>(RESULT_KEY).catch(() => null);

export async function shareOddsGaps(analyses: Analysis[], now = Date.now()): Promise<number | string> {
  let r: number | string;
  try {
    r = await shareInner(analyses, now);
  } catch (e) {
    r = `hata: ${(e as Error).message}`;
  }
  await setJSON(RESULT_KEY, { at: new Date(now).toISOString(), r }).catch(() => {});
  return r;
}

async function shareInner(analyses: Analysis[], now: number): Promise<number | string> {
  const cfg = telegramConfig();
  const store = getStore();
  if (!cfg || !store) return "Telegram ayarlı değil";
  if (!(await isTelegramEnabled())) return "paylaşım durdurulmuş";
  const set = (await telegramSettings()).gap;
  if (!set.enabled) return "oran açığı paylaşımı kapalı";
  const last = Number(await store.get(LAST_KEY).catch(() => null)) || 0;
  if (now - last < set.cooldownMin * 60_000) return "bekleme süresi";

  const afFor = await foreignOddsLookup(now);
  const soon = analyses.filter((a) => {
    const t = Date.parse(a.match.kickoff);
    return t > now + 10 * 60_000 && t <= now + set.hoursBefore * 3600_000;
  });
  const cands = scanGaps(soon, set.minGap / 100, now, afFor)
    // yurt dışına göre tutma ihtimali eşiğin üstünde olanlar (ör. %50 üstü)
    .flatMap((g) => g.rows.filter((r) => r.odd >= set.minOdd && r.pForeign * 100 > set.minProb).map((r) => ({ g, r })))
    .sort((x, y) => y.r.gap - x.r.gap);
  if (!cands.length) return "şartı geçen açık yok";

  let pick: (typeof cands)[number] | null = null;
  for (const c of cands)
    if (!(await store.get(sentKey(c.g.a.match.id, c.r.key)).catch(() => "x"))) {
      pick = c;
      break;
    }
  if (!pick) return "uygun açıkların hepsi zaten paylaşıldı";
  // aynı anda iki çalışma olursa yalnız biri gönderir
  if ((await store.incr(LOCK_KEY, 50).catch(() => 2)) !== 1) return 0;
  const sk = sentKey(pick.g.a.match.id, pick.r.key);
  if (!(await store.setNX(sk, new Date(now).toISOString()).catch(() => false))) return 0;
  try {
    const res = await sendPhoto(cfg.token, cfg.chat, await renderGapImage(pick.g, pick.r), gapCaption(pick.g, pick.r));
    if (!res.ok) throw new Error(res.error ?? "gönderilemedi");
  } catch (e) {
    await store.reset(sk).catch(() => {});
    return `hata: ${(e as Error).message}`;
  }
  await store.set(LAST_KEY, String(now));
  const a = pick.g.a;
  const list = await loadGapShared();
  list.push({
    id: a.match.id,
    key: pick.r.key,
    league: a.match.league,
    home: a.match.home.name,
    away: a.match.away.name,
    kickoff: a.match.kickoff,
    label: `${pick.r.market} · ${pick.r.selection}`,
    odd: pick.r.odd,
    fair: pick.r.fairOdd,
    gap: pick.r.gap,
    line: isLineGap(pick.r),
    at: new Date(now).toISOString(),
  });
  await setJSON(LIST_KEY, list.slice(-500));
  return 1;
}
