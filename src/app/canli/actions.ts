"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { loadLive } from "@/lib/liveData";
import { sendPhoto, shareLiveNow, telegramConfig, type SharedPick } from "@/lib/telegram";
import { loadLiveDay } from "@/lib/liveTracking";
import { getStore } from "@/lib/auth/store";
import { renderResultImage, resultCaption } from "@/lib/tgStats";

/** Admin: canlı tercihi kanalda hemen paylaş */
export async function shareLiveToChannel(formData: FormData) {
  if (!isAdmin(await currentUser())) redirect("/canli");
  const id = Number(formData.get("id"));
  const label = String(formData.get("label") ?? "");
  const { items } = await loadLive();
  const it = items.find((x) => x.id === id);
  const rec = it?.model.probs.find((b) => b.label === label);
  if (!it || !rec) redirect(`/canli?tg=${encodeURIComponent("Gönderilemedi: maç ya da tercih artık yok (maç bitmiş olabilir)")}`);
  const r = await shareLiveNow({
    fotmobId: it.id,
    league: it.league,
    home: it.home,
    away: it.away,
    hg: it.hg,
    ag: it.ag,
    minute: it.minuteLabel,
    tempo: it.model.tempo.label,
    stats: it.stats,
    rec,
  });
  redirect(`/canli?tg=${encodeURIComponent(r.ok ? "ok" : `Gönderilemedi: ${r.error ?? "bilinmeyen hata"}`)}`);
}

/**
 * Admin: takip listesindeki bir canlı öneriyi kanalda paylaş.
 * Sonucu belliyse sonuç kartı (kazandı / kaybetti); bekliyorsa maç sürüyorsa güncel canlı kart, değilse kayıttaki anla.
 */
export async function shareLiveRecord(formData: FormData) {
  if (!isAdmin(await currentUser())) redirect("/canli");
  const date = String(formData.get("date") ?? "");
  const id = String(formData.get("rid") ?? "");
  const gun = formData.get("gun") === "dun" ? "&gun=dun" : "";
  const done = (m: string) => redirect(`/canli?tg=${encodeURIComponent(m)}${gun}`);
  const r = (await loadLiveDay(date)).find((x) => `${x.fotmobId}|${x.label}` === id);
  if (!r) return done("Gönderilemedi: kayıt bulunamadı");

  const cfg = telegramConfig();
  const store = getStore();
  if (!cfg || !store) return done("Gönderilemedi: Telegram ya da veritabanı ayarlı değil");

  if (r.result && typeof r.result.won === "boolean") {
    // Sonuç kartı (bir kez)
    if (!(await store.setNX(`tg:res:${id}`, new Date().toISOString()).catch(() => false))) return done("Gönderilemedi: bu sonuç zaten paylaşıldı");
    const pick: SharedPick = {
      id,
      date,
      fotmobId: r.fotmobId,
      league: r.league,
      home: r.home,
      away: r.away,
      label: r.label,
      odd: r.odd ?? 0,
      prob: r.prob,
      confidence: r.confidence,
      minute: r.minute,
      hg: r.hg,
      ag: r.ag,
      at: r.at,
    };
    const res = { pick, won: r.result.won, hg: r.result.hg, ag: r.result.ag, early: !!r.result.early };
    try {
      const s = await sendPhoto(cfg.token, cfg.chat, await renderResultImage(res), resultCaption(res));
      if (!s.ok) throw new Error(s.error);
    } catch (e) {
      await store.reset(`tg:res:${id}`).catch(() => {});
      return done(`Gönderilemedi: ${(e as Error).message}`);
    }
    return done("ok");
  }

  // Bekleyen öneri: maç sürüyorsa güncel kart
  const { items } = await loadLive();
  const it = items.find((x) => x.id === r.fotmobId);
  const rec = it?.model.probs.find((b) => b.label === r.label);
  const s = await shareLiveNow(
    it && rec
      ? { fotmobId: it.id, league: it.league, home: it.home, away: it.away, hg: it.hg, ag: it.ag, minute: it.minuteLabel, tempo: it.model.tempo.label, stats: it.stats, rec }
      : {
          fotmobId: r.fotmobId,
          league: r.league,
          home: r.home,
          away: r.away,
          hg: r.hg,
          ag: r.ag,
          minute: r.minute,
          tempo: "—",
          stats: {},
          rec: { label: r.label, prob: r.prob, confidence: r.confidence, kind: r.kind, spec: r.spec, odd: r.odd },
        },
  );
  return done(s.ok ? "ok" : `Gönderilemedi: ${s.error ?? "bilinmeyen hata"}`);
}
