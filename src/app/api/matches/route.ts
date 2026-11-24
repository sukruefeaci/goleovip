import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";

export const dynamic = "force-dynamic";

/** Tüm maçların özet analizi (JSON) */
export async function GET() {
  const matches = await getProvider().listMatches();
  return NextResponse.json(
    matches.map((m) => {
      const a = analyze(m);
      return {
        id: m.id,
        league: m.league,
        kickoff: m.kickoff,
        home: m.home.name,
        away: m.away.name,
        model1x2: a.model1x2,
        iddaaMargin: a.iddaaMargin,
        advantageous: a.rows.filter((r) => r.rating === "Avantajlı").length,
      };
    }),
  );
}
