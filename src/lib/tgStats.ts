import { C, div, isTelegramEnabled, loadFonts, loadShared, sendPhoto, SHARED_KEY, telegramConfig, telegramSettings, type SharedPick } from "./telegram";
import { getStore, setJSON } from "./auth/store";
import { loadPreShared, preSharedWithResults } from "./tgPre";
import { loadLiveDay, settleLive } from "./liveTracking";
import { dayPnl, type DayPnl } from "./pnl";

/**
 * Kanalda paylaşılan tahminlerin karnesi: kaçta kaçı tuttu, tutanların oranları (kanal görselinde para hesabı yok).
 * Sonuçlar canlı takip kayıtlarından (live:YYYY-MM-DD) okunur.
 */

export type StatsScope = "bugun" | "dun" | "7gun" | "tum";
export const SCOPE_LABEL: Record<StatsScope, string> = { bugun: "Bugün", dun: "Dün", "7gun": "Son 7 gün", tum: "Tüm zamanlar" };

const trDay = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);

export interface StatsRow extends SharedPick {
  won: boolean | null | undefined; // undefined: maç bitmedi / sonuç bekleniyor
  fhg?: number;
  early?: boolean; // maç bitmeden kesinleşti (skor o anki)
  fag?: number;
}

export type StatsKind = "canli" | "mac";
export const KIND_LABEL: Record<StatsKind, string> = { canli: "Canlı", mac: "Maç önü" };

export interface SharedStats {
  scope: StatsScope;
  kind?: StatsKind;
  rows: StatsRow[];
  pnl: DayPnl;
  avgWinOdd: number | null;
  from: string | null;
  to: string | null;
}

export async function sharedStats(scope: StatsScope, now = Date.now(), kind: StatsKind = "canli"): Promise<SharedStats> {
  if (kind === "mac") return preStats(scope, now);
  const today = trDay(now);
  const yesterday = trDay(now - 86400_000);
  const week = trDay(now - 6 * 86400_000);
  const all = await loadShared();
  const picked = all.filter((p) =>
    scope === "bugun" ? p.date === today : scope === "dun" ? p.date === yesterday : scope === "7gun" ? p.date >= week : true,
  );
  const dates = [...new Set(picked.flatMap((p) => [p.date, prevDay(p.date)]))];
  // Bitmiş maçları sonuçlandır (bugün ve dün için; daha eskiler zaten sonuçlanmıştır)
  await Promise.all(dates.filter((d) => d === today || d === yesterday).map((d) => settleLive(d, now, 3000).catch(() => 0)));
  const days = new Map(await Promise.all(dates.map(async (d) => [d, await loadLiveDay(d).catch(() => [])] as const)));
  const rows: StatsRow[] = picked.map((p) => {
    const rec = days.get(p.date)?.find((r) => `${r.fotmobId}|${r.label}` === p.id) ?? days.get(prevDay(p.date))?.find((r) => `${r.fotmobId}|${r.label}` === p.id);
    return { ...p, won: rec?.result ? rec.result.won : undefined, fhg: rec?.result?.hg, fag: rec?.result?.ag, early: rec?.result?.early };
  });
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const wins = rows.filter((r) => r.won === true && r.odd > 1); // oransız (elle paylaşılan) kayıtlar ortalamaya girmez
  return {
    scope,
    rows,
    pnl: dayPnl(rows.map((r) => ({ odd: r.odd, won: r.won }))),
    avgWinOdd: wins.length ? wins.reduce((s, r) => s + r.odd, 0) / wins.length : null,
    from: picked.length ? picked.map((p) => p.date).sort()[0] : null,
    to: picked.length ? picked.map((p) => p.date).sort().at(-1)! : null,
  };
}

/** Maç önü paylaşımlarının karnesi (aynı görünüm) */
async function preStats(scope: StatsScope, now: number): Promise<SharedStats> {
  const today = trDay(now),
    yesterday = trDay(now - 86400_000),
    week = trDay(now - 6 * 86400_000);
  const all = await loadPreShared();
  const picked = all.filter((p) =>
    scope === "bugun" ? p.date === today : scope === "dun" ? p.date === yesterday : scope === "7gun" ? p.date >= week : true,
  );
  const withRes = await preSharedWithResults(picked);
  const rows: StatsRow[] = withRes.map((p) => ({
    id: `${p.id}|${p.key}`,
    date: p.date,
    fotmobId: 0,
    league: p.league,
    home: p.home,
    away: p.away,
    label: p.label,
    odd: p.odd,
    prob: p.prob,
    confidence: p.confidence,
    minute: "MÖ",
    hg: 0,
    ag: 0,
    at: p.at,
    won: p.won,
    fhg: p.hg,
    fag: p.ag,
  }));
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const wins = rows.filter((r) => r.won === true && r.odd > 1); // oransız (elle paylaşılan) kayıtlar ortalamaya girmez
  return {
    scope,
    kind: "mac",
    rows,
    pnl: dayPnl(rows.map((r) => ({ odd: r.odd, won: r.won }))),
    avgWinOdd: wins.length ? wins.reduce((s, r) => s + r.odd, 0) / wins.length : null,
    from: picked.length ? picked.map((p) => p.date).sort()[0] : null,
    to: picked.length ? picked.map((p) => p.date).sort().at(-1)! : null,
  };
}

/* ------------------------------------------------------------ görsel */

const fmtDate = (d: string) => d.split("-").reverse().join(".");

function big(label: string, value: string, color: string = C.text) {
  return div(
    { flexDirection: "column", alignItems: "center", padding: "18px 10px", background: C.card, borderRadius: 22, border: `2px solid ${C.line}`, width: 255 },
    div({ fontSize: 24, color: C.muted }, label),
    div({ fontSize: 52, fontWeight: 700, color, marginTop: 4 }, value),
  );
}

const MAX_ROWS = 10;

export function statsCard(st: SharedStats) {
  const p = st.pnl;
  const rate = p.settled ? Math.round((p.hits / p.settled) * 100) : null;
  const period = st.from ? (st.from === st.to ? fmtDate(st.from) : `${fmtDate(st.from)} – ${fmtDate(st.to!)}`) : "";
  const rows = st.rows.filter((r) => r.won !== undefined && r.won !== null).slice(0, MAX_ROWS);
  const pending = p.shared - p.settled;

  const row = (r: StatsRow) =>
    div(
      { alignItems: "center", padding: "12px 0", borderTop: `2px solid ${C.line}`, fontSize: 26 },
      div(
        {
          width: 112,
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          borderRadius: 999,
          padding: "6px 0",
          background: r.won ? "rgba(34,196,147,0.18)" : "rgba(255,93,108,0.18)",
          color: r.won ? C.good : "#ff5d6c",
        },
        r.won ? "TUTTU" : "YATTI",
      ),
      div({ flex: 1, marginLeft: 18, color: C.text, overflow: "hidden" }, `${r.home} – ${r.away}`),
      div({ width: 250, color: C.muted, justifyContent: "flex-end" }, r.label),
      div({ width: 110, justifyContent: "flex-end", fontWeight: 700, color: r.won ? C.gold : C.muted }, r.odd ? r.odd.toFixed(2) : "—"),
    );

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
      div({ fontSize: 28, fontWeight: 700, color: C.muted }, st.kind === "mac" ? "MAÇ ÖNÜ TAHMİN KARNESİ" : "CANLI TAHMİN KARNESİ"),
    ),
    div({ fontSize: 46, fontWeight: 700, marginTop: 30 }, SCOPE_LABEL[st.scope]),
    div({ fontSize: 26, color: C.muted, marginTop: 4 }, period ? `${period} · kanalda paylaşılan tahminler` : "kanalda paylaşılan tahminler"),
    div(
      { marginTop: 26, justifyContent: "space-between" },
      big("Tuttu", `${p.hits}/${p.settled}`, C.good),
      big("İsabet", rate === null ? "—" : `%${rate}`, rate !== null && rate >= 50 ? C.good : "#ff5d6c"),
      big("Tutan ort. oran", st.avgWinOdd ? st.avgWinOdd.toFixed(2) : "—", C.gold),
      big("Paylaşılan", String(p.shared), C.text),
    ),
    div(
      { flexDirection: "column", marginTop: 28 },
      ...(rows.length ? rows.map(row) : [div({ fontSize: 26, color: C.muted, padding: "14px 0" }, "Henüz sonuçlanan paylaşım yok.")]),
    ),
    div({ flex: 1 }),
    div(
      { fontSize: 22, color: C.muted, justifyContent: "space-between", marginTop: 16 },
      div({}, `${pending > 0 ? `${pending} tahmin sonuç bekliyor · ` : ""}18+ · Bilgi amaçlıdır.`),
      div({}, "goleo VIP"),
    ),
  );
}

export async function renderStatsImage(st: SharedStats): Promise<Buffer> {
  const { ImageResponse } = await import("next/og");
  const rows = Math.min(MAX_ROWS, st.rows.filter((r) => r.won !== undefined && r.won !== null).length);
  const res = new ImageResponse(statsCard(st), { width: 1200, height: 520 + Math.max(1, rows) * 64, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

export function statsCaption(st: SharedStats): string {
  const p = st.pnl;
  const rate = p.settled ? Math.round((p.hits / p.settled) * 100) : 0;
  return [
    `📊 <b>${st.kind === "mac" ? "Maç önü" : "Canlı"} tahmin karnesi · ${SCOPE_LABEL[st.scope]}</b>`,
    p.settled ? `✅ ${p.hits}/${p.settled} tuttu (%${rate})` : "Henüz sonuçlanan paylaşım yok.",
    st.avgWinOdd ? `Tutanların ortalama oranı: <b>${st.avgWinOdd.toFixed(2)}</b>` : "",
    ``,
    `<i>18+ · Bilgi amaçlıdır.</i>`,
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");
}

export async function shareStatsToChannel(scope: StatsScope, kind: StatsKind = "canli"): Promise<{ ok: boolean; error?: string; stats?: SharedStats }> {
  const cfg = telegramConfig();
  if (!cfg) return { ok: false, error: "Telegram ayarlı değil" };
  const st = await sharedStats(scope, Date.now(), kind);
  if (!st.pnl.settled) return { ok: false, error: "Bu dönemde sonuçlanmış paylaşım yok", stats: st };
  const r = await sendPhoto(cfg.token, cfg.chat, await renderStatsImage(st), statsCaption(st));
  return { ...r, stats: st };
}

/* ------------------------------------------------------------ paylaşılan tahminin sonucu */

export interface ResultShare {
  pick: SharedPick;
  won: boolean;
  hg: number;
  ag: number;
  early: boolean; // maç bitmeden kesinleşti
}

export function resultCard(r: ResultShare) {
  const p = r.pick;
  const color = r.won ? C.good : "#ff5d6c";
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
      div({ fontSize: 26, fontWeight: 700, color: C.muted }, "CANLI TAHMİN SONUCU"),
    ),
    div({ fontSize: 26, color: C.muted, marginTop: 30 }, p.league),
    div(
      { alignItems: "center", justifyContent: "space-between", marginTop: 10 },
      div({ fontSize: 46, fontWeight: 700, flex: 1 }, p.home),
      div({ fontSize: 66, fontWeight: 700, padding: "0 30px", color: C.gold }, `${r.hg} - ${r.ag}`),
      div({ fontSize: 46, fontWeight: 700, flex: 1, justifyContent: "flex-end", textAlign: "right" }, p.away),
    ),
    div(
      { marginTop: 30, alignItems: "center", justifyContent: "space-between", padding: "24px 30px", borderRadius: 26, border: `3px solid ${color}`, background: r.won ? "rgba(34,196,147,0.14)" : "rgba(255,93,108,0.14)" },
      div(
        { flexDirection: "column" },
        div({ fontSize: 26, color: C.muted }, `Tercih · ${p.minute} ${p.hg}-${p.ag} iken`),
        div({ fontSize: 56, fontWeight: 700, marginTop: 4 }, p.label),
        div({ fontSize: 26, color: C.muted, marginTop: 6 }, `${p.odd ? `oran ${p.odd.toFixed(2)} · ` : ""}kazanma %${Math.round(p.prob * 100)}`),
      ),
      div({ fontSize: 58, fontWeight: 700, color }, r.won ? "KAZANDI" : "KAYBETTİ"),
    ),
    div({ flex: 1 }),
    div(
      { fontSize: 22, color: C.muted, justifyContent: "space-between" },
      div({}, r.early ? "Maç sürerken kesinleşti · 18+ · Bilgi amaçlıdır." : "Maç sonu · 18+ · Bilgi amaçlıdır."),
      div({}, "goleo VIP"),
    ),
  );
}

export async function renderResultImage(r: ResultShare): Promise<Buffer> {
  const { ImageResponse } = await import("next/og");
  const res = new ImageResponse(resultCard(r), { width: 1200, height: 600, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function resultCaption(r: ResultShare): string {
  const p = r.pick;
  return [
    `${r.won ? "✅ <b>KAZANDI</b>" : "❌ <b>KAYBETTİ</b>"} · ${esc(p.label)}${p.odd ? ` @ ${p.odd.toFixed(2)}` : ""}`,
    `${esc(p.home)} <b>${r.hg}-${r.ag}</b> ${esc(p.away)}${r.early ? " (maç sürüyor)" : ""}`,
    `<i>${esc(p.league)} · ${esc(p.minute)} ${p.hg}-${p.ag} iken paylaşılmıştı</i>`,
  ].join("\n");
}

/**
 * Kanalda paylaşılan ve sonucu kesinleşen tahminler için "kazandı / kaybetti" mesajı (her tahmin için bir kez).
 * Son 24 saatin paylaşımları; kanal dolmasın diye bir çalışmada en fazla 3 mesaj (kalanlar sonraki çalışmada).
 * Paylaşım admin panelinden durdurulduysa ya da sonuç mesajları kapalıysa gönderilmez.
 */
const RESULTS_PER_RUN = 3;
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);


export async function postSharedResults(now = Date.now(), budgetMs = 15000, force = false): Promise<number> {
  const cfg = telegramConfig();
  if (!cfg || !getStore()) return 0;
  if (!force && !(await isTelegramEnabled())) return 0;
  if (!force && !(await telegramSettings()).results) return 0;
  const list = await loadShared();
  const pending = list.filter((p) => !p.resultSentAt && now - Date.parse(p.at) < 24 * 3600_000);
  if (!pending.length) return 0;
  // Önce bu tahminlerin günlerini sonuçlandır (maç bitmiş ya da kesinleşmiş olabilir)
  await Promise.all([...new Set(pending.flatMap((p) => [p.date, prevDay(p.date)]))].map((d) => settleLive(d, now, 6000).catch(() => 0)));
  // Kayıt, paylaşımdan önceki güne düşmüş olabilir (gece yarısı): iki güne de bakılır
  const dates = [...new Set(pending.flatMap((p) => [p.date, prevDay(p.date)]))];
  const days = new Map(await Promise.all(dates.map(async (d) => [d, await loadLiveDay(d).catch(() => [])] as const)));
  const deadline = Date.now() + budgetMs;
  const sent: string[] = [];
  for (const p of pending.sort((a, b) => a.at.localeCompare(b.at))) {
    if (Date.now() > deadline || sent.length >= RESULTS_PER_RUN) break;
    const rec = [p.date, prevDay(p.date)].map((d) => days.get(d)?.find((r) => `${r.fotmobId}|${r.label}` === p.id)).find(Boolean);
    const res = rec?.result;
    if (!res || typeof res.won !== "boolean") continue;
    const r: ResultShare = { pick: p, won: res.won, hg: res.hg, ag: res.ag, early: !!res.early };
    try {
      const ok = await sendPhoto(cfg.token, cfg.chat, await renderResultImage(r), resultCaption(r));
      if (ok.ok) sent.push(`${p.id}|${p.at}`);
    } catch {
      /* bir sonraki çalışmada tekrar denenir */
    }
  }
  if (sent.length) {
    // En güncel listeyi okuyup yalnız gönderilenleri işaretle (bu arada yeni paylaşım eklenmiş olabilir)
    const latest = await loadShared();
    const stamp = new Date().toISOString();
    for (const x of latest) if (sent.includes(`${x.id}|${x.at}`)) x.resultSentAt = stamp;
    await setJSON(SHARED_KEY, latest);
  }
  return sent.length;
}
