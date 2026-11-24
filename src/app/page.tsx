import Link from "next/link";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";
import { kickoffParts, pct, signedPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const matches = await getProvider().listMatches();
  const analyses = matches
    .map(analyze)
    .sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));

  const banner = analyses[0]?.match.warnings.find((w) => w.startsWith("Canlı"));

  return (
    <>
      {banner && <div className="warn">⚠ {banner}</div>}
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Maçlar</h2>
        <span className="muted small">Veri kaynağı: {getProvider().name}</span>
      </div>
      <div className="match-list">
        {analyses.map((a) => {
          const k = kickoffParts(a.match.kickoff);
          const good = a.rows.filter((r) => r.rating === "Avantajlı");
          const best = [...a.rows].sort((x, y) => y.evConservative - x.evConservative)[0];
          return (
            <Link key={a.match.id} href={`/mac/${a.match.id}`} className="panel match-card">
              <div>
                <div className="mc-time">{k.time}</div>
                <div className="muted small">{k.date}</div>
              </div>
              <div>
                <div className="muted small">{a.match.league}</div>
                <div className="teams">
                  {a.match.home.name} – {a.match.away.name}
                </div>
                <div className="muted small">
                  Model {pct(a.model1x2[0], 0)} / {pct(a.model1x2[1], 0)} / {pct(a.model1x2[2], 0)} · iddaa marjı{" "}
                  {a.iddaaMargin !== null ? pct(a.iddaaMargin) : "—"}
                </div>
              </div>
              <div className="stat">
                <div className={good.length ? "pos" : "muted"}>{good.length} avantajlı</div>
                {best && (
                  <div className="muted small">
                    En iyi: {best.market} {best.selection} @{best.odd.toFixed(2)} ({signedPct(best.evConservative)})
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
