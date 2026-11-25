import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { adminEmails, isAdmin } from "@/lib/admin";
import { renderShareImage, sendPhoto, shareCaption, telegramConfig, type LiveShare } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Admin (tanımlı değilse giriş yapmış kullanıcı) için: kanala örnek bir canlı tercih kartı gönderir (kurulumu denemek için) */
export async function GET() {
  // Admin tanımlıysa yalnız admin deneme gönderebilir
  if (adminEmails().length && !isAdmin(await currentUser())) return NextResponse.json({ ok: false, error: "Yetki yok" }, { status: 403 });
  const cfg = telegramConfig();
  if (!cfg) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID ayarlı değil" }, { status: 503 });
  const sample: LiveShare = {
    fotmobId: 0,
    league: "DENEME MESAJI",
    home: "Ev Sahibi",
    away: "Deplasman",
    hg: 1,
    ag: 0,
    minute: "62'",
    tempo: "Yüksek",
    stats: { xg: [1.42, 0.61], shots: [11, 5], sot: [5, 2], poss: [58, 42] },
    rec: { label: "MS 1.5 Üst", prob: 0.74, confidence: 76, kind: "MS A/Ü", spec: { t: "ouFT", line: 1.5, over: true }, odd: 1.62, ev: 0.199 },
  };
  const r = await sendPhoto(cfg.token, cfg.chat, await renderShareImage(sample), `🧪 <b>Deneme</b> — goleo VIP Telegram bağlantısı çalışıyor.\n\n${shareCaption(sample)}`);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
