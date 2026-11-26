"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { loadLive } from "@/lib/liveData";
import { shareLiveNow } from "@/lib/telegram";

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
