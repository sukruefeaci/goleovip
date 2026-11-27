"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { saveTelegramSettings, setTelegramEnabled, telegramSettings } from "@/lib/telegram";
import { postPrematchResults } from "@/lib/tgPre";
import { postSharedResults, SCOPE_LABEL, shareStatsToChannel, type StatsScope } from "@/lib/tgStats";

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
  const kind = formData.get("kind") === "mac" ? "mac" : "canli";
  if (!(scope in SCOPE_LABEL)) back("Geçersiz dönem.", false);
  const r = await shareStatsToChannel(scope, kind);
  if (r.ok) back(`${SCOPE_LABEL[scope]} istatistik görseli kanalda paylaşıldı.`);
  else back(`Paylaşılamadı: ${r.error}`, false);
}

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  const num = (k: string) => Number(String(formData.get(k) ?? "").replace(",", "."));
  const minProb = Math.round(num("minProb"));
  const minOdd = Math.round(num("minOdd") * 100) / 100;
  const cooldownMin = Math.round(num("cooldownMin"));
  if (!(minProb >= 50 && minProb <= 95)) back("Kazanma olasılığı eşiği %50 ile %95 arasında olmalı.", false);
  if (!(minOdd >= 1.01 && minOdd <= 10)) back("En düşük oran 1.01 ile 10 arasında olmalı.", false);
  if (!(cooldownMin >= 0 && cooldownMin <= 600)) back("Bekleme süresi 0 ile 600 dakika arasında olmalı.", false);
  const cur = await telegramSettings();
  await saveTelegramSettings({ ...cur, minProb, minOdd, cooldownMin, results: formData.get("results") === "on" });
  back(`Ayarlar kaydedildi: olasılık ≥ %${minProb}, oran ≥ ${minOdd.toFixed(2)}, bekleme ${cooldownMin} dk.`);
}

/** Canlı paylaşımların bekleyen sonuçları */
export async function sendResultsNow() {
  await requireAdmin();
  const n = await postSharedResults(Date.now(), 20_000, true);
  back(
    n ? `${n} canlı sonuç mesajı kanala gönderildi.` : "Gönderilecek canlı sonuç yok: son 24 saatte paylaşılan ve sonucu kesinleşmiş, henüz gönderilmemiş canlı tahmin bulunamadı.",
    n > 0,
  );
}

/** Maç önü paylaşımların bekleyen sonuçları */
export async function sendPreResultsNow() {
  await requireAdmin();
  const n = await postPrematchResults(Date.now(), true);
  back(
    n ? `${n} maç önü sonuç mesajı kanala gönderildi.` : "Gönderilecek maç önü sonucu yok: son 48 saatte paylaşılan, maçı bitmiş ve sonucu henüz gönderilmemiş tahmin bulunamadı.",
    n > 0,
  );
}

export async function saveGapSettings(formData: FormData) {
  await requireAdmin();
  const num = (k: string) => Number(String(formData.get(k) ?? "").replace(",", "."));
  const minGap = Math.round(num("minGap") * 10) / 10;
  const minProb = Math.round(num("minProb"));
  if (!(minProb >= 0 && minProb <= 95)) back("Tutma ihtimali eşiği %0 ile %95 arasında olmalı.", false);
  const minOdd = Math.round(num("minOdd") * 100) / 100;
  const cooldownMin = Math.round(num("cooldownMin"));
  const hoursBefore = Math.round(num("hoursBefore"));
  if (!(minGap >= 0 && minGap <= 50)) back("En az açık %0 ile %50 arasında olmalı.", false);
  if (!(minOdd >= 1.01 && minOdd <= 20)) back("En düşük oran 1.01 ile 20 arasında olmalı.", false);
  if (!(cooldownMin >= 0 && cooldownMin <= 600)) back("Bekleme süresi 0 ile 600 dakika arasında olmalı.", false);
  if (!(hoursBefore >= 1 && hoursBefore <= 48)) back("Maça kalan süre 1 ile 48 saat arasında olmalı.", false);
  const cur = await telegramSettings();
  const enabled = formData.get("enabled") === "on";
  await saveTelegramSettings({ ...cur, gap: { enabled, minGap, minProb, minOdd, cooldownMin, hoursBefore } });
  back(
    enabled
      ? `Oran açığı paylaşımı açık: açık ≥ %${minGap}, yurt dışına göre tutma > %${minProb}, oran ≥ ${minOdd.toFixed(2)}, maça ${hoursBefore} saat kala, bekleme ${cooldownMin} dk.`
      : "Oran açığı paylaşımı kapatıldı.",
  );
}

export async function savePreSettings(formData: FormData) {
  await requireAdmin();
  const num = (k: string) => Number(String(formData.get(k) ?? "").replace(",", "."));
  const minProb = Math.round(num("minProb"));
  const minOdd = Math.round(num("minOdd") * 100) / 100;
  const cooldownMin = Math.round(num("cooldownMin"));
  const hoursBefore = Math.round(num("hoursBefore"));
  if (!(minProb >= 50 && minProb <= 95)) back("Kazanma olasılığı eşiği %50 ile %95 arasında olmalı.", false);
  if (!(minOdd >= 1.01 && minOdd <= 10)) back("En düşük oran 1.01 ile 10 arasında olmalı.", false);
  if (!(cooldownMin >= 0 && cooldownMin <= 600)) back("Bekleme süresi 0 ile 600 dakika arasında olmalı.", false);
  if (!(hoursBefore >= 1 && hoursBefore <= 36)) back("Maça kalan süre 1 ile 36 saat arasında olmalı.", false);
  const cur = await telegramSettings();
  const enabled = formData.get("enabled") === "on";
  await saveTelegramSettings({ ...cur, pre: { enabled, minProb, minOdd, cooldownMin, hoursBefore, results: formData.get("results") === "on" } });
  back(
    enabled
      ? `Maç önü paylaşımı açık: olasılık ≥ %${minProb}, oran ≥ ${minOdd.toFixed(2)}, maça ${hoursBefore} saat kala, bekleme ${cooldownMin} dk.`
      : "Maç önü paylaşımı kapatıldı.",
  );
}
