"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { setTelegramEnabled } from "@/lib/telegram";
import { SCOPE_LABEL, shareStatsToChannel, type StatsScope } from "@/lib/tgStats";

async function requireAdmin() {
  if (!isAdmin(await currentUser())) redirect("/admin");
}

const back = (msg: string, ok = true) => redirect(`/admin?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function toggleTelegram(formData: FormData) {
  await requireAdmin();
  const on = formData.get("on") === "1";
  await setTelegramEnabled(on);
  back(on ? "Telegram paylaşımı açıldı." : "Telegram paylaşımı durduruldu. Canlı sekmesi açılsa bile kanala gönderilmeyecek.");
}

export async function shareStats(formData: FormData) {
  await requireAdmin();
  const scope = String(formData.get("scope")) as StatsScope;
  if (!(scope in SCOPE_LABEL)) back("Geçersiz dönem.", false);
  const r = await shareStatsToChannel(scope);
  if (r.ok) back(`${SCOPE_LABEL[scope]} istatistik görseli kanalda paylaşıldı.`);
  else back(`Paylaşılamadı: ${r.error}`, false);
}
