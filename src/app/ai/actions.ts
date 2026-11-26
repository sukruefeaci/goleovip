"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { rebuildCalibrationNow } from "@/lib/calibration";

export async function rebuildCalibration() {
  if (!isAdmin(await currentUser())) redirect("/ai");
  await rebuildCalibrationNow();
  redirect(`/ai?ok=${encodeURIComponent("Karne yeniden hesaplandı.")}`);
}
