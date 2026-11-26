import { getJSON, getStore, setJSON } from "./auth/store";
import { C, div, isTelegramEnabled, loadFonts, sendPhoto, telegramConfig, telegramSettings } from "./telegram";
import { loadDay, mainPick, pickWon, trDate } from "./tracking";
import type { Analysis } from "./types";

/**
 * Maç önü (Maçlar sistemi) Telegram paylaşımı — canlıdakinin aynısı:
 *  - maça en çok N saat kala, ana tercihin kazanma olasılığı ≥ eşik ve oranı ≥ en düşük oran ise görsel kart
 *  - her maç bir kez; iki paylaşım arası en az bekleme
 *  - maç bitince "kazandı / kaybetti" sonuç mesajı
 * Ayarlar admin panelinde (tg:settings → pre). Genel "paylaşımı durdur" bunu da durdurur.
 */

export interface PreShared {
  id: string; // maç kimliği
  date: string; // başlama günü (Türkiye)
  league: string;
  home: string;
  away: string;
  kickoff: string;
  key: string;
  label: string;
  odd: number;
  prob: number;
  confidence: number;
  at: string;
  resultSentAt?: string;
  won?: boolean | null;
  hg?: number;
  ag?: number;
}

export const PRE_SHARED_KEY = "tg:preShared:v1";
const LAST_KEY = "tg:pre:last";
const COOLDOWN_KEY = "tg:pre:cooldown";
const sentKey = (id: string) => `tg:pre:${id}`;

export async function loadPreShared(): Promise<PreShared[]> {
  return (await getJSON<PreShared[]>(PRE_SHARED_KEY).catch(() => null)) ?? [];
}

/* ------------------------------------------------------------ görsel */

const pc = (x: number) => `%${Math.round(x * 100)}`;

function stat(label: string, value: string, color: string = C.text) {
  return div(
    { flexDirection: "column", alignItems: "center", padding: "16px 22px", background: C.card, borderRadius: 22, border: `2px solid ${C.line}`, minWidth: 220 },
    div({ fontSize: 26, color: C.muted }, label),
    div({ fontSize: 54, fontWeight: 700, color, marginTop: 4 }, value),
  );
}

export function preCard(a: Analysis, p: { label: string; odd: number; prob: number; confidence: number }) {
  const k = new Date(a.match.kickoff);
  const time = k.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
  const facts = [
    `2.5 Üst ${pc(a.summary.over25)}`,
    `KG Var ${pc(a.summary.btts)}`,
    a.summary.topScores[0] ? `En olası skor ${a.summary.topScores[0].score}` : "",
    `Gol beklentisi ${a.lambda.home.toFixed(2)} – ${a.lambda.away.toFixed(2)}`,
  ].filter(Boolean);
  return div(
    { width: "100%", height: "100%", flexDirection: "column", background: `linear-gradient(135deg, ${C.bg} 0%, #1a1240 100%)`, color: C.text, fontFamily: "Inter", padding: "48px 60px" },
    div(
      { alignItems: "center", justifyContent: "space-between" },
      div(
        { alignItems: "center" },
        div({ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, #38bdf8)`, alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }, "G"),
        div({ fontSize: 40, fontWeight: 700, marginLeft: 18 }, "goleo"),
        div({ fontSize: 26, fontWeight: 700, background: C.gold, color: "#1a1240", borderRadius: 10, padding: "4px 12px", marginLeft: 10 }, "VIP"),
      ),
      div({ fontSize: 30, fontWeight: 700, color: "#38bdf8" }, `MAÇ ÖNÜ · ${time}`),
    ),
    div({ fontSize: 28, color: C.muted, marginTop: 34 }, a.match.league),
    div(
      { alignItems: "center", justifyContent: "space-between", marginTop: 14 },
      div({ fontSize: 50, fontWeight: 700, flex: 1 }, a.match.home.name),
      div({ fontSize: 34, fontWeight: 700, padding: "0 30px", color: C.muted }, "vs"),
      div({ fontSize: 50, fontWeight: 700, flex: 1, justifyContent: "flex-end", textAlign: "right" }, a.match.away.name),
    ),
    div(
      { flexDirection: "column", marginTop: 32, padding: "26px 34px", borderRadius: 26, background: "rgba(56,189,248,0.12)", border: "3px solid #38bdf8" },
      div({ fontSize: 28, color: C.muted }, "Maç önü tercih"),
      div({ fontSize: 60, fontWeight: 700, marginTop: 4 }, p.label),
    ),
    div(
      { marginTop: 26, justifyContent: "space-between" },
      stat("Kazanma", pc(p.prob), C.good),
      stat("Oran", p.odd.toFixed(2), C.gold),
      stat("Güven", `%${p.confidence}`),
      stat("Getiri", `${p.prob * p.odd - 1 >= 0 ? "+" : "−"}%${Math.abs(Math.round((p.prob * p.odd - 1) * 100))}`, p.prob * p.odd >= 1 ? C.good : "#ff5d6c"),
    ),
    div(
      { marginTop: 24, flexWrap: "wrap" },
      ...facts.map((f) =>
        div({ fontSize: 26, color: C.text, background: C.card, border: `2px solid ${C.line}`, borderRadius: 999, padding: "8px 18px", marginRight: 12, marginBottom: 12 }, f),
      ),
    ),
    div({ flex: 1 }),
    div({ fontSize: 22, color: C.muted, justifyContent: "space-between" }, div({}, "18+ · Bilgi amaçlıdır, kesinlik içermez."), div({}, "goleo VIP")),
  );
}

async function render(node: ReturnType<typeof div>, height: number): Promise<Buffer> {
  const { ImageResponse } = await import("next/og");
  const res = new ImageResponse(node, { width: 1200, height, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

export const renderPreImage = (a: Analysis, p: Parameters<typeof preCard>[1]) => render(preCard(a, p), 840);

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function preCaption(a: Analysis, p: { label: string; odd: number; prob: number; confidence: number }): string {
  const time = new Date(a.match.kickoff).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  return [
    `⚽ <b>MAÇ ÖNÜ</b> · ${time} · ${esc(a.match.league)}`,
    `<b>${esc(a.match.home.name)} – ${esc(a.match.away.name)}</b>`,
    ``,
    `🎯 <b>${esc(p.label)}</b> @ <b>${p.odd.toFixed(2)}</b>`,
    `Kazanma ${pc(p.prob)} · Güven %${p.confidence}`,
    ``,
    `<i>18+ · Bilgi amaçlıdır.</i>`,
  ].join("\n");
}

/* ------------------------------------------------------------ paylaşım */

/** Şartı geçen en iyi maç önü tercihini kanala gönderir (her maç bir kez, bekleme süresine uyarak). */
export async function sharePrematchPicks(analyses: Analysis[], now = Date.now()): Promise<number> {
  const cfg = telegramConfig();
  const store = getStore();
  if (!cfg || !store) return 0;
  if (!(await isTelegramEnabled())) return 0;
  const set = (await telegramSettings()).pre;
  if (!set.enabled) return 0;

  const cands = analyses
    .filter((a) => {
      const t = new Date(a.match.kickoff).getTime();
      return t > now + 10 * 60_000 && t <= now + set.hoursBefore * 3600_000;
    })
    .map((a) => ({ a, p: mainPick(a) }))
    .filter((x): x is { a: Analysis; p: NonNullable<ReturnType<typeof mainPick>> } => !!x.p && Math.round(x.p.prob * 100) >= set.minProb && x.p.odd >= set.minOdd)
    .sort((x, y) => y.p.prob - x.p.prob);
  if (!cands.length) return 0;

  const last = Number(await store.get(LAST_KEY).catch(() => null)) || 0;
  if (now - last < set.cooldownMin * 60_000) return 0;
  let pick: (typeof cands)[number] | null = null;
  for (const c of cands)
    if (!(await store.get(sentKey(c.a.match.id)).catch(() => "x"))) {
      pick = c;
      break;
    }
  if (!pick) return 0;
  // aynı anda iki çalışma olursa yalnız biri gönderir
  if ((await store.incr(COOLDOWN_KEY, Math.max(60, set.cooldownMin * 60)).catch(() => 2)) !== 1) {
    if (now - last >= set.cooldownMin * 60_000 * 2) await store.reset(COOLDOWN_KEY).catch(() => {});
    return 0;
  }
  if (!(await store.setNX(sentKey(pick.a.match.id), new Date(now).toISOString()).catch(() => false))) return 0;
  const { a, p } = pick;
  const data = { label: `${p.market} · ${p.selection}`, odd: p.odd, prob: p.prob, confidence: p.confidence };
  try {
    const r = await sendPhoto(cfg.token, cfg.chat, await renderPreImage(a, data), preCaption(a, data));
    if (!r.ok) throw new Error(r.error);
  } catch (e) {
    console.error("Maç önü paylaşımı gönderilemedi:", (e as Error).message);
    await store.reset(sentKey(a.match.id)).catch(() => {});
    await store.reset(COOLDOWN_KEY).catch(() => {});
    return 0;
  }
  await store.set(LAST_KEY, String(now));
  const list = await loadPreShared();
  list.push({
    id: a.match.id,
    date: trDate(new Date(a.match.kickoff).getTime()),
    league: a.match.league,
    home: a.match.home.name,
    away: a.match.away.name,
    kickoff: a.match.kickoff,
    key: p.key,
    ...data,
    at: new Date(now).toISOString(),
  });
  await setJSON(PRE_SHARED_KEY, list.slice(-1000));
  return 1;
}

/* ------------------------------------------------------------ sonuçlar */

/** Paylaşılan maç önü tercihlerinin sonucu: maç sonucu kaydına (snap) göre; paylaşılan tercih anahtarıyla değerlendirilir */
export async function preSharedWithResults(list?: PreShared[]): Promise<(PreShared & { won: boolean | null | undefined })[]> {
  const all = list ?? (await loadPreShared());
  const dates = [...new Set(all.map((p) => p.date))];
  const days = new Map(await Promise.all(dates.map(async (d) => [d, await loadDay(d).catch(() => [])] as const)));
  return all.map((p) => {
    const e = days.get(p.date)?.find((x) => x.id === p.id);
    const r = e?.result;
    if (!r) return { ...p, won: undefined };
    return { ...p, won: pickWon(p.key, r), hg: r.hg, ag: r.ag };
  });
}

function resultCard(p: PreShared, won: boolean) {
  const color = won ? C.good : "#ff5d6c";
  return div(
    { width: "100%", height: "100%", flexDirection: "column", background: `linear-gradient(135deg, ${C.bg} 0%, #1a1240 100%)`, color: C.text, fontFamily: "Inter", padding: "44px 56px" },
    div(
      { alignItems: "center", justifyContent: "space-between" },
      div(
        { alignItems: "center" },
        div({ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, #38bdf8)`, alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700 }, "G"),
        div({ fontSize: 38, fontWeight: 700, marginLeft: 16 }, "goleo"),
        div({ fontSize: 24, fontWeight: 700, background: C.gold, color: "#1a1240", borderRadius: 10, padding: "4px 12px", marginLeft: 10 }, "VIP"),
      ),
      div({ fontSize: 26, fontWeight: 700, color: C.muted }, "MAÇ ÖNÜ TAHMİN SONUCU"),
    ),
    div({ fontSize: 26, color: C.muted, marginTop: 30 }, p.league),
    div(
      { alignItems: "center", justifyContent: "space-between", marginTop: 10 },
      div({ fontSize: 46, fontWeight: 700, flex: 1 }, p.home),
      div({ fontSize: 66, fontWeight: 700, padding: "0 30px", color: C.gold }, `${p.hg ?? 0} - ${p.ag ?? 0}`),
      div({ fontSize: 46, fontWeight: 700, flex: 1, justifyContent: "flex-end", textAlign: "right" }, p.away),
    ),
    div(
      { marginTop: 30, alignItems: "center", justifyContent: "space-between", padding: "24px 30px", borderRadius: 26, border: `3px solid ${color}`, background: won ? "rgba(34,196,147,0.14)" : "rgba(255,93,108,0.14)" },
      div(
        { flexDirection: "column" },
        div({ fontSize: 26, color: C.muted }, "Maç önü tercih"),
        div({ fontSize: 52, fontWeight: 700, marginTop: 4 }, p.label),
        div({ fontSize: 26, color: C.muted, marginTop: 6 }, `oran ${p.odd.toFixed(2)} · kazanma %${Math.round(p.prob * 100)}`),
      ),
      div({ fontSize: 58, fontWeight: 700, color }, won ? "KAZANDI" : "KAYBETTİ"),
    ),
    div({ flex: 1 }),
    div({ fontSize: 22, color: C.muted, justifyContent: "space-between" }, div({}, "Maç sonu · 18+ · Bilgi amaçlıdır."), div({}, "goleo VIP")),
  );
}

/** Sonucu belli olan, son 48 saatte paylaşılmış maç önü tercihleri için sonuç mesajı (çalışma başına en fazla 3) */
export async function postPrematchResults(now = Date.now(), force = false): Promise<number> {
  const cfg = telegramConfig();
  if (!cfg || !getStore()) return 0;
  if (!force && !(await isTelegramEnabled())) return 0;
  const set = (await telegramSettings()).pre;
  if (!force && (!set.enabled || !set.results)) return 0;
  const list = await loadPreShared();
  const pending = list.filter((p) => !p.resultSentAt && now - Date.parse(p.at) < 48 * 3600_000);
  if (!pending.length) return 0;
  const withRes = await preSharedWithResults(pending);
  const sent: string[] = [];
  for (const p of withRes) {
    if (sent.length >= 3) break;
    if (typeof p.won !== "boolean") continue;
    try {
      const r = await sendPhoto(
        cfg.token,
        cfg.chat,
        await render(resultCard(p, p.won), 600),
        [
          `${p.won ? "✅ <b>KAZANDI</b>" : "❌ <b>KAYBETTİ</b>"} · ${esc(p.label)} @ ${p.odd.toFixed(2)}`,
          `${esc(p.home)} <b>${p.hg}-${p.ag}</b> ${esc(p.away)}`,
          `<i>Maç önü tahmin · ${esc(p.league)}</i>`,
        ].join("\n"),
      );
      if (r.ok) sent.push(`${p.id}|${p.at}`);
    } catch {
      /* sonraki çalışmada tekrar */
    }
  }
  if (sent.length) {
    const latest = await loadPreShared();
    const stamp = new Date().toISOString();
    for (const x of latest) if (sent.includes(`${x.id}|${x.at}`)) x.resultSentAt = stamp;
    await setJSON(PRE_SHARED_KEY, latest);
  }
  return sent.length;
}
