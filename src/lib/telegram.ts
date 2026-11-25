import { createElement as h, type CSSProperties, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "./auth/store";
import type { LiveBet, LiveStats } from "./liveModel";

/**
 * Canlı bölümünde güveni yüksek (varsayılan ≥ %70) bir öneri çıkınca görsel kart hazırlayıp Telegram kanalına gönderir.
 * Ayarlar (Vercel → Environment Variables):
 *   TELEGRAM_BOT_TOKEN  BotFather'dan alınan bot anahtarı (gizli)
 *   TELEGRAM_CHAT_ID    kanal adı (@kanal) ya da sayısal kimlik
 *   TELEGRAM_MIN_CONF   isteğe bağlı eşik (varsayılan 70)
 * Aynı maç + aynı öneri bir kez gönderilir (veritabanında tg: anahtarı).
 */

export function telegramConfig(): { token: string; chat: string; minConf: number } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return null;
  const m = Number(process.env.TELEGRAM_MIN_CONF);
  return { token, chat, minConf: Number.isFinite(m) && m > 0 ? m : 70 };
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
async function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const [r, b] = await Promise.all([readFile(path.join(dir, "Inter-Regular.otf")), readFile(path.join(dir, "Inter-Bold.otf"))]);
  fonts = [
    { name: "Inter", data: r, weight: 400, style: "normal" },
    { name: "Inter", data: b, weight: 700, style: "normal" },
  ];
  return fonts;
}

const C = { bg: "#0b0b1a", card: "#15152b", line: "#2a2a4a", text: "#ecebff", muted: "#9a98c6", accent: "#7c5cff", good: "#22c493", gold: "#f5c542" };

const div = (style: CSSProperties, ...children: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...children);

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

/** Eşiği geçen yeni önerileri kanala gönderir (her öneri bir kez). Gönderilen sayı döner. */
export async function shareLivePicks(list: LiveShare[], budgetMs = 7000): Promise<number> {
  const cfg = telegramConfig();
  const store = getStore();
  if (!cfg || !store) return 0;
  const todo = list.filter((s) => s.rec.confidence >= cfg.minConf);
  if (!todo.length) return 0;
  let sent = 0;
  const job = (async () => {
    for (const s of todo) {
      // aynı öneri ikinci kez gönderilmez (birden fazla sunucu aynı anda çalışsa bile)
      const fresh = await store.setNX(`tg:${s.fotmobId}|${s.rec.label}`, new Date().toISOString()).catch(() => false);
      if (!fresh) continue;
      try {
        const png = await renderShareImage(s);
        const r = await sendPhoto(cfg.token, cfg.chat, png, shareCaption(s));
        if (r.ok) sent++;
        else {
          console.error("Telegram gönderilemedi:", r.error);
          await store.reset(`tg:${s.fotmobId}|${s.rec.label}`).catch(() => {}); // sonraki yenilemede tekrar denensin
        }
      } catch (e) {
        console.error("Telegram görseli hazırlanamadı:", (e as Error).message);
        await store.reset(`tg:${s.fotmobId}|${s.rec.label}`).catch(() => {});
      }
    }
  })();
  await Promise.race([job, new Promise((res) => setTimeout(res, budgetMs).unref?.())]);
  return sent;
}
