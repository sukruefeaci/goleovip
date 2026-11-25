import { createElement as h, type CSSProperties, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getJSON, getStore, setJSON } from "./auth/store";
import { LIVE_MIN_ODD, type LiveBet, type LiveStats } from "./liveModel";

/**
 * Canlı bölümünde güveni yüksek (varsayılan ≥ %70) ve iddaa canlı oranı ≥ 1.45 olan bir öneri çıkınca görsel kart hazırlayıp Telegram kanalına gönderir.
 * Ayarlar (Vercel → Environment Variables):
 *   TELEGRAM_BOT_TOKEN  BotFather'dan alınan bot anahtarı (gizli)
 *   TELEGRAM_CHAT_ID    kanal adı (@kanal) ya da sayısal kimlik
 *   TELEGRAM_MIN_CONF   isteğe bağlı eşik (varsayılan 70)
 *   TELEGRAM_COOLDOWN_MIN  iki paylaşım arası en az süre, dakika (varsayılan 30)
 * Aynı maç + aynı öneri bir kez gönderilir (veritabanında tg: anahtarı).
 */

export function telegramConfig(): { token: string; chat: string; minConf: number; cooldownMin: number } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return null;
  const m = Number(process.env.TELEGRAM_MIN_CONF);
  const cdRaw = process.env.TELEGRAM_COOLDOWN_MIN?.trim();
  const cd = cdRaw ? Number(cdRaw) : NaN;
  return { token, chat, minConf: Number.isFinite(m) && m > 0 ? m : 70, cooldownMin: Number.isFinite(cd) && cd >= 0 ? cd : 30 };
}

export interface LiveShare {
  fotmobId: number;
  league: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  minute: string;
  tempo: string;
  stats: LiveStats;
  rec: LiveBet;
}

/* ------------------------------------------------------------ görsel */

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;
export async function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const [r, b] = await Promise.all([readFile(path.join(dir, "Inter-Regular.otf")), readFile(path.join(dir, "Inter-Bold.otf"))]);
  fonts = [
    { name: "Inter", data: r, weight: 400, style: "normal" },
    { name: "Inter", data: b, weight: 700, style: "normal" },
  ];
  return fonts;
}

export const C = { bg: "#0b0b1a", card: "#15152b", line: "#2a2a4a", text: "#ecebff", muted: "#9a98c6", accent: "#7c5cff", good: "#22c493", gold: "#f5c542" };

export const div = (style: CSSProperties, ...children: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...children);

function stat(label: string, value: string, color = C.text) {
  return div(
    { flexDirection: "column", alignItems: "center", padding: "18px 26px", background: C.card, borderRadius: 22, border: `2px solid ${C.line}`, minWidth: 210 },
    div({ fontSize: 26, color: C.muted }, label),
    div({ fontSize: 56, fontWeight: 700, color, marginTop: 4 }, value),
  );
}

export function shareCard(s: LiveShare) {
  const r = s.rec;
  const st = s.stats;
  const facts: string[] = [];
  if (st.xg) facts.push(`xG ${st.xg[0].toFixed(2)} – ${st.xg[1].toFixed(2)}`);
  if (st.shots) facts.push(`Şut ${st.shots[0]} – ${st.shots[1]}`);
  if (st.sot) facts.push(`İsabetli ${st.sot[0]} – ${st.sot[1]}`);
  if (st.poss) facts.push(`Topla oynama %${st.poss[0]} – %${st.poss[1]}`);
  facts.push(`Tempo: ${s.tempo}`);

  return div(
    { width: "100%", height: "100%", flexDirection: "column", background: `linear-gradient(135deg, ${C.bg} 0%, #1a1240 100%)`, color: C.text, fontFamily: "Inter", padding: "48px 60px" },
    // üst bant
    div(
      { alignItems: "center", justifyContent: "space-between" },
      div(
        { alignItems: "center" },
        div({ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, #38bdf8)`, alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }, "G"),
        div({ fontSize: 40, fontWeight: 700, marginLeft: 18 }, "goleo"),
        div({ fontSize: 26, fontWeight: 700, background: C.gold, color: "#1a1240", borderRadius: 10, padding: "4px 12px", marginLeft: 10 }, "VIP"),
      ),
      div(
        { alignItems: "center", fontSize: 30, fontWeight: 700, color: "#ff5d6c" },
        div({ width: 18, height: 18, borderRadius: 9, background: "#ff5d6c", marginRight: 12 }),
        `CANLI · ${s.minute}`,
      ),
    ),
    // lig
    div({ fontSize: 28, color: C.muted, marginTop: 34 }, s.league),
    // takımlar ve skor
    div(
      { alignItems: "center", justifyContent: "space-between", marginTop: 14 },
      div({ fontSize: 50, fontWeight: 700, flex: 1 }, s.home),
      div({ fontSize: 72, fontWeight: 700, padding: "0 34px", color: C.gold }, `${s.hg} - ${s.ag}`),
      div({ fontSize: 50, fontWeight: 700, flex: 1, justifyContent: "flex-end", textAlign: "right" }, s.away),
    ),
    // tercih
    div(
      { flexDirection: "column", marginTop: 34, padding: "26px 34px", borderRadius: 26, background: "rgba(124,92,255,0.16)", border: `3px solid ${C.accent}` },
      div({ fontSize: 28, color: C.muted }, "Canlı tercih"),
      div({ fontSize: 66, fontWeight: 700, marginTop: 4 }, r.label),
    ),
    // sayılar
    div(
      { marginTop: 28, justifyContent: "space-between" },
      stat("Kazanma", `%${Math.round(r.prob * 100)}`, C.good),
      stat("Güven", `%${r.confidence}`, C.good),
      stat("Oran", r.odd ? r.odd.toFixed(2) : "—", C.gold),
      stat("Getiri", r.ev !== undefined ? `${r.ev >= 0 ? "+" : "−"}%${Math.abs(Math.round(r.ev * 100))}` : "—", r.ev !== undefined && r.ev < 0 ? "#ff5d6c" : C.good),
    ),
    // istatistik
    div(
      { marginTop: 26, flexWrap: "wrap" },
      ...facts.map((f) =>
        div({ fontSize: 26, color: C.text, background: C.card, border: `2px solid ${C.line}`, borderRadius: 999, padding: "8px 18px", marginRight: 12, marginBottom: 12 }, f),
      ),
    ),
    div({ flex: 1 }),
    div(
      { fontSize: 22, color: C.muted, justifyContent: "space-between" },
      div({}, "18+ · Bilgi amaçlıdır, kesinlik içermez."),
      div({}, "goleo VIP"),
    ),
  );
}

export async function renderShareImage(s: LiveShare): Promise<Buffer> {
  const { ImageResponse } = await import("next/og");
  const res = new ImageResponse(shareCard(s), { width: 1200, height: 920, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------ gönderim */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function shareCaption(s: LiveShare): string {
  const r = s.rec;
  return [
    `🔴 <b>CANLI</b> · ${esc(s.minute)} · ${esc(s.league)}`,
    `<b>${esc(s.home)} ${s.hg}-${s.ag} ${esc(s.away)}</b>`,
    ``,
    `🎯 <b>${esc(r.label)}</b>${r.odd ? ` @ <b>${r.odd.toFixed(2)}</b>` : ""}`,
    `Kazanma %${Math.round(r.prob * 100)} · Güven %${r.confidence}`,
    ``,
    `<i>18+ · Bilgi amaçlıdır.</i>`,
  ].join("\n");
}

export async function sendPhoto(token: string, chat: string, png: Buffer, caption: string): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.append("chat_id", chat);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "goleo-canli.png");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.description ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------ açma / kapama ve paylaşım kaydı */

const ENABLED_KEY = "tg:enabled";
let enabledMemo: { at: number; v: boolean } | null = null;

/** Admin panelinden kapatılmadıysa açık (varsayılan açık) */
export async function isTelegramEnabled(): Promise<boolean> {
  if (enabledMemo && Date.now() - enabledMemo.at < 15_000) return enabledMemo.v;
  const v = (await getStore()?.get(ENABLED_KEY).catch(() => null)) !== "0";
  enabledMemo = { at: Date.now(), v };
  return v;
}

export async function setTelegramEnabled(on: boolean): Promise<void> {
  await getStore()?.set(ENABLED_KEY, on ? "1" : "0");
  enabledMemo = { at: Date.now(), v: on };
}

/** Kanala gönderilen canlı tahminler (istatistik için) */
export interface SharedPick {
  id: string; // fotmobId|label (canlı kayıttaki kimlik)
  date: string; // Türkiye günü
  fotmobId: number;
  league: string;
  home: string;
  away: string;
  label: string;
  odd: number;
  prob: number;
  confidence: number;
  minute: string;
  hg: number;
  ag: number;
  at: string;
}
export const SHARED_KEY = "tg:shared:v1";
const trDay = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);

async function addShared(s: LiveShare, now: number) {
  const list = (await getJSON<SharedPick[]>(SHARED_KEY)) ?? [];
  list.push({
    id: `${s.fotmobId}|${s.rec.label}`,
    date: trDay(now),
    fotmobId: s.fotmobId,
    league: s.league,
    home: s.home,
    away: s.away,
    label: s.rec.label,
    odd: s.rec.odd!,
    prob: s.rec.prob,
    confidence: s.rec.confidence,
    minute: s.minute,
    hg: s.hg,
    ag: s.ag,
    at: new Date(now).toISOString(),
  });
  await setJSON(SHARED_KEY, list.slice(-1000));
}

export async function loadShared(): Promise<SharedPick[]> {
  return (await getJSON<SharedPick[]>(SHARED_KEY).catch(() => null)) ?? [];
}

const COOLDOWN_KEY = "tg:cooldown";
const LAST_KEY = "tg:last";
const recKey = (s: LiveShare) => `tg:${s.fotmobId}|${s.rec.label}`;

/**
 * Eşiği geçen önerilerden en iyisini kanala gönderir.
 * - Güven ≥ eşik, gerçek iddaa canlı oranı ≥ 1.45
 * - Her öneri bir kez
 * - İki paylaşım arasında en az TELEGRAM_COOLDOWN_MIN dakika (varsayılan 30); bekleme süresinde hiçbir şey gönderilmez
 * Gönderilen sayı (0 ya da 1) döner.
 */
export async function shareLivePicks(list: LiveShare[], budgetMs = 7000, now = Date.now()): Promise<number> {
  const cfg = telegramConfig();
  const store = getStore();
  if (!cfg || !store) return 0;
  if (!(await isTelegramEnabled())) return 0; // admin panelinden durdurulmuş
  const todo = list
    .filter((s) => s.rec.confidence >= cfg.minConf && !!s.rec.odd && s.rec.odd >= LIVE_MIN_ODD)
    .sort((a, b) => b.rec.prob * b.rec.confidence - a.rec.prob * a.rec.confidence);
  if (!todo.length) return 0;

  const job = async (): Promise<number> => {
    // Bekleme süresi: son paylaşımdan bu yana yeterli zaman geçmediyse gönderme
    const last = Number(await store.get(LAST_KEY).catch(() => null)) || 0;
    if (now - last < cfg.cooldownMin * 60_000) return 0;
    // Daha önce gönderilmemiş en iyi öneri
    let pick: LiveShare | null = null;
    for (const s of todo) {
      if (!(await store.get(recKey(s)).catch(() => "x"))) {
        pick = s;
        break;
      }
    }
    if (!pick) return 0;
    // Aynı anda çalışan iki sunucudan yalnız biri gönderir
    if ((await store.incr(COOLDOWN_KEY, cfg.cooldownMin * 60).catch(() => 2)) !== 1) {
      // sayaç takılı kaldıysa (süresi dolmadan silinmediyse) temizle; bir sonraki yenilemede gönderilir
      if (now - last >= cfg.cooldownMin * 60_000 * 2) await store.reset(COOLDOWN_KEY).catch(() => {});
      return 0;
    }
    if (!(await store.setNX(recKey(pick), new Date(now).toISOString()).catch(() => false))) return 0;
    const undo = async () => {
      await store.reset(recKey(pick!)).catch(() => {});
      await store.reset(COOLDOWN_KEY).catch(() => {});
    };
    try {
      const r = await sendPhoto(cfg.token, cfg.chat, await renderShareImage(pick), shareCaption(pick));
      if (!r.ok) {
        console.error("Telegram gönderilemedi:", r.error);
        await undo(); // sonraki yenilemede tekrar denensin
        return 0;
      }
      await store.set(LAST_KEY, String(now));
      await addShared(pick, now).catch(() => {});
      return 1;
    } catch (e) {
      console.error("Telegram görseli hazırlanamadı:", (e as Error).message);
      await undo();
      return 0;
    }
  };
  return Promise.race([job(), new Promise<number>((res) => setTimeout(() => res(0), budgetMs).unref?.())]);
}
