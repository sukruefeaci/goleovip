import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";

export const dynamic = "force-dynamic";

/** Tek maçın tam analizi (JSON) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getProvider().getMatch(id);
  if (!m) return NextResponse.json({ error: "Maç bulunamadı" }, { status: 404 });
  return NextResponse.json(analyze(m));
}
