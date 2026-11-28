import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { parseKind, renderStatsImage, SCOPE_LABEL, sharedStats, type StatsKind, type StatsScope } from "@/lib/tgStats";

export const dynamic = "force-dynamic";

/** Admin paneli için istatistik görseli önizlemesi */
export async function GET(req: NextRequest) {
  if (!isAdmin(await currentUser())) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  const d = req.nextUrl.searchParams.get("d") ?? "bugun";
  const scope: StatsScope = d in SCOPE_LABEL ? (d as StatsScope) : "bugun";
  const kind: StatsKind = parseKind(req.nextUrl.searchParams.get("t"));
  const png = await renderStatsImage(await sharedStats(scope, Date.now(), kind));
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
