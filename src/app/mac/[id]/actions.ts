"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { loadAnalyses } from "@/lib/data";
import { sharePrematchNow } from "@/lib/tgPre";

/** Admin: bu maçın maç önü tercihini kanalda hemen paylaş */
export async function shareMatchToChannel(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const back = `/mac/${encodeURIComponent(id)}`;
  if (!isAdmin(await currentUser())) redirect(back);
  const a = (await loadAnalyses()).analyses.find((x) => x.match.id === id);
  if (!a) redirect(`${back}?tg=${encodeURIComponent("Maç bulunamadı")}`);
  const r = await sharePrematchNow(a);
  redirect(`${back}?tg=${encodeURIComponent(r.ok ? "ok" : `Gönderilemedi: ${r.error ?? "bilinmeyen hata"}`)}`);
}
